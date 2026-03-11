import { getPgPool } from '@/lib/pg';
import { getProjectById } from '@/lib/data';
import { fetchPage } from './fetcher';
import { parseHTML } from './parser';
import { inferSchema } from './schema';
import { createTable, insertRows } from './ingestion';

/**
 * Core Modular Scraper Engine Orchestrator
 * This perfectly coordinates the fetcher, parser, inference engine, and ingestion layers.
 * 
 * @param scraper The full database row object representing the scraper job
 * @param userId The ID of the user executing the scraper
 * @returns Object with rows extracted and total duration
 */
export async function runScraper(scraper: any, userId: string): Promise<{ rows: number, duration: number }> {
    const start = Date.now();
    const pool = getPgPool();

    try {
        console.log(`[Engine] Starting execution for scraper ${scraper.id}...`);

        // 1. Fetch
        const html = await fetchPage(scraper.url);

        // 2. Parse
        const rows = parseHTML(html, scraper.selectors);

        if (rows.length === 0) {
            throw new Error("No rows extracted. Either the site is protected, or the CSS selectors are incorrect.");
        }

        // 3. Schema Inference
        // We use the first valid row to dictate the column structure
        const columns = inferSchema(rows[0]);

        if (columns.length === 0) {
            throw new Error("Critical Failure: Extracted data contains no parseable keys.");
        }

        // 4. Ingestion Preparation
        // Resolve project to verify ownership and get exact tenant schema name
        const project = await getProjectById(scraper.project_id, userId);
        if (!project) throw new Error("Target database project not found or unauthorized.");

        const schemaName = 'project_' + scraper.project_id;
        const safeTableName = scraper.table_name.replace(/[^a-zA-Z0-9_]/g, '');

        // 5. Schema Provisioning
        await createTable(pool, schemaName, safeTableName, columns, project.dialect);

        // 6. Bulk Insert
        await insertRows(pool, schemaName, safeTableName, rows, columns, project.dialect);

        try {
            const { invalidateTableCache } = await import('@/lib/cache');
            invalidateTableCache(scraper.project_id, safeTableName);
        } catch (e) {
            console.error("Cache invalidation error:", e);
        }

        const duration = Date.now() - start;

        // 7. Success Telemetry Logging
        await pool.query(
            `INSERT INTO fluxbase_global.fluxbase_scraper_runs (id, scraper_id, status, duration_ms, rows_inserted) VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
            [scraper.id, 'success', duration, rows.length]
        );

        // Update main record status back to idle
        await pool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'idle', last_run = NOW() WHERE id = $1`, [scraper.id]);

        return { rows: rows.length, duration };

    } catch (error: any) {
        console.error('[Engine Fatal Error]', error);

        // 8. Failure Telemetry Logging
        try {
            await pool.query(
                `INSERT INTO fluxbase_global.fluxbase_scraper_runs (id, scraper_id, status, error_message) VALUES (gen_random_uuid(), $1, $2, $3)`,
                [scraper.id, 'failed', error.message]
            );
            await pool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'failed' WHERE id = $1`, [scraper.id]);
        } catch (telemetryError) {
            console.error('Failed to write failure telemetry record', telemetryError);
        }

        throw error;
    }
}
