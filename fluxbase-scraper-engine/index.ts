import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';

import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Database Pools
const pgPool = new PgPool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL || "",
    ssl: { rejectUnauthorized: false }
});

let mysqlPool: mysql.Pool | null = null;
if (process.env.AWS_RDS_MYSQL_URL) {
    const parsedUrl = new URL(process.env.AWS_RDS_MYSQL_URL);
    parsedUrl.pathname = '';

    mysqlPool = mysql.createPool({
        uri: parsedUrl.toString(),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: true,
        enableKeepAlive: true,
        ssl: { rejectUnauthorized: false }
    });
}

// -------------------------------------------------------------
// CORE SCRAPER UTILS
// -------------------------------------------------------------

async function fetchPage(url: string) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Explicitly wait to allow dynamic hydration
    await page.waitForTimeout(3000);
    const html = await page.content();
    await browser.close();
    return html;
}

function parseHTML(html: string, selectors: Record<string, string>) {
    const $ = cheerio.load(html);
    const rows: Record<string, string>[] = [];
    const itemSelector = selectors.item;
    if (!itemSelector) throw new Error("Missing 'item' selector");

    $(itemSelector).each((i, el) => {
        const row: Record<string, string> = {};
        for (const [field, selector] of Object.entries(selectors)) {
            if (field === "item") continue;
            row[field] = $(el).find(selector).text().trim() || "";
        }
        if (Object.keys(row).length > 0) rows.push(row);
    });

    return rows;
}

function generateCreateTableSQL(schemaPath: string, tableName: string, fields: string[], dialect: string) {
    if (dialect === 'mysql') {
        const columns = fields.map(f => `\`${f.replace(/[^a-zA-Z0-9_]/g, '')}\` TEXT`).join(",\n            ");
        return `CREATE TABLE IF NOT EXISTS \`${schemaPath}\`.\`${tableName}\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ${columns},
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
    } else {
        const columns = fields.map(f => `"${f.replace(/[^a-zA-Z0-9_]/g, '')}" TEXT`).join(",\n            ");
        return `CREATE TABLE IF NOT EXISTS "${schemaPath}"."${tableName}" (
            id SERIAL PRIMARY KEY,
            ${columns},
            scraped_at TIMESTAMP DEFAULT NOW()
        )`;
    }
}

async function insertRows(pool: any, schemaPath: string, tableName: string, rows: Record<string, string>[], dialect: string) {
    if (rows.length === 0) return 0;
    let rowsInserted = 0;

    for (const row of rows) {
        const values = Object.values(row);

        if (dialect === 'mysql') {
            const keys = Object.keys(row).map(k => `\`${k.replace(/[^a-zA-Z0-9_]/g, '')}\``);
            const sql = `INSERT INTO \`${schemaPath}\`.\`${tableName}\` (${keys.join(", ")}) VALUES (${values.map(() => `?`).join(", ")})`;
            try {
                await pool.query(sql, values);
                rowsInserted++;
            } catch (e) {
                console.error(`Mysql Insert Error:`, e);
            }
        } else {
            const keys = Object.keys(row).map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, '')}"`);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
            const sql = `INSERT INTO "${schemaPath}"."${tableName}" (${keys.join(", ")}) VALUES (${placeholders})`;
            try {
                await pool.query(sql, values);
                rowsInserted++;
            } catch (e) {
                console.error(`Postgres Insert Error:`, e);
            }
        }
    }
    return rowsInserted;
}

// -------------------------------------------------------------
// MAIN EXECUTION ENGINE
// -------------------------------------------------------------

async function runScraper(job: any) {
    const runId = uuidv4();

    await pgPool.query(`
        INSERT INTO fluxbase_global.fluxbase_scraper_runs (run_id, scraper_id, status)
        VALUES ($1, $2, 'running')
    `, [runId, job.scraper_id]);

    try {
        console.log(`[Eng] Starting scraper job ${job.scraper_id} => ${job.url}`);

        // Fetch Project to determine dialect natively via PG pool.
        const { rows: projectRows } = await pgPool.query(`SELECT project_id, dialect FROM fluxbase_global.projects WHERE project_id = $1`, [job.project_id]);
        if (projectRows.length === 0) throw new Error(`Project ${job.project_id} not found.`);
        const project = projectRows[0];

        const dialect = project.dialect?.toLowerCase() === 'mysql' ? 'mysql' : 'postgres';
        if (dialect === 'mysql' && !mysqlPool) throw new Error("AWS_RDS_MYSQL_URL is isolated/missing on worker.");

        const projectPool = dialect === 'mysql' ? mysqlPool : pgPool;

        // 1. Fetch
        const html = await fetchPage(job.url);

        // 2. Parse
        const selectors = typeof job.selectors === 'string' ? JSON.parse(job.selectors) : job.selectors;
        const rows = parseHTML(html, selectors);
        if (rows.length === 0) throw new Error("No rows extracted using the provided selectors.");

        const schemaPath = `project_${job.project_id}`;

        // 3. Create Table
        const fields = Object.keys(rows[0]);
        const createTableSQL = generateCreateTableSQL(schemaPath, job.table_name, fields, dialect);
        await (projectPool as any).query(createTableSQL);

        // 4. Batch Insert
        const rowsInserted = await insertRows(projectPool, schemaPath, job.table_name, rows, dialect);

        // Success Log
        await pgPool.query(`UPDATE fluxbase_global.fluxbase_scraper_runs SET status = 'success', rows_inserted = $1, run_time = NOW() WHERE run_id = $2`, [rowsInserted, runId]);
        await pgPool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET last_run = NOW(), status = 'idle' WHERE scraper_id = $1`, [job.scraper_id]);

        console.log(`[Eng] Job ${job.scraper_id} success. Inserted ${rowsInserted} rows.`);
        return rowsInserted;

    } catch (error: any) {
        console.error(`[Eng] Job ${job.scraper_id} failed:`, error.message);
        await pgPool.query(`UPDATE fluxbase_global.fluxbase_scraper_runs SET status = 'failed', error_message = $1, run_time = NOW() WHERE run_id = $2`, [error.message || 'Unknown Error', runId]);
        await pgPool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'failed' WHERE scraper_id = $1`, [job.scraper_id]);
        throw error;
    }
}

// -------------------------------------------------------------
// EXTERNAL API (Webhook trigger from Next.js inside Vercel)
// -------------------------------------------------------------

app.post('/api/run', async (req, res) => {
    const { job } = req.body;
    if (!job || !job.scraper_id) {
        return res.status(400).json({ success: false, error: 'Valid job object required.' });
    }

    // Fire and forget to free up Webhook caller
    runScraper(job).catch(err => {
        console.error(`Webhook async scraper execution failed for ${job.scraper_id}`);
    });

    return res.json({ success: true, message: 'Job accepted by Cloud Worker Engine.' });
});

// -------------------------------------------------------------
// BACKGROUND DAEMON
// -------------------------------------------------------------

async function getActiveScrapers() {
    const { rows } = await pgPool.query(`
        SELECT * FROM fluxbase_global.fluxbase_scrapers 
        WHERE schedule != 'manual' 
          AND status != 'running'
          AND (next_run IS NULL OR next_run <= NOW())
    `);
    return rows;
}

function startScraperDaemon() {
    console.log("🕒 Starting Fluxbase Background Scraper Daemon...");
    cron.schedule("* * * * *", async () => {
        try {
            const jobs = await getActiveScrapers();
            if (jobs.length > 0) {
                console.log(`[Daemon] Found ${jobs.length} scheduled jobs due.`);
                for (const job of jobs) {
                    await runScraper(job).catch(() => { });
                    let interval = '1 HOUR';
                    if (job.schedule === 'hourly') interval = '1 HOUR';
                    else if (job.schedule === 'every 6 hours' || job.schedule === '6h') interval = '6 HOURS';
                    else if (job.schedule === 'daily' || job.schedule === '24h') interval = '1 DAY';

                    await pgPool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET next_run = NOW() + INTERVAL '${interval}' WHERE scraper_id = $1`, [job.scraper_id]);
                }
            }
        } catch (error) {
            console.error("[Daemon] Error polling jobs:", error);
        }
    });
}

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Fluxbase Scraper Engine living on port ${PORT}`);
    startScraperDaemon();
});
