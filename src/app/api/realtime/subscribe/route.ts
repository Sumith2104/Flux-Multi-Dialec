import { NextRequest } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { ERROR_CODES } from '@/lib/error-codes';

export const runtime = 'nodejs'; // Required for long-lived connections
export const dynamic = 'force-dynamic';

/**
 * Native SSE Subscription Endpoint
 * Allows clients to subscribe to real-time database events via Server-Sent Events.
 * 
 * Usage:
 *   const eventSource = new EventSource('/api/realtime/subscribe?projectId=YOUR_PROJECT_ID');
 *   eventSource.onmessage = (event) => {
 *     const data = JSON.parse(event.data);
 *     console.log('Real-time update:', data);
 *   };
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: { message: 'projectId required', code: ERROR_CODES.BAD_REQUEST } 
        }), { status: 400 });
    }

    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: { message: 'Unauthorized', code: ERROR_CODES.UNAUTHORIZED } 
        }), { status: 401 });
    }

    // Verify project access
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
                let client: any = null;
                let interval: NodeJS.Timeout | null = null;
                try {
                    client = await pool.connect();
                    const { redis } = await import('@/lib/redis');
                    
                    // Cleanup function to ensure client is released exactly once
                    let isReleased = false;
                    const releaseClient = async () => {
                        if (isReleased || !client) return;
                        isReleased = true;
                        
                        if (interval) clearInterval(interval);
                        client.off('notification', handleNotification);
                        await client.query('UNLISTEN fluxbase_live').catch(() => {});
                        client.release();
                        
                        // Decrement live sessions count for this project
                        const { redis: r } = await import('@/lib/redis');
                        await r.decr(`live_sessions:${projectId}`).catch(() => {});
                    };

                    // Handle premature aborts
                    req.signal.addEventListener('abort', releaseClient);

                    // Increment live sessions count for this project
                    await redis.incr(`live_sessions:${projectId}`).catch(() => {});
                    
                    // Send initial heartbeat
                    controller.enqueue(encoder.encode('retry: 10000\n\n'));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`));

                    const handleNotification = (msg: any) => {
                        if (msg.channel === 'fluxbase_live') {
                            try {
                                const payload = JSON.parse(msg.payload);
                                if (payload.project_id === projectId) {
                                    controller.enqueue(encoder.encode(`data: ${msg.payload}\n\n`));
                                }
                            } catch (e) {
                                console.error('SSE payload parse error:', e);
                            }
                        }
                    };

                    client.on('notification', handleNotification);
                    await client.query('LISTEN fluxbase_live');

                    // Keep-alive heartbeat every 15s to prevent timeouts
                    const interval = setInterval(() => {
                        try {
                            controller.enqueue(encoder.encode(': heartbeat\n\n'));
                        } catch (e) {
                            clearInterval(interval);
                            releaseClient();
                        }
                    }, 15000);

                } catch (err) {
                    console.error("Realtime Stream Error:", err);
                    if (client) {
                        client.release();
                    }
                    try { controller.error(err); } catch(e) {}
                }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
