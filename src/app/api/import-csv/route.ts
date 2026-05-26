import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import Busboy from 'busboy';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';
// 200k rows at ~5ms/row single-insert = ~1000s. Batch inserts are 50-100x faster,
// so 300s is ample for a 200MB CSV.
export const maxDuration = 300;

/**
 * Streams a multipart/form-data request body using busboy — completely bypassing
 * Next.js's built-in body-size limit (which blocks files >4 MB via req.formData()).
 * Returns { fields, files } where files[name] is a Buffer.
 */
async function parseMultipart(req: NextRequest): Promise<{
    fields: Record<string, string>;
    files: Record<string, { buffer: Buffer; filename: string; mimetype: string }>;
}> {
    const contentType = req.headers.get('content-type') || '';
    const bb = Busboy({ headers: { 'content-type': contentType }, limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB hard cap
    const fields: Record<string, string> = {};
    const files: Record<string, { buffer: Buffer; filename: string; mimetype: string }> = {};

    return new Promise((resolve, reject) => {
        bb.on('field', (name, val) => { fields[name] = val; });
        bb.on('file', (name, stream, info) => {
            const chunks: Buffer[] = [];
            stream.on('data', (d: Buffer) => chunks.push(d));
            stream.on('end', () => { files[name] = { buffer: Buffer.concat(chunks), filename: info.filename, mimetype: info.mimeType }; });
            stream.on('error', reject);
        });
        bb.on('close', () => resolve({ fields, files }));
        bb.on('error', reject);

        // Pipe the Web ReadableStream into busboy (a Node.js Writable)
        if (!req.body) { reject(new Error('No request body')); return; }
        const nodeStream = Readable.fromWeb(req.body as any);
        nodeStream.pipe(bb);
    });
}


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

        // Use streaming busboy parser — bypasses Next.js's 4 MB body-size cap
        const { fields, files } = await parseMultipart(req);
        const projectId = fields['projectId'];
        const tableName  = fields['tableName'];
        const csvFileRaw = files['csvFile'];
        const excludedRaw = fields['excludedColumns'];
        let excludedColumns: string[] = [];
        try {
            if (excludedRaw) excludedColumns = JSON.parse(excludedRaw);
        } catch {}

        if (!projectId || !tableName || !csvFileRaw) {
            return NextResponse.json(
                { error: 'Missing required fields: projectId, tableName, csvFile' },
                { status: 400 }
            );
        }

        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
            return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
        }

        const csvText = csvFileRaw.buffer.toString('utf-8');
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
            // Map column_name → has a server-side default (e.g. gen_random_uuid(), now())
            const columnHasDefault = new Map<string, boolean>(
                colResult.rows.map((r: any) => [r.column_name as string, !!(r.column_default)])
            );

            // Map CSV headers to actual table columns (case-insensitive).
            // We include 'id' / '_id' columns — if the CSV provides a real value we use it.
            // Empty id values are handled at row-level: if the column has a server default
            // we omit it so the DB auto-generates; otherwise we pass null and let the DB error surface.
            const headerToTableCol: Record<string, string> = {};
            for (const h of headers) {
                if (excludedColumns.includes(h)) continue;
                const lh = h.toLowerCase();
                const match = tableColumnNames.find(tc => tc.toLowerCase() === lh);
                if (match) headerToTableCol[h] = match;
            }

            insertableHeaders = Object.keys(headerToTableCol);

            if (insertableHeaders.length === 0) {
                return NextResponse.json({
                    error: `No matching columns found. CSV headers: [${headers.join(', ')}]. Table columns: [${tableColumnNames.join(', ')}].`
                }, { status: 400 });
            }

            // Build per-row column lists: if a column has a server default AND its value is
            // empty/null in this row, omit it from the INSERT so the default fires.


            // Collect valid rows (skip blanks).
            // Each row is stored as { cols: string[], vals: (string|null)[] }
            // where columns with server defaults are omitted when their value is null/empty.
            type ImportRow = { cols: string[]; vals: (string | null)[] };
            const validRows: ImportRow[] = [];

            for (const rawValues of dataRows) {
                if (rawValues.length === 0 || (rawValues.length === 1 && rawValues[0] === '')) continue;

                const rowCols: string[] = [];
                const rowVals: (string | null)[] = [];

                for (const h of insertableHeaders) {
                    const csvIdx = headers.indexOf(h);
                    const raw = csvIdx === -1 ? '' : (rawValues[csvIdx] ?? '').replace(/^"|"$/g, '').trim();
                    const val = raw === '' ? null : raw;
                    const tableCol = headerToTableCol[h];

                    // If column has a server default AND this value is empty, skip it
                    // so the DB auto-generates (handles id, created_at, etc.)
                    if (val === null && columnHasDefault.get(tableCol)) continue;

                    rowCols.push(`"${tableCol}"`);
                    rowVals.push(val);
                }

                if (rowCols.length > 0) validRows.push({ cols: rowCols, vals: rowVals });
            }

            await client.query('BEGIN');

            // ── Batched multi-row INSERT with SAVEPOINT isolation ──────────────
            // Because rows may have different column sets (e.g., some have explicit id, some don't)
            // we group rows by their column signature, then batch each group.
            // Fallback: row-by-row with SAVEPOINTs for error isolation.
            let savepointIdx = 0;

            // Group rows by column signature for efficient batching
            const groups = new Map<string, ImportRow[]>();
            for (const row of validRows) {
                const sig = row.cols.join(',');
                if (!groups.has(sig)) groups.set(sig, []);
                groups.get(sig)!.push(row);
            }

            for (const [, groupRows] of groups) {
                const quotedCols = groupRows[0].cols.join(', ');
                const colCount = groupRows[0].cols.length;
                for (let batchStart = 0; batchStart < groupRows.length; batchStart += BATCH_SIZE) {
                    const batch = groupRows.slice(batchStart, batchStart + BATCH_SIZE);
                    const flatParams: (string | null)[] = [];
                    const valueClauses: string[] = [];

                    for (let r = 0; r < batch.length; r++) {
                        const vals = batch[r].vals;
                        const placeholders = vals.map((_, c) => `$${r * colCount + c + 1}`).join(', ');
                        valueClauses.push(`(${placeholders})`);
                        flatParams.push(...vals);
                    }

                    const batchSp = `sp_batch_${savepointIdx++}`;
                    await client.query(`SAVEPOINT ${batchSp}`);

                    const sql = `INSERT INTO "${schemaName}"."${tableName}" (${quotedCols}) VALUES ${valueClauses.join(', ')}`;

                    try {
                        await client.query(sql, flatParams);
                        await client.query(`RELEASE SAVEPOINT ${batchSp}`);
                        importedCount += batch.length;
                    } catch {
                        // Batch failed — rollback to clear aborted state, retry row-by-row
                        await client.query(`ROLLBACK TO SAVEPOINT ${batchSp}`);
                        await client.query(`RELEASE SAVEPOINT ${batchSp}`);

                        for (let r = 0; r < batch.length; r++) {
                            const vals = batch[r].vals;
                            const rowCols = batch[r].cols.join(', ');
                            const placeholders = vals.map((_, c) => `$${c + 1}`).join(', ');
                            const rowSql = `INSERT INTO "${schemaName}"."${tableName}" (${rowCols}) VALUES (${placeholders})`;
                            const rowSp = `sp_row_${savepointIdx++}`;

                            await client.query(`SAVEPOINT ${rowSp}`);
                            try {
                                await client.query(rowSql, vals);
                                await client.query(`RELEASE SAVEPOINT ${rowSp}`);
                                importedCount++;
                            } catch (rowErr: any) {
                                await client.query(`ROLLBACK TO SAVEPOINT ${rowSp}`);
                                await client.query(`RELEASE SAVEPOINT ${rowSp}`);
                                const absoluteRowNum = batchStart + r + 2;
                                errors.push(`Row ${absoluteRowNum}: ${rowErr.message.split('\n')[0]}`);
                                if (errors.length >= 50) break;
                            }
                            if (errors.length >= 50) break;
                        }
                    }

                    if (errors.length >= 50) break;
                } // end batchStart loop
                if (errors.length >= 50) break;
            } // end groups loop


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
