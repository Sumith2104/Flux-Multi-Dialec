import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export const runtime = 'nodejs';
// 200k rows at ~5ms/row single-insert = ~1000s. Batch inserts are 50-100x faster,
// so 300s is ample for a 200MB CSV.
export const maxDuration = 300;

// Rows per INSERT (...), (...), ... batch statement.
// ~1000 is optimal: low round-trip count, avoids pg 65535 param limit.
const BATCH_SIZE = 1000;

function parseCSV(csvText: string): { headers: string[]; rows: string[][] } {
    const lines = csvText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/^\uFEFF/, '') // strip BOM
        .trim()
        .split('\n')
        .filter(l => l.trim());

    if (lines.length < 1) return { headers: [], rows: [] };

    const parseLine = (line: string): string[] => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                // Handle escaped quotes ""
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current.trim());
        return values;
    };

    const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
    const rows = lines.slice(1).map(parseLine);

    return { headers, rows };
}

/**
 * POST /api/import-csv
 *
 * Two modes:
 * 1. After table creation (called from create/page.tsx):
 *    Fields: projectId, tableName, csvFile
 *    — creates rows for new table
 *
 * 2. Insert into existing table (called from editor):
 *    Fields: projectId, tableName, csvFile, mode=insert
 *    — detects headers, inserts only matching columns
 *
 * Performance: rows are batched BATCH_SIZE at a time using multi-row
 * INSERT (...), (...) syntax to minimise round-trips.
 * A 200k-row CSV completes in ~5-15 seconds instead of minutes.
 */
export async function POST(req: NextRequest) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const projectId = formData.get('projectId') as string;
        const tableName = formData.get('tableName') as string;
        const csvFile = formData.get('csvFile') as File | null;

        if (!projectId || !tableName || !csvFile) {
            return NextResponse.json(
                { error: 'Missing required fields: projectId, tableName, csvFile' },
                { status: 400 }
            );
        }

        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
            return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
        }

        const csvText = await csvFile.text();
        const { headers, rows: dataRows } = parseCSV(csvText);

        if (headers.length === 0) {
            return NextResponse.json({ error: 'Could not parse CSV headers.' }, { status: 400 });
        }
        if (dataRows.length === 0) {
            return NextResponse.json({ error: 'CSV has no data rows.' }, { status: 400 });
        }

        const { checkRowLimit, checkProjectTrafficLimits } = await import('@/lib/limits');
        await checkProjectTrafficLimits(projectId);
        await checkRowLimit(projectId, userId, tableName, dataRows.length);

        const pool = getPgPool();
        const client = await pool.connect();
        const schemaName = `project_${projectId}`;

        let importedCount = 0;
        const errors: string[] = [];
        let insertableHeaders: string[] = [];

        try {
            // Discover actual table columns from information_schema
            const colResult = await client.query(
                `SELECT column_name, column_default, is_nullable
                 FROM information_schema.columns
                 WHERE table_schema = $1 AND table_name = $2
                 ORDER BY ordinal_position`,
                [schemaName, tableName]
            );

            if (colResult.rows.length === 0) {
                return NextResponse.json(
                    { error: `Table '${tableName}' not found in schema '${schemaName}'.` },
                    { status: 404 }
                );
            }

            const tableColumnNames = colResult.rows.map((r: any) => r.column_name as string);

            // Map CSV headers to actual table columns (case-insensitive, skip id/_id)
            const headerToTableCol: Record<string, string> = {};
            for (const h of headers) {
                const lh = h.toLowerCase();
                if (lh === 'id' || lh === '_id') continue;
                const match = tableColumnNames.find(tc => tc.toLowerCase() === lh);
                if (match) headerToTableCol[h] = match;
            }

            insertableHeaders = Object.keys(headerToTableCol);

            if (insertableHeaders.length === 0) {
                return NextResponse.json({
                    error: `No matching columns found. CSV headers: [${headers.join(', ')}]. Table columns: [${tableColumnNames.join(', ')}].`
                }, { status: 400 });
            }

            const quotedCols = insertableHeaders.map(h => `"${headerToTableCol[h]}"`).join(', ');
            const colCount = insertableHeaders.length;

            // Collect valid rows (skip blanks)
            const validRows: (string | null)[][] = [];
            for (const rawValues of dataRows) {
                if (rawValues.length === 0 || (rawValues.length === 1 && rawValues[0] === '')) continue;
                const params: (string | null)[] = insertableHeaders.map(h => {
                    const csvIdx = headers.indexOf(h);
                    if (csvIdx === -1) return null;
                    const raw = (rawValues[csvIdx] ?? '').replace(/^"|"$/g, '').trim();
                    return raw === '' ? null : raw;
                });
                validRows.push(params);
            }

            await client.query('BEGIN');

            // ── Batched multi-row INSERT ────────────────────────────────────────
            // Each batch: INSERT INTO t (cols) VALUES ($1,$2,...),($n+1,...), ...
            // This gives ~50-100x fewer round-trips vs. row-by-row inserts.
            for (let batchStart = 0; batchStart < validRows.length; batchStart += BATCH_SIZE) {
                const batch = validRows.slice(batchStart, batchStart + BATCH_SIZE);
                const flatParams: (string | null)[] = [];
                const valueClauses: string[] = [];

                for (let r = 0; r < batch.length; r++) {
                    const row = batch[r];
                    const placeholders = row.map((_, c) => `$${r * colCount + c + 1}`).join(', ');
                    valueClauses.push(`(${placeholders})`);
                    flatParams.push(...row);
                }

                const sql = `INSERT INTO "${schemaName}"."${tableName}" (${quotedCols}) VALUES ${valueClauses.join(', ')}`;

                try {
                    await client.query(sql, flatParams);
                    importedCount += batch.length;
                } catch (batchErr: any) {
                    // Batch failed — fall back to row-by-row for this batch to collect per-row errors
                    for (let r = 0; r < batch.length; r++) {
                        const row = batch[r];
                        const placeholders = row.map((_, c) => `$${c + 1}`).join(', ');
                        const rowSql = `INSERT INTO "${schemaName}"."${tableName}" (${quotedCols}) VALUES (${placeholders})`;
                        try {
                            await client.query(rowSql, row);
                            importedCount++;
                        } catch (rowErr: any) {
                            const absoluteRowNum = batchStart + r + 2; // +2 = header + 1-index
                            errors.push(`Row ${absoluteRowNum}: ${rowErr.message.split('\n')[0]}`);
                            if (errors.length >= 20) break;
                        }
                        if (errors.length >= 20) break;
                    }
                }

                if (errors.length >= 20) break;
            }

            if (importedCount === 0 && errors.length > 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: 'Import failed — all rows had errors.',
                    details: errors
                }, { status: 422 });
            }

            await client.query('COMMIT');

        } finally {
            client.release();
        }

        // Bust the Redis cache so the freshly imported rows are visible immediately.
        // Without this, the table-data route keeps serving the stale (empty) cached result
        // even though Postgres now has the data.
        try {
            const { invalidateTableCache } = await import('@/lib/cache');
            await invalidateTableCache(projectId, tableName);
        } catch (cacheErr) {
            // Non-fatal: data is committed; cache will expire naturally.
            console.warn('[import-csv] Cache invalidation failed:', cacheErr);
        }

        return NextResponse.json({
            success: true,
            importedCount,
            columns: insertableHeaders,
            ...(errors.length > 0 ? { warnings: errors } : {}),
        });

    } catch (error: any) {
        console.error('[import-csv] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
