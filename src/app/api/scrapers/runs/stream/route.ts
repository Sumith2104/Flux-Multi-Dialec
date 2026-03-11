import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth) return new Response('Unauthorized', { status: 401 });

        const { searchParams } = new URL(req.url);
        const scraperId = searchParams.get('scraperId');

        if (!scraperId) return new Response('scraperId required', { status: 400 });

        const pool = getPgPool();

        // Verify ownership first
        const { rows: scrapers } = await pool.query(
            `SELECT id FROM fluxbase_global.fluxbase_scrapers WHERE id = $1 AND user_id = $2`, 
            [scraperId, auth.userId]
        );
        if (scrapers.length === 0) return new Response('Unauthorized or not found', { status: 404 });

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                let isClosed = false;

                req.signal.addEventListener('abort', () => {
                    isClosed = true;
                });

                while (!isClosed) {
                    try {
                        const { rows } = await pool.query(`
                            SELECT * FROM fluxbase_global.fluxbase_scraper_runs 
                            WHERE scraper_id = $1 
                            ORDER BY created_at DESC
                            LIMIT 50
                        `, [scraperId]);

                        if (isClosed) break;

                        const payload = JSON.stringify({ success: true, runs: rows });
                        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    } catch (err: any) {
                        if (err.name === 'TypeError' || err.message?.includes('closed') || err.message?.includes('Controller is already closed') || err.code === 'ERR_INVALID_STATE') {
                            isClosed = true;
                            break;
                        }
                        console.error("SSE Streaming Error:", err);
                        if (!isClosed) await new Promise((resolve) => setTimeout(resolve, 5000));
                    }
                }
                try { controller.close(); } catch (e) { }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            },
        });
    } catch (error: any) {
        console.error('[GET /api/scrapers/runs/stream Error]', error);
        return new Response(error.message, { status: 500 });
    }
}
