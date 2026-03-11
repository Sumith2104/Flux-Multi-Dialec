import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const scraperId = searchParams.get('scraperId');

        if (!scraperId) return NextResponse.json({ success: false, error: 'scraperId is required' }, { status: 400 });

        const pool = getPgPool();

        // Verify ownership first
        const { rows: scrapers } = await pool.query(`SELECT id FROM fluxbase_global.fluxbase_scrapers WHERE id = $1 AND user_id = $2`, [scraperId, auth.userId]);
        if (scrapers.length === 0) return NextResponse.json({ success: false, error: 'Unauthorized or not found' }, { status: 404 });

        const { rows } = await pool.query(`
            SELECT * FROM fluxbase_global.fluxbase_scraper_runs 
            WHERE scraper_id = $1 
            ORDER BY created_at DESC
            LIMIT 50
        `, [scraperId]);

        return NextResponse.json({ success: true, runs: rows });
    } catch (error: any) {
        console.error('[GET /api/scrapers/runs Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
