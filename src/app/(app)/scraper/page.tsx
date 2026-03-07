'use client';

import { useState, useEffect, useContext } from 'react';
import { Globe, Trash2, Database, Clock, Play, Code2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { CreateScraperDialog } from '@/components/scrapers/create-scraper-dialog';
import { EditScraperDialog } from '@/components/scrapers/edit-scraper-dialog';
import { ScraperRunsTable } from '@/components/scrapers/scraper-runs-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ScraperJob {
    scraper_id: string;
    url: string;
    table_name: string;
    schedule: string;
    status: string;
    created_at: string;
    last_run: string | null;
    next_run: string | null;
}

export default function ScraperDashboard() {
    const { project } = useContext(ProjectContext);
    const { toast } = useToast();
    const [scrapers, setScrapers] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedScraper, setSelectedScraper] = useState<string | null>(null);
    const [refreshLogsKey, setRefreshLogsKey] = useState(0);

    const fetchScrapers = async () => {
        if (!project?.project_id) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/scrapers?projectId=${project.project_id}`);
            const data = await res.json();
            if (data.success) {
                setScrapers(data.scrapers || []);
                if (data.scrapers?.length > 0 && !selectedScraper) {
                    setSelectedScraper(data.scrapers[0].scraper_id);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchScrapers();
    }, [project?.project_id]);

    const deleteScraper = async (scraperId: string) => {
        try {
            const res = await fetch(`/api/scrapers?scraperId=${scraperId}`, { method: 'DELETE' });
            if (res.ok) {
                toast({ title: 'Scraper Deleted' });
                if (selectedScraper === scraperId) setSelectedScraper(null);
                fetchScrapers();
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error deleting scraper' });
        }
    };

    const runScraper = async (scraperId: string) => {
        toast({ title: 'Triggering Scraper...', description: 'Job started in the background.' });
        try {
            const res = await fetch(`/api/scrapers/${scraperId}/run`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                toast({ variant: 'destructive', title: 'Failed to trigger scraper', description: data.error });
            }
            // Trigger a refresh after a small delay to show 'running' status
            setTimeout(() => {
                fetchScrapers();
                triggerLogsRefresh();
            }, 2000);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Network Error' });
        }
    };

    const triggerLogsRefresh = () => setRefreshLogsKey(k => k + 1);

    if (!project) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p className="text-muted-foreground">Select a project to access the Scraper Engine.</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Globe className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Scrapers</h1>
                        <p className="text-sm text-muted-foreground mt-1">Automated pipelines for web data extraction.</p>
                    </div>
                </div>
                <div>
                    <CreateScraperDialog projectId={project.project_id} onCreated={fetchScrapers} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LIST OF SCRAPERS */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Configured Pipelines</h3>

                    {loading ? (
                        <div className="animate-pulse space-y-3">
                            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/30 rounded-lg border border-white/5" />)}
                        </div>
                    ) : scrapers.length === 0 ? (
                        <Card className="border-dashed shadow-none bg-transparent">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Code2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-muted-foreground font-medium">No active pipelines.</p>
                                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">Create a new scraper job to fetch records automatically.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {scrapers.map(scraper => (
                                <Card
                                    key={scraper.scraper_id}
                                    onClick={() => setSelectedScraper(scraper.scraper_id)}
                                    className={`cursor-pointer transition-all ${selectedScraper === scraper.scraper_id ? 'border-primary bg-primary/5' : 'hover:border-foreground/30'}`}
                                >
                                    <CardContent className="p-4 relative">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1.5 overflow-hidden">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm truncate">{scraper.table_name}</span>
                                                    {scraper.status === 'running' && <Badge variant="secondary" className="text-[10px] h-4 leading-none bg-blue-500/20 text-blue-400 border-none animate-pulse">Running</Badge>}
                                                    {scraper.status === 'failed' && <Badge variant="destructive" className="text-[10px] h-4 leading-none">Failed</Badge>}
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate opacity-70 flex items-center gap-1.5 font-mono">
                                                    <Globe className="h-3 w-3 shrink-0" /> {new URL(scraper.url).hostname}
                                                </p>
                                                <div className="flex items-center gap-4 mt-3">
                                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/40 px-1.5 py-0.5 rounded">
                                                        <Clock className="h-3 w-3" /> {scraper.schedule}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/40 px-1.5 py-0.5 rounded">
                                                        <Database className="h-3 w-3" /> {scraper.table_name}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-green-400" onClick={() => runScraper(scraper.scraper_id)}>
                                                    <Play className="h-4 w-4" />
                                                </Button>
                                                <EditScraperDialog scraper={scraper} onSaved={fetchScrapers} />
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={(e) => e.stopPropagation()}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will permanently delete the <strong>{scraper.table_name}</strong> data pipeline and all its execution history logs. The fetched data inside the table will be kept safe.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => deleteScraper(scraper.scraper_id)} className="bg-red-500 hover:bg-red-600 text-white">
                                                                Delete Pipeline
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            <Button variant="ghost" size="sm" onClick={fetchScrapers} className="w-full text-xs text-muted-foreground"><RefreshCw className="h-3 w-3 mr-2" /> Refresh Status</Button>
                        </div>
                    )}
                </div>

                {/* RUN HISTORY */}
                <div className="lg:col-span-2">
                    <Card className="h-full flex flex-col shadow-sm">
                        <CardHeader className="bg-muted/30 pb-4 border-b">
                            <CardTitle className="text-lg flex flex-row items-center justify-between w-full">
                                <span className="flex items-center gap-2">Job Execution Logs</span>
                                {selectedScraper && (
                                    <Button variant="outline" size="sm" onClick={triggerLogsRefresh} className="h-8">
                                        <RefreshCw className="h-3 w-3 mr-2" /> Refresh Logs
                                    </Button>
                                )}
                            </CardTitle>
                            <CardDescription>
                                Real-time execution history and data insertion metrics for the selected pipeline.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 flex-grow bg-black/20">
                            {selectedScraper ? (
                                <ScraperRunsTable scraperId={selectedScraper} refreshKey={refreshLogsKey} />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground/50">
                                    <AlertTriangle className="h-10 w-10 mb-3 opacity-30" />
                                    <p className="text-sm">Select a pipeline to view its run history.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}
