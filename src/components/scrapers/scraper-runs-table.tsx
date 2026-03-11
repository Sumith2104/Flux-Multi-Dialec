"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"

interface ScraperRunsTableProps {
    scraperId: string | null
}

export function ScraperRunsTable({ scraperId }: ScraperRunsTableProps) {
    const [runs, setRuns] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!scraperId) {
            setRuns([])
            return
        }

        setLoading(true);
        setError(null);

        const eventSource = new EventSource(`/api/scrapers/runs/stream?scraperId=${scraperId}`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.success && data.runs) {
                    setRuns(data.runs);
                    setLoading(false);
                }
            } catch (err: any) {
                console.error("Realtime Parse Error:", err);
            }
        };

        eventSource.onerror = () => {
            // Optional: handle connection drops gracefully
            // setError("Lost connection to real-time cluster. Reconnecting...");
        };

        return () => {
            eventSource.close();
        };
    }, [scraperId])

    if (!scraperId) {
        return <div className="p-8 text-center text-muted-foreground border rounded-md">Select a Scraper to view its execution history.</div>
    }

    if (loading && runs.length === 0) {
        return <div className="p-8 flex justify-center border rounded-md"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    }

    if (error) {
        return <div className="p-8 text-center text-destructive border border-destructive/20 rounded-md bg-destructive/5">{error}</div>
    }

    if (runs.length === 0) {
        return <div className="p-8 text-center text-muted-foreground border rounded-md">No runs recorded yet. Click "Run Now" to test the engine.</div>
    }

    return (
        <div className="space-y-4 px-1 max-h-[800px] overflow-y-auto custom-scrollbar pb-4">
            {runs.map((run) => (
                <div key={run.id} className="p-4 border border-border/50 rounded-lg bg-card/50 hover:bg-muted/20 transition-colors relative">
                    <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-3">
                        <Badge variant="secondary" className={`font-bold border-none ${run.status === 'success' ? "bg-green-500/10 text-green-500" : run.status === 'failed' ? "bg-red-500/20 text-red-500" : ""}`}>
                            {run.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
                    </div>

                    {run.status === 'success' ? (
                        <div className="flex items-center gap-6 mt-2">
                            <div className="flex flex-col">
                                <span className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider mb-1">Rows Harvested</span>
                                <span className="font-semibold text-green-500 text-lg">+{run.rows_inserted}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider mb-1">Execution Time</span>
                                <span className="font-mono font-medium text-muted-foreground text-sm mt-auto mb-1">
                                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : '-'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-md text-xs font-mono break-words leading-relaxed">
                            {run.error_message || "Runtime exception occurred. No further stack trace provided."}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
