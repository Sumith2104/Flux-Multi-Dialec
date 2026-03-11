import cron from "node-cron";
import { getPgPool } from "@/lib/pg";
import { runScraper } from "./engine";

/**
 * Bootstraps the background cron scheduler for automated scrapers.
 * This function should ideally be called once during server startup.
 * In Next.js this can be tricky, so it might be attached to a global
 * variable in development to prevent duplicate cron launches.
 */
let isScheduled = false;

export function initScraperScheduler() {
    if (isScheduled) return;

    console.log(`[Scraper Scheduler] Bootstrapping background cron jobs for automated data extraction...`);

    // Run every 5 minutes and look for jobs that are scheduled and idle
    cron.schedule("*/5 * * * *", async () => {
        const pool = getPgPool();
        try {
            const { rows: jobs } = await pool.query(`
                SELECT * FROM fluxbase_global.fluxbase_scrapers 
                WHERE schedule IS NOT NULL 
                AND schedule != 'manual'
                AND status = 'idle'
                -- In a real production system you'd also check next_run <= NOW()
            `);

            if (jobs.length > 0) {
                console.log(`[Scraper Scheduler] Picked up ${jobs.length} scheduled jobs. Dispatching to engine...`);
            }

            for (const job of jobs) {
                // Mark as running so another cron doesn't pick it up
                await pool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'running' WHERE id = $1`, [job.id]);

                // Dispatch to exactly the same engine the UI uses
                runScraper(job, job.user_id).catch(err => {
                    console.error(`[Scraper Scheduler] Automated job ${job.id} failed:`, err);
                });
            }
        } catch (error) {
            console.error(`[Scraper Scheduler] Error checking for scheduled jobs:`, error);
        }
    });

    isScheduled = true;
}
