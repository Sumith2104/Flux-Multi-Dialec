import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        if (!projectId) {
            return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
        }

        const pool = getPgPool();
        const { rows } = await pool.query(`
            SELECT * FROM fluxbase_global.fluxbase_scrapers 
            WHERE project_id = $1 
            ORDER BY created_at DESC
        `, [projectId]);

        return NextResponse.json({ success: true, scrapers: rows });
    } catch (error: any) {
        console.error('[GET /api/scrapers Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { projectId, url, selectors, tableName, schedule } = body;

        if (!projectId || !url || !selectors || !tableName) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        const scraperId = uuidv4();
        const pool = getPgPool();

        await pool.query(`
            INSERT INTO fluxbase_global.fluxbase_scrapers 
            (scraper_id, user_id, project_id, url, selectors, table_name, schedule)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [scraperId, auth.userId, projectId, url, JSON.stringify(selectors), tableName, schedule || 'manual']);

        return NextResponse.json({ success: true, scraperId });
    } catch (error: any) {
        console.error('[POST /api/scrapers Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const scraperId = searchParams.get('scraperId');

        if (!scraperId) {
            return NextResponse.json({ success: false, error: 'scraperId is required' }, { status: 400 });
        }

        const pool = getPgPool();
        await pool.query(`
            DELETE FROM fluxbase_global.fluxbase_scrapers 
            WHERE scraper_id = $1 AND user_id = $2
        `, [scraperId, auth.userId]);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[DELETE /api/scrapers Error]', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { scraperId, url, tableName, selectors, schedule } = body;

        if (!scraperId || !url || !tableName || !selectors) {
            return NextResponse.json({ success: false, error: 'Missing required configuration fields' }, { status: 400 });
        }

        const pool = getPgPool();

        // Ensure user owns this scraper
        const check = await pool.query(`SELECT scraper_id FROM fluxbase_global.fluxbase_scrapers WHERE scraper_id = $1 AND user_id = $2`, [scraperId, auth.userId]);
        if (check.rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Scraper not found or unauthorized' }, { status: 404 });
        }

        await pool.query(`
            UPDATE fluxbase_global.fluxbase_scrapers
            SET url = $1, table_name = $2, selectors = $3, schedule = $4, status = 'idle'
            WHERE scraper_id = $5 AND user_id = $6
        `, [
            url,
            tableName,
            typeof selectors === 'object' ? JSON.stringify(selectors) : selectors,
            schedule || 'manual',
            scraperId,
            auth.userId
        ]);

        return NextResponse.json({ success: true, message: 'Scraper job updated successfully' });
    } catch (error: any) {
        console.error('[PUT /api/scrapers Error]', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
