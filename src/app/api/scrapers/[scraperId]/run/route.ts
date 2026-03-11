import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { runScraper } from '@/scraper/engine';

export const maxDuration = 60; // Allow Vercel proxy to wait up to 60s

export async function POST(request: Request, context: any) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        // Next.js 15: params must be awaited
        const params = await context.params;
        const scraperId = params.scraperId;

        if (!scraperId) return NextResponse.json({ success: false, error: 'scraperId is required' }, { status: 400 });

        const pool = getPgPool();

        // 1. Fetch Config and Verify Ownership
        const { rows } = await pool.query(`SELECT * FROM fluxbase_global.fluxbase_scrapers WHERE id = $1 AND user_id = $2`, [scraperId, auth.userId]);
        if (rows.length === 0) return NextResponse.json({ success: false, error: 'Scraper job not found or unauthorized' }, { status: 404 });

        const job = rows[0];

        // Ensure we don't start it if it's already running
        if (job.status === 'running') {
            return NextResponse.json({ success: false, error: 'Job is already actively running.' }, { status: 429 });
        }

        // Lock job to preventing parallel duplicate execution
        await pool.query(`UPDATE fluxbase_global.fluxbase_scrapers SET status = 'running' WHERE id = $1`, [scraperId]);

        // 2. Dispatch to the Modular Orchestrator Engine
        const result = await runScraper(job, auth.userId);

        return NextResponse.json({ success: true, message: `Scraped ${result.rows} items successfully.`, rows: result.rows, duration: result.duration });
    } catch (error: any) {
        console.error('[Native Scraper Endpoint Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
