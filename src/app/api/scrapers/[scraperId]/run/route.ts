import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export async function POST(request: Request, context: any) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        // Await params in Next.js 15+
        const params = await context.params;
        const scraperId = params.scraperId;

        if (!scraperId) {
            return NextResponse.json({ success: false, error: 'scraperId is required' }, { status: 400 });
        }

        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT * FROM fluxbase_global.fluxbase_scrapers WHERE scraper_id = $1 AND user_id = $2`, [scraperId, auth.userId]);

        if (rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Scraper job not found' }, { status: 404 });
        }

        const job = rows[0];

        // Fire and forget triggering the dedicated worker
        const engineUrl = process.env.SCRAPER_ENGINE_URL || 'http://localhost:8080';
        fetch(`${engineUrl}/api/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job })
        }).catch(err => console.error(`Failed to dispatch job to external Scraper Engine:`, err));

        return NextResponse.json({ success: true, message: 'Scraper job dispatched to Cloud Engine successfully.' });
    } catch (error: any) {
        console.error('[POST /api/scrapers/[scraperId]/run Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
