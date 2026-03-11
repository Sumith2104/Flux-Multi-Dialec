import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth) return new Response('Unauthorized', { status: 401 });

        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');

        if (!projectId) return new Response('projectId required', { status: 400 });

        const pool = getPgPool();

        // Verify project ownership
        const { rows: projects } = await pool.query(
            `SELECT project_id FROM fluxbase_global.fluxbase_projects WHERE project_id = $1 AND user_id = $2`, 
            [projectId, auth.userId]
        );
        if (projects.length === 0) return new Response('Unauthorized or not found', { status: 404 });

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
                            SELECT * FROM fluxbase_global.fluxbase_scrapers 
                            WHERE project_id = $1 AND user_id = $2 
                            ORDER BY created_at DESC
                        `, [projectId, auth.userId]);

                        if (isClosed) break;

                        const payload = JSON.stringify({ success: true, scrapers: rows });
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
        console.error('[GET /api/scrapers/stream Error]', error);
        return new Response(error.message, { status: 500 });
    }
}
