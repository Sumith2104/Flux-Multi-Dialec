import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { getPgPool } from '@/lib/pg';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const userId = await getCurrentUserId();

    if (!userId) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const project = await getProjectById(projectId, userId);
        if (!project) {
            return new Response('Project not found', { status: 404 });
        }

        const pool = getPgPool();
        const client = await pool.connect();

        let isReleased = false;
        let keepAliveInterval: NodeJS.Timeout;
        let handleNotification: (msg: any) => void;

        const releaseClient = () => {
            if (isReleased) return;
            isReleased = true;

            if (keepAliveInterval) clearInterval(keepAliveInterval);
            if (handleNotification) client.removeListener('notification', handleNotification);

            try {
                client.query('UNLISTEN fluxbase_live')
                    .catch(() => { }) 
                    .finally(() => {
                        try { client.release(); } catch (e) { }
                    });
            } catch (e) {
                try { client.release(); } catch (err) { }
            }
        };

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const sendEvent = (eventName: string, data: string) => {
                    controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`));
                };

                sendEvent('init', '{"status": "connected"}');

                handleNotification = (msg: any) => {
                    try {
                        const payload = JSON.parse(msg.payload);
                        if (payload.event_type === 'schema_update' && payload.project_id === projectId) {
                            sendEvent('schema_update', JSON.stringify(payload));
                        }
                    } catch (e) {
                        console.error('Error parsing NOTIFY payload:', e);
                    }
                };

                client.on('notification', handleNotification);

                try {
                    await client.query('LISTEN fluxbase_live');
                } catch (listenError) {
                    console.error('Failed to LISTEN:', listenError);
                    controller.error(listenError);
                    releaseClient();
                    return;
                }

                keepAliveInterval = setInterval(() => {
                    try {
                        sendEvent('ping', '{}');
                    } catch (e) {
                        releaseClient();
                    }
                }, 15000);

                request.signal.addEventListener('abort', () => {
                    releaseClient();
                });
            },
            cancel() {
                releaseClient();
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            },
        });

    } catch (error) {
        console.error('Error in Schema SSE setup:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
