import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { getPgPool } from '@/lib/pg';

// Removed maxDuration because it crashes standard Node.js Next.js dev servers
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; tableId: string }> }
) {
    const { projectId, tableId } = await params;
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
                // Ensure we release the connection back to the pool cleanly after unlistening
                client.query('UNLISTEN fluxbase_live')
                    .catch(() => { }) // Ignore unlisten errors during death
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

                // Send an initial heartbeat
                sendEvent('init', '{"status": "connected"}');

                handleNotification = (msg: any) => {
                    try {
                        const payload = JSON.parse(msg.payload);

                        // We filter for matching project_id and table_id
                        if (payload.project_id === projectId && (payload.table_id === tableId || payload.table_id === '*')) {
                            const dataString = JSON.stringify(payload);
                            sendEvent('update', dataString);
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

                // Keep connection alive with simple heartbeats
                keepAliveInterval = setInterval(() => {
                    try {
                        sendEvent('ping', '{}');
                    } catch (e) {
                        releaseClient();
                    }
                }, 15000);

                // Handle client disconnect explicitly
                request.signal.addEventListener('abort', () => {
                    releaseClient();
                });
            },
            cancel() {
                // Cancel triggers if the stream breaks downstream
                releaseClient();
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no' // Prevent Nginx buffering
            },
        });

    } catch (error) {
        console.error('Error in SSE setup:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
