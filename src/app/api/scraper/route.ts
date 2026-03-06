import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { SqlEngine } from '@/lib/sql-engine';
import { getProjectById } from '@/lib/data';
import * as cheerio from 'cheerio';

export async function POST(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        let { projectId, url, targetTable, mappings } = body;

        if (auth.allowedProjectId && projectId !== auth.allowedProjectId) {
            projectId = auth.allowedProjectId;
        }

        if (!projectId || !url || !targetTable || !mappings || mappings.length === 0) {
            return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
        }

        const project = await getProjectById(projectId, auth.userId);
        if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });

        // 1. Fetch HTML securely
        console.log(`[Scraper] Initiating HTTP request to target URL: ${url}`);
        const fetchResponse = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            },
            cache: 'no-store'
        });

        if (!fetchResponse.ok) {
            return NextResponse.json({ success: false, error: `Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}` }, { status: 400 });
        }

        const html = await fetchResponse.text();
        const $ = cheerio.load(html);

        // 2. Extract Data via CSS Selectors
        // Convert node arrays into extracted text sequences bound by the mapped column names
        const extractedArrays: Record<string, string[]> = {};
        let maxRowDepth = 0;

        for (const map of mappings) {
            const arr: string[] = [];
            $(map.selector).each((_, el) => {
                arr.push($(el).text().trim());
            });
            extractedArrays[map.column] = arr;
            if (arr.length > maxRowDepth) {
                maxRowDepth = arr.length;
            }
        }

        if (maxRowDepth === 0) {
            return NextResponse.json({ success: false, error: `Pipeline executed, but found 0 matching nodes for the provided CSS selectors.` });
        }

        // 3. Zip sequential node depths into unified row objects dynamically
        const rowsToInsert: any[] = [];
        for (let i = 0; i < maxRowDepth; i++) {
            const row: any = {};
            let hasSufficientData = false;

            for (const map of mappings) {
                const val = extractedArrays[map.column][i] || null;
                row[map.column] = val;
                if (val && val.length > 0) hasSufficientData = true;
            }
            if (hasSufficientData) {
                rowsToInsert.push(row);
            }
        }

        if (rowsToInsert.length === 0) {
            return NextResponse.json({ success: false, error: `Node extraction succeeded but all parsed rows evaluated back to pure nulls.` });
        }

        // 4. Insert directly into Tenant Database Namespace using SqlEngine 
        console.log(`[Scraper] Starting data mutation into ${project.dialect} instance (${rowsToInsert.length} documents)`);
        const engine = new SqlEngine(projectId, auth.userId);

        // Parameter substitution injection arrays
        const paramNames = mappings.map((m: any) => m.column);

        // Strip out dangerous SQL characters from the literal table name payload just in case (e.g trailing DROP statements overriding)
        const cleanTableTarget = targetTable.replace(/[^a-zA-Z0-9_]/g, '');

        let successInsertedCount = 0;

        if (project.dialect === 'postgres') {
            // High-throughput Postgres bulk array insertions tracking positional bind variables $1..$n
            const dbCols = paramNames.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(', ');

            const valueStrings = rowsToInsert.map((row, rIdx) => {
                const offset = rIdx * paramNames.length;
                return '(' + paramNames.map((_, cIdx) => `$${offset + cIdx + 1}`).join(', ') + ')';
            }).join(', ');

            const flatValues = rowsToInsert.flatMap(row => paramNames.map((c: string) => row[c]));
            const query = `INSERT INTO "${cleanTableTarget}" (${dbCols}) VALUES ${valueStrings};`;

            await engine.execute(query, flatValues);
            successInsertedCount = rowsToInsert.length;

        } else {
            // MySQL localized scalar iterations using parameterized ? structures
            for (const row of rowsToInsert) {
                const placeholders = paramNames.map(() => '?').join(', ');
                const values = paramNames.map((c: string) => row[c]);

                const dbCols = paramNames.map((c: string) => `\`${c.replace(/`/g, '``')}\``).join(', ');
                const query = `INSERT INTO \`${cleanTableTarget}\` (${dbCols}) VALUES (${placeholders});`;

                await engine.execute(query, values);
                successInsertedCount++;
            }
        }

        // Pipeline success routing containing sample preview chunks
        return NextResponse.json({
            success: true,
            insertedRows: successInsertedCount,
            data: rowsToInsert.slice(0, 10)
        });

    } catch (error: any) {
        console.error('[Scraper API Orchestrator Error]', error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Scraper System Fault' }, { status: 500 });
    }
}
