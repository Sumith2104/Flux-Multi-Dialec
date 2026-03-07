import { chromium } from "playwright";
import * as cheerio from "cheerio";
import { getPgPool } from "@/lib/pg";
import { getMysqlPool } from "@/lib/mysql";
import { getProjectById } from "@/lib/data";
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

export async function fetchPage(url: string) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Safety timeout to prevent stalling
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Explicitly wait 3 seconds to allow highly dynamic SPA sites like Flipkart to render React components
    await page.waitForTimeout(3000);

    const html = await page.content();

    await browser.close();
    return html;
}

export function parseHTML(html: string, selectors: Record<string, string>) {
    const $ = cheerio.load(html);
    const rows: Record<string, string>[] = [];

    // 'item' is the parent container for a single row of data
    const itemSelector = selectors.item;
    if (!itemSelector) throw new Error("Missing 'item' selector telling the parser how to group rows.");

    $(itemSelector).each((i, el) => {
        const row: Record<string, string> = {};

        for (const [field, selector] of Object.entries(selectors)) {
            if (field === "item") continue;
            row[field] = $(el).find(selector).text().trim() || "";
        }

        // Only push if at least one field aside from item actually grabbed something
        if (Object.keys(row).length > 0) {
            rows.push(row);
        }
    });

    return rows;
}

export function generateCreateTableSQL(schemaPath: string, tableName: string, fields: string[], dialect: string) {
    if (dialect === 'mysql') {
        const columns = fields.map(f => `\`${f.replace(/[^a-zA-Z0-9_]/g, '')}\` TEXT`).join(",\n            ");
        return `
            CREATE TABLE IF NOT EXISTS \`${schemaPath}\`.\`${tableName}\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${columns},
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
    } else {
        const columns = fields.map(f => `"${f.replace(/[^a-zA-Z0-9_]/g, '')}" TEXT`).join(",\n            ");
        return `
            CREATE TABLE IF NOT EXISTS "${schemaPath}"."${tableName}" (
                id SERIAL PRIMARY KEY,
                ${columns},
                scraped_at TIMESTAMP DEFAULT NOW()
            )
        `;
    }
}

export async function insertRows(pool: any, schemaPath: string, tableName: string, rows: Record<string, string>[], dialect: string) {
    if (rows.length === 0) return 0;

    let rowsInserted = 0;

    for (const row of rows) {
        const values = Object.values(row);

        if (dialect === 'mysql') {
            const keys = Object.keys(row).map(k => `\`${k.replace(/[^a-zA-Z0-9_]/g, '')}\``);
            const columns = keys.join(", ");
            const placeholders = values.map(() => `?`).join(", ");

            const sql = `
                INSERT INTO \`${schemaPath}\`.\`${tableName}\` (${columns})
                VALUES (${placeholders})
            `;
            try {
                await pool.query(sql, values);
                rowsInserted++;
            } catch (e) {
                console.error(`Error inserting row into ${tableName} (MySQL):`, e);
            }
        } else {
            const keys = Object.keys(row).map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, '')}"`);
            const columns = keys.join(", ");
            const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

            const sql = `
                INSERT INTO "${schemaPath}"."${tableName}" (${columns})
                VALUES (${placeholders})
            `;
            try {
                await pool.query(sql, values);
                rowsInserted++;
            } catch (e) {
                console.error(`Error inserting row into ${tableName} (PostgreSQL):`, e);
            }
        }
    }

    return rowsInserted;
}

export async function runScraper(job: any) {
    const globalPool = getPgPool(); // Metadata is always in Pg
    const runId = uuidv4();

    // Log the start of the run
    await globalPool.query(`
        INSERT INTO fluxbase_global.fluxbase_scraper_runs (run_id, scraper_id, status)
        VALUES ($1, $2, 'running')
    `, [runId, job.scraper_id]);

    try {
        console.log(`[Scraper] Starting job ${job.scraper_id} => ${job.url}`);

        // Fetch Project to determine dialect
        const project = await getProjectById(job.project_id, job.user_id);
        if (!project) throw new Error(`Project ${job.project_id} not found or unauthorized.`);

        const dialect = project.dialect?.toLowerCase() === 'mysql' ? 'mysql' : 'postgres';
        const projectPool = dialect === 'mysql' ? getMysqlPool() : globalPool;

        // 1. Fetch
        const html = await fetchPage(job.url);

        // 2. Parse
        const selectors = typeof job.selectors === 'string' ? JSON.parse(job.selectors) : job.selectors;
        const rows = parseHTML(html, selectors);

        if (rows.length === 0) {
            throw new Error("No rows extracted using the provided selectors.");
        }

        const schemaPath = `project_${job.project_id}`; // Used as Schema for Postgres, Database for MySQL

        // 3. Auto Table Generation
        const fields = Object.keys(rows[0]);
        const createTableSQL = generateCreateTableSQL(schemaPath, job.table_name, fields, dialect);
        await (projectPool as any).query(createTableSQL);

        // 4. Batch Insertion
        const rowsInserted = await insertRows(projectPool, schemaPath, job.table_name, rows, dialect);

        // Log Success
        await globalPool.query(`
            UPDATE fluxbase_global.fluxbase_scraper_runs
            SET status = 'success', rows_inserted = $1, run_time = NOW()
            WHERE run_id = $2
        `, [rowsInserted, runId]);

        // Update job last_run
        await globalPool.query(`
            UPDATE fluxbase_global.fluxbase_scrapers
            SET last_run = NOW(), status = 'idle'
            WHERE scraper_id = $1
        `, [job.scraper_id]);

        console.log(`[Scraper] Job ${job.scraper_id} finished successfully. Inserted ${rowsInserted} rows.`);
        return rowsInserted;

    } catch (error: any) {
        console.error(`[Scraper] Job ${job.scraper_id} failed:`, error);

        // Log Failure
        await globalPool.query(`
            UPDATE fluxbase_global.fluxbase_scraper_runs
            SET status = 'failed', error_message = $1, run_time = NOW()
            WHERE run_id = $2
        `, [error.message || 'Unknown Error', runId]);

        await globalPool.query(`
            UPDATE fluxbase_global.fluxbase_scrapers
            SET status = 'failed'
            WHERE scraper_id = $1
        `, [job.scraper_id]);

        throw error;
    }
}

// --- Cron Scheduling Daemon ---

export async function getActiveScrapers() {
    const pool = getPgPool();
    // Only fetch scrapers that have a schedule (not manual), are not currently running, 
    // and where next_run is either null (never run) or in the past
    const { rows } = await pool.query(`
        SELECT * FROM fluxbase_global.fluxbase_scrapers 
        WHERE schedule != 'manual' 
          AND status != 'running'
          AND (next_run IS NULL OR next_run <= NOW())
    `);
    return rows;
}

export function startScraperDaemon() {
    console.log("🕒 Starting Fluxbase Background Scraper Daemon...");

    // Check every minute if there are jobs due
    cron.schedule("* * * * *", async () => {
        try {
            const jobs = await getActiveScrapers();
            if (jobs.length > 0) {
                console.log(`[Daemon] Found ${jobs.length} scheduled jobs due to run.`);

                for (const job of jobs) {
                    await runScraper(job).catch(err => {
                        console.error(`[Daemon] Job ${job.scraper_id} failed, moving to next.`);
                    });

                    // After running, update the next_run time based on schedule
                    // Schedule maps: 'hourly', 'daily', 'every 6 hours'
                    const pool = getPgPool();
                    let interval = '1 HOUR';
                    if (job.schedule === 'hourly') interval = '1 HOUR';
                    else if (job.schedule === 'every 6 hours' || job.schedule === '6h') interval = '6 HOURS';
                    else if (job.schedule === 'daily' || job.schedule === '24h') interval = '1 DAY';

                    await pool.query(`
                        UPDATE fluxbase_global.fluxbase_scrapers
                        SET next_run = NOW() + INTERVAL '${interval}'
                        WHERE scraper_id = $1
                    `, [job.scraper_id]);
                }
            }
        } catch (error) {
            console.error("[Daemon] Error polling jobs:", error);
        }
    });
}

// Allow starting the daemon directly from CLI via PM2 or node
if (process.argv[1]?.includes('scraper-worker')) {
    startScraperDaemon();
}
