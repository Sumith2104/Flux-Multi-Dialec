import { NextRequest } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { ERROR_CODES } from '@/lib/error-codes';
import realtimeManager from '@/lib/realtime-manager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
        return new Response(JSON.stringify({ success: false, error: { message: 'Missing projectId', code: ERROR_CODES.BAD_REQUEST } }), { status: 400 });
    }

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
        return new Response(JSON.stringify({ success: false, error: { message: 'Unauthorized', code: ERROR_CODES.AUTH_REQUIRED } }), { status: 401 });
    }

    // Permission Check
    if (auth.allowedProjectId && auth.allowedProjectId !== projectId) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: { message: 'API Key is restricted to a different project', code: ERROR_CODES.UNAUTHORIZED } 
        }), { status: 403 });
    }

    const pool = getPgPool();
    const projectRes = await pool.query('SELECT project_id FROM fluxbase_global.projects WHERE project_id = $1 AND user_id = $2', [projectId, auth.userId]);
    if (projectRes.rows.length === 0) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: { message: 'Project not found', code: ERROR_CODES.PROJECT_NOT_FOUND } 
        }), { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            let unsubscribe: (() => void) | null = null;
            let interval: NodeJS.Timeout | null = null;
            
            try {
                const { redis } = await import('@/lib/redis');
                
                // 1. Subscribe to the Global Multiplexer (0 Connection cost)
                unsubscribe = realtimeManager.subscribe(projectId, (payload: string) => {
                    try {
                        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                    } catch (e) {
                         // Controller might be closed
                    }
                });

                // 2. Lifecycle Cleanup
                let isReleased = false;
                const releaseHandler = async () => {
                    if (isReleased) return;
                    isReleased = true;
                    
                    if (interval) clearInterval(interval);
                    if (unsubscribe) unsubscribe();
                    
                    const { redis: r } = await import('@/lib/redis');
                    await r.decr(`live_sessions:${projectId}`).catch(() => {});
                };

                // Abort listener for browser disconnect
                req.signal.addEventListener('abort', releaseHandler);

                await redis.incr(`live_sessions:${projectId}`).catch(() => {});
                
                controller.enqueue(encoder.encode('retry: 10000\n\n'));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`));

                interval = setInterval(() => {
                    try {
                        controller.enqueue(encoder.encode(': heartbeat\n\n'));
                    } catch (e) {
                        releaseHandler();
                    }
                }, 15000);

            } catch (err) {
                console.error("[SSE Route Error]", err);
                if (unsubscribe) unsubscribe();
                try { controller.error(err); } catch(e) {}
            }
        },
        cancel() {
            // This is naturally called when the stream is closed by the browser/Next.js
            // console.log('[SSE] Stream cancelled by client');
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable buffering on Nginx/Proxies
        },
    });
}
