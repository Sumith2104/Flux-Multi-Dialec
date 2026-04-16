import { NextRequest } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { getProjectById, ensureNotSuspended } from '@/lib/data';
import realtimeManager from '@/lib/realtime-manager';
import { ERROR_CODES } from '@/lib/error-codes';
import { redis } from '@/lib/redis';

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

    // Use centralized project fetching to include status check
    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
        return new Response(JSON.stringify({
            success: false,
            error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' }
        }), { status: 404 });
    }

    // Granular Suspension Check
    try {
        await ensureNotSuspended(project);
    } catch (e: any) {
        return new Response(JSON.stringify({
            success: false,
            error: { message: e.message, code: e.code }
        }), { status: 403 });
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // In-memory connection guard (Shared across requests in this instance)
    // Relaxed in dev to prevent 429 lockouts during React hot-reloading
    const MAX_CONNS_PER_IP = process.env.NODE_ENV === 'production' ? 10 : 1000;
    const globalConns = (global as any)._sse_conns || new Map<string, number>();
    (global as any)._sse_conns = globalConns;

    const currentConns = globalConns.get(ip) || 0;
    if (currentConns >= MAX_CONNS_PER_IP) {
        return new Response(JSON.stringify({
            success: false,
            error: { message: 'Too many concurrent subscriptions from this address', code: ERROR_CODES.RATE_LIMIT_EXCEEDED }
        }), { status: 429 });
    }

    const encoder = new TextEncoder();
    let releaseHandler: () => Promise<void>;

    const stream = new ReadableStream({
        async start(controller) {
            let unsubscribe: (() => void) | null = null;
            let interval: NodeJS.Timeout | null = null;
            let isReleased = false;

            releaseHandler = async () => {
                if (isReleased) return;
                isReleased = true;

                if (interval) clearInterval(interval);
                if (unsubscribe) unsubscribe();

                // Decrement global IP tracker
                const c = globalConns.get(ip) || 1;
                if (c <= 1) globalConns.delete(ip);
                else globalConns.set(ip, c - 1);
            };

            try {
                globalConns.set(ip, currentConns + 1);

                // 1. Subscribe to the Global Multiplexer (0 Connection cost)
                unsubscribe = realtimeManager.subscribe(projectId, (payload: string) => {
                    try {
                        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                    } catch (e) {
                        releaseHandler(); // Connection likely broken
                    }
                });

                // Abort listener for browser disconnect
                req.signal.addEventListener('abort', () => releaseHandler());

                controller.enqueue(encoder.encode('retry: 10000\n\n'));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`));

                interval = setInterval(async () => {
                    try {
                        // RE-CHECK SUSPENSION EVERY HEARTBEAT (15s)
                        const projectStatus = await redis.get<string>(`project_status:${projectId}`);
                        const orgStatus = await redis.get<string>(`org_status:${project.user_id}`);
                        
                        if (projectStatus === 'suspended' || orgStatus === 'suspended') {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Project or Organization suspended. Connection terminated.' })}\n\n`));
                            releaseHandler();
                            return;
                        }

                        controller.enqueue(encoder.encode(': heartbeat\n\n'));
                    } catch (e) {
                        releaseHandler();
                    }
                }, 15000);

            } catch (err) {
                console.error("[SSE Route Error]", err);
                if (releaseHandler) releaseHandler();
                try { controller.error(err); } catch (e) { }
            }
        },
        cancel() {
            if (releaseHandler) releaseHandler();
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
