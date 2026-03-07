import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const scraperId = searchParams.get('scraperId');

        if (!scraperId) {
            return NextResponse.json({ success: false, error: 'scraperId is required' }, { status: 400 });
        }

        // Verify the user owns this scraper
        const pool = getPgPool();
        const { rows: scrapers } = await pool.query(`SELECT scraper_id FROM fluxbase_global.fluxbase_scrapers WHERE scraper_id = $1 AND user_id = $2`, [scraperId, auth.userId]);

        if (scrapers.length === 0) {
            return NextResponse.json({ success: false, error: 'Scraper not found or unauthorized' }, { status: 404 });
        }

        const { rows } = await pool.query(`
            SELECT run_id, scraper_id, rows_inserted, status, error_message, 
                   TO_CHAR(run_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as run_time
            FROM fluxbase_global.fluxbase_scraper_runs 
            WHERE scraper_id = $1 
            ORDER BY fluxbase_scraper_runs.run_time DESC
            LIMIT 100
        `, [scraperId]);

        return NextResponse.json({ success: true, runs: rows });
    } catch (error: any) {
        console.error('[GET /api/scrapers/runs Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
