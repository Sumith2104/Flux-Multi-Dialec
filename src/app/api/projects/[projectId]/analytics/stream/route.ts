import { getAnalyticsStatsAction } from '@/app/(app)/dashboard/analytics-actions';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
    const resolvedParams = await Promise.resolve(params);
    const projectId = resolvedParams.projectId;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let isClosed = false;

            req.signal.addEventListener('abort', () => {
                isClosed = true;
            });

            while (!isClosed) {
                try {
                    // Fetch authentic absolute totals directly from AWS PostgreSQL
                    const stats = await getAnalyticsStatsAction(projectId);

                    if (isClosed) break;

                    const payload = JSON.stringify({ stats });
                    controller.enqueue(encoder.encode(`data: ${payload}\n\n`));

                    // Push updates every 2.0 seconds for a snappy Real-Time experience
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                } catch (err: any) {
                    // If the client disconnected but Next.js didn't immediately fire the abort signal,
                    // enqueue() will throw. We MUST catch this and break the ghost loop.
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
}
