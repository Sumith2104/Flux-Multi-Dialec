import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { getProjectById } from '@/lib/data';

export const maxDuration = 60; // Allow scrapers up to 60 seconds

export async function POST(request: Request, context: any) {
    const startTime = Date.now();
    let browser;
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const params = await context.params;
        const scraperId = params.scraperId;

        if (!scraperId) return NextResponse.json({ success: false, error: 'scraperId is required' }, { status: 400 });

        const pool = getPgPool();

        // 1. Fetch Config
        const { rows } = await pool.query(`SELECT * FROM fluxbase_global.fluxbase_scrapers WHERE scraper_id = $1 AND user_id = $2`, [scraperId, auth.userId]);
        if (rows.length === 0) return NextResponse.json({ success: false, error: 'Scraper job not found' }, { status: 404 });

        const job = rows[0];
        const { target_url, target_table, project_id, selectors } = job;
        if (!selectors?.item) throw new Error("Invalid CSS selectors: missing 'item' container");

        // 2. Headless Browser Fetching
        console.log(`[Native Scraper] Launching Chromium for ${target_url}...`);
        browser = await chromium.launch({ headless: true });
        const ctx = await browser.newContext();
        const page = await ctx.newPage();

        await page.goto(target_url, { waitUntil: 'networkidle', timeout: 45000 });
        const html = await page.content();
        await browser.close();

        // 3. Fast HTML Parsing
        console.log(`[Native Scraper] Parsing HTML...`);
        const $ = cheerio.load(html);
        const extractedData: any[] = [];
        const extractKeys = Object.keys(selectors).filter(k => k !== 'item');

        $(selectors.item).each((_, element) => {
            let row: any = {};
            for (const key of extractKeys) {
                row[key] = $(element).find(selectors[key]).text().trim();
            }
            if (Object.keys(row).length > 0) extractedData.push(row);
        });

        const rowsExtracted = extractedData.length;
        console.log(`[Native Scraper] Extracted ${rowsExtracted} rows. Proceeding to Ingestion...`);

        if (rowsExtracted > 0) {
            // 4. Schema Generation & Database Ingestion
            const project = await getProjectById(project_id, auth.userId);
            const schema = 'project_' + project_id;
            const safeTableName = target_table.replace(/[^a-zA-Z0-9_]/g, '');

            // Ensure Table Exists
            const columns = extractKeys.map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, '')}" TEXT`);
            const createDdl = `CREATE TABLE IF NOT EXISTS "${schema}"."${safeTableName}" (
                id SERIAL PRIMARY KEY,
                _scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ${columns.join(',\n')}
            );`;

            await pool.query(createDdl);

            // Bulk Insert
            for (let i = 0; i < extractedData.length; i += 500) {
                const chunk = extractedData.slice(i, i + 500);
                const values: any[] = [];
                const placeholders: string[] = [];
                let paramIndex = 1;

                chunk.forEach(row => {
                    const rowPlaceholders = [];
                    extractKeys.forEach(key => {
                        values.push(row[key] || null);
                        rowPlaceholders.push(`$${paramIndex++}`);
                    });
                    placeholders.push(`(${rowPlaceholders.join(', ')})`);
                });

                const colsStr = extractKeys.map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, '')}"`).join(', ');
                const insertSql = `INSERT INTO "${schema}"."${safeTableName}" (${colsStr}) VALUES ${placeholders.join(', ')}`;
                await pool.query(insertSql, values);
            }
        }

        const duration = Date.now() - startTime;

        // 5. Telemetry Logging
        await pool.query(
            `INSERT INTO fluxbase_global.fluxbase_scraper_runs (scraper_id, status, duration_ms, rows_extracted) VALUES ($1, $2, $3, $4)`,
            [scraperId, 'success', duration, rowsExtracted]
        );
        // Quick update to job last_run
        await pool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'idle' WHERE scraper_id = $1`, [scraperId]);

        return NextResponse.json({ success: true, message: `Scraped ${rowsExtracted} items successfully.`, rows: rowsExtracted, duration });
    } catch (error: any) {
        if (browser) await browser.close().catch(() => { });
        console.error('[Native Scraper Error]', error);

        try {
            const params = await context.params;
            const pool = getPgPool();
            await pool.query(
                `INSERT INTO fluxbase_global.fluxbase_scraper_runs (scraper_id, status, error_message) VALUES ($1, $2, $3)`,
                [params.scraperId, 'failed', error.message]
            );
            await pool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'failed' WHERE scraper_id = $1`, [params.scraperId]);
        } catch (e) { }

        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
