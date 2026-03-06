'use client';

import { useState, useEffect, useContext } from 'react';
import { Globe, Plus, Trash2, Database, Code2, Play, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Mapping {
    column: string;
    selector: string;
}

export default function ScraperPage() {
    const { project } = useContext(ProjectContext);
    const { toast } = useToast();

    const [url, setUrl] = useState('');
    const [targetTable, setTargetTable] = useState('');
    const [mappings, setMappings] = useState<Mapping[]>([{ column: '', selector: '' }]);
    const [tables, setTables] = useState<string[]>([]);

    const [isExecuting, setIsExecuting] = useState(false);
    const [result, setResult] = useState<any>(null);

    // Fetch schema to populate table dropdown
    useEffect(() => {
        if (!project?.project_id) return;

        fetch(`/api/schema?projectId=${project.project_id}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.tables) {
                    setTables(Object.keys(data.tables));
                }
            })
            .catch(err => console.error("Failed to load tables:", err));
    }, [project?.project_id]);

    const addMapping = () => {
        setMappings([...mappings, { column: '', selector: '' }]);
    };

    const removeMapping = (index: number) => {
        const newMappings = [...mappings];
        newMappings.splice(index, 1);
        setMappings(newMappings);
    };

    const updateMapping = (index: number, field: 'column' | 'selector', value: string) => {
        const newMappings = [...mappings];
        newMappings[index][field] = value;
        setMappings(newMappings);
    };

    const handleRunScraper = async () => {
        if (!url || !url.startsWith('http')) {
            toast({ variant: 'destructive', title: 'Invalid URL', description: 'Please enter a valid HTTP/HTTPS URL.' });
            return;
        }

        if (!targetTable) {
            toast({ variant: 'destructive', title: 'No Table Selected', description: 'Select a destination table for the scraped data.' });
            return;
        }

        const validMappings = mappings.filter(m => m.column.trim() !== '' && m.selector.trim() !== '');
        if (validMappings.length === 0) {
            toast({ variant: 'destructive', title: 'Invalid Mappings', description: 'Provide at least one Column -> CSS Selector mapping.' });
            return;
        }

        setIsExecuting(true);
        setResult(null);

        try {
            const response = await fetch('/api/scraper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project?.project_id,
                    url,
                    targetTable,
                    mappings: validMappings
                })
            });

            const data = await response.json();
            setResult(data);

            if (data.success) {
                toast({ title: 'Scraping Successful', description: `Successfully inserted ${data.insertedRows || 0} rows.` });
            } else {
                toast({ variant: 'destructive', title: 'Scraping Failed', description: data.error || 'Unknown error occurred.' });
            }
        } catch (error: any) {
            setResult({ success: false, error: error.message });
            toast({ variant: 'destructive', title: 'Execution Error', description: error.message });
        } finally {
            setIsExecuting(false);
        }
    };

    if (!project) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p className="text-muted-foreground">Select a project to access the Scraper Engine.</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-3 border-b pb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <Globe className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Data Scraper Engine</h1>
                    <p className="text-sm text-muted-foreground mt-1">Extract HTML nodes via CSS selectors and map them directly into your database tables.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* CONFIGURATION PANEL */}
                <div className="space-y-6">
                    <Card className="shadow-sm">
                        <CardHeader className="bg-muted/30 pb-4 border-b">
                            <CardTitle className="text-lg flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /> Target Configuration</CardTitle>
                            <CardDescription>Define the website URL and the destination PostgreSQL table.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target URL</label>
                                <Input
                                    placeholder="https://news.ycombinator.com"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="font-mono text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Destination Table</label>
                                <Select value={targetTable} onValueChange={setTargetTable}>
                                    <SelectTrigger className="w-full font-mono text-sm">
                                        <SelectValue placeholder="Select a table..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tables.length === 0 && <SelectItem value="none" disabled>No tables found</SelectItem>}
                                        {tables.map(t => (
                                            <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="bg-muted/30 pb-4 border-b flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2"><Code2 className="h-4 w-4 text-muted-foreground" /> Field Extraction Map</CardTitle>
                                <CardDescription className="mt-1">Map DB Columns to CSS Selectors (e.g. `.title a`).</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={addMapping} className="h-8">
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-4">
                            {mappings.map((mapping, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <div className="flex-1 space-y-1">
                                        {idx === 0 && <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Column Name</label>}
                                        <Input
                                            placeholder="e.g. title"
                                            value={mapping.column}
                                            onChange={(e) => updateMapping(idx, 'column', e.target.value)}
                                            className="font-mono text-xs"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        {idx === 0 && <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">CSS Selector</label>}
                                        <Input
                                            placeholder="e.g. h1.main-title"
                                            value={mapping.selector}
                                            onChange={(e) => updateMapping(idx, 'selector', e.target.value)}
                                            className="font-mono text-xs"
                                        />
                                    </div>
                                    <div className={`shrink-0 ${idx === 0 ? 'mt-5' : ''}`}>
                                        <Button variant="ghost" size="icon" onClick={() => removeMapping(idx)} className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                        <CardFooter className="bg-muted/10 border-t pt-4">
                            <Button onClick={handleRunScraper} disabled={isExecuting} className="w-full shadow-sm hover:shadow-md transition-all">
                                {isExecuting ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4 mr-2" />
                                )}
                                Execute Pipeline & Insert Data
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* OUTPUT PANEL */}
                <div className="space-y-6 h-full flex flex-col">
                    <Card className="shadow-sm flex-grow flex flex-col overflow-hidden">
                        <CardHeader className="bg-muted/30 pb-4 border-b shrink-0">
                            <CardTitle className="text-lg">Execution Logs</CardTitle>
                            <CardDescription>Pipeline execution results and extracted JSON payloads.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 bg-[#0d1117] flex-grow overflow-auto relative rounded-b-xl border-t border-white/5">
                            {isExecuting ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-muted-foreground">
                                    <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                                    <p className="font-mono text-sm inline-flex items-center gap-2"><Globe className="h-3 w-3 animate-pulse" /> Fetching Document...</p>
                                    <p className="font-mono text-xs opacity-50 mt-1">Applying CSS selectors and inserting rows...</p>
                                </div>
                            ) : result ? (
                                <div className="p-4 space-y-4">
                                    {result.success ? (
                                        <Alert className="bg-green-500/10 border-green-500/30 text-green-500">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <AlertTitle>Success</AlertTitle>
                                            <AlertDescription className="text-xs opacity-90 mt-1 font-mono">
                                                Pipeline executed safely. Inserted {result.insertedRows} rows.
                                            </AlertDescription>
                                        </Alert>
                                    ) : (
                                        <Alert variant="destructive" className="bg-red-950/20 border-red-900/40">
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertTitle>Execution Failed</AlertTitle>
                                            <AlertDescription className="text-xs opacity-90 mt-1 font-mono break-all">
                                                {result.error}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {result.data && (
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Extracted Payload</span>
                                            <pre className="text-xs font-mono text-green-400 bg-black/40 p-3 rounded-md border border-white/5 overflow-x-auto">
                                                {JSON.stringify(result.data, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40 font-mono text-sm">
                                    <Database className="h-12 w-12 mb-3 opacity-20" />
                                    Ready awaiting pipeline execution...
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}

