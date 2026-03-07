import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Run {
    run_id: string;
    rows_inserted: number;
    status: string;
    error_message: string | null;
    run_time: string;
}

export function ScraperRunsTable({ scraperId, refreshKey = 0 }: { scraperId: string, refreshKey?: number }) {
    const [runs, setRuns] = useState<Run[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!scraperId) return;
        setLoading(true);
        fetch(`/api/scrapers/runs?scraperId=${scraperId}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setRuns(data.runs || []);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [scraperId, refreshKey]);

    if (loading) return <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading logs...</div>;

    if (runs.length === 0) return <div className="p-4 text-sm text-muted-foreground">No execution history found.</div>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Run Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rows Inserted</TableHead>
                    <TableHead>Message</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {runs.map(run => (
                    <TableRow key={run.run_id}>
                        <TableCell className="font-mono text-xs">
                            {new Date(run.run_time).toLocaleString()}
                        </TableCell>
                        <TableCell>
                            {run.status === 'success' ? (
                                <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">Success</Badge>
                            ) : run.status === 'failed' ? (
                                <Badge variant="outline" className="text-red-500 border-red-500/20 bg-red-500/10">Failed</Badge>
                            ) : (
                                <Badge variant="secondary" className="animate-pulse">Running</Badge>
                            )}
                        </TableCell>
                        <TableCell className="font-mono">{run.rows_inserted}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {run.error_message || '—'}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
