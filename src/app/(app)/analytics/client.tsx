'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Trash2, LayoutGrid, Loader2 } from 'lucide-react';
import { UniversalChartRenderer } from '@/components/analytics/chart-renderer';
import { ManualBuilder } from '@/components/analytics/manual-builder';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
// @ts-ignore
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Moved above
import { createWidgetAction, removeWidgetAction } from './actions';
import { useToast } from "@/hooks/use-toast";
import { updateWidgetConfigAction } from './actions';

function AsyncWidget({ projectId, widget, onRemove }: { projectId: string, widget: any, onRemove: (id: string) => void }) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            try {
                const res = await fetch('/api/analytics/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, query: widget.query })
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to fetch data');
                if (isMounted) setData(json.data || []);
            } catch (e: any) {
                if (isMounted) setError(e.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchData();
        return () => { isMounted = false; };
    }, [projectId, widget.query]);

    let configObj = widget.config;
    if (typeof configObj === 'string') {
        try { configObj = JSON.parse(configObj); } catch (e) { configObj = {} }
    }

    return (
        <div className="h-full w-full pointer-events-auto">
        <Card className="h-full flex flex-col bg-[#1e1e1e] shadow-2xl border-white/10 overflow-hidden relative group">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-white/5 bg-[#252525] cursor-move drag-handle group/header">
                <CardTitle className="text-sm font-medium truncate pr-4 select-none">{widget.title}</CardTitle>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity text-muted-foreground hover:bg-destructive/20 hover:text-destructive shrink-0" 
                    onMouseDown={e => e.stopPropagation()} // Prevent clicking delete from starting a drag
                    onClick={() => onRemove(widget.id)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent className="flex-1 p-4 min-h-0 relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}
                {error ? (
                    <div className="flex h-full items-center justify-center text-rose-500 text-xs text-center px-4 font-mono whitespace-pre-wrap">{error}</div>
                ) : (
                    <UniversalChartRenderer type={widget.chart_type} data={data} config={configObj} />
                )}
            </CardContent>
        </Card>
        </div>
    );
}

import { useRouter } from 'next/navigation';

export default function AnalyticsDashboardClient({ projectId, initialWidgets }: { projectId: string, initialWidgets: any[] }) {
    const { toast } = useToast();
    const router = useRouter();
    
    const parsedWidgets = initialWidgets.map(w => ({
        ...w,
        configObj: typeof w.config === 'string' ? JSON.parse(w.config || '{}') : (w.config || {}),
    }));
    const [widgets, setWidgets] = useState(parsedWidgets);

    useEffect(() => {
        const updatedParsed = initialWidgets.map(w => ({
            ...w,
            configObj: typeof w.config === 'string' ? JSON.parse(w.config || '{}') : (w.config || {}),
        }));
        setWidgets(updatedParsed);
    }, [initialWidgets]);

    const [aiOpen, setAiOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [generating, setGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setGenerating(true);
        try {
            const res = await fetch('/api/analytics/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, prompt: aiPrompt })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Generation failed');

            if (!json.widgets || !Array.isArray(json.widgets)) throw new Error('Invalid AI response format');

            for (const widget of json.widgets) {
                const safeTitle = widget.title.length > 40 ? widget.title.substring(0, 40) + '...' : widget.title;
                await createWidgetAction(projectId, safeTitle, widget.chart_type, widget.query, widget.config);
            }
            
            toast({ title: 'Success', description: `Generated ${json.widgets.length} widget(s) successfully!` });
            setAiOpen(false);
            setAiPrompt('');
            router.refresh(); 
        } catch (e: any) {
            toast({ title: 'Generation Failed', description: e.message, variant: 'destructive' });
        } finally {
            setGenerating(false);
        }
    };

    const handleRemove = async (id: string) => {
        try {
            await removeWidgetAction(projectId, id);
            setWidgets(widgets.filter(w => w.id !== id));
        } catch (e: any) {
            toast({ title: 'Failed to delete target', description: e.message, variant: 'destructive' });
        }
    };

    const handleLayoutChange = async (layout: any[]) => {
        // Find if geometry actually changed
        for (const l of layout) {
            const widget = widgets.find(w => w.id === l.i);
            if (widget) {
                const currentL = widget.configObj.layout || {};
                 if (currentL.x !== l.x || currentL.y !== l.y || currentL.w !== l.w || currentL.h !== l.h) {
                     const newConfig = { ...widget.configObj, layout: { x: l.x, y: l.y, w: l.w, h: l.h, i: l.i } };
                     // background save
                     updateWidgetConfigAction(projectId, widget.id, newConfig).catch(e => console.error('Save layout failed', e));
                     // optimistically update local state
                     widget.configObj = newConfig;
                 }
            }
        }
    };

    // Generate initial react-grid-layout map
    const layoutMap = widgets.map((w, i) => {
        return w.configObj.layout || { i: w.id, x: (i * 4) % 12, y: Infinity, w: 4, h: 10 };
    });

    return (
        <div className="h-full min-h-screen flex flex-col space-y-6 p-6 relative">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Power BI Dashboard</h1>
                    <p className="text-muted-foreground">Visualize and analyze your database instantly.</p>
                </div>
                <div className="flex items-center gap-2">
                    <ManualBuilder projectId={projectId} onSaved={() => router.refresh()} />
                    <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-900/20">
                                <Sparkles className="w-4 h-4" />
                                Ask AI
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px] border-white/10 bg-background/95 backdrop-blur-xl">
                            <DialogHeader>
                                <DialogTitle>Generate Analytics Widget</DialogTitle>
                                <DialogDescription>Describe the data you want to see. AI will write the SQL and pick the best chart (Bar, Line, Pie, Map, etc).</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <Input 
                                    placeholder="e.g. Show me the number of users created per day" 
                                    className="col-span-3 bg-white/5" 
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
                                />
                            </div>
                            <Button onClick={handleGenerate} disabled={generating} className="w-full">
                                {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Generating SQL & Flow...</> : 'Generate Chart'}
                            </Button>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {widgets.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">No widgets yet</h3>
                    <p className="text-muted-foreground text-sm mb-6 max-w-sm text-center">Your dashboard is empty. Use the Ask AI button or Manual Builder to pin charts here.</p>
                    <Button onClick={() => setAiOpen(true)}>Generate First Chart</Button>
                </div>
            ) : (
                <div 
                    className="flex-1 rounded-xl border border-white/5 bg-black/20 relative pt-4 -mx-6 px-6"
                    style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                >
                    <AutoSizedGrid 
                        layoutMap={layoutMap} 
                        handleLayoutChange={handleLayoutChange} 
                        widgets={widgets} 
                        projectId={projectId} 
                        handleRemove={handleRemove} 
                    />
                </div>
            )}
        </div>
    );
}

// Custom WidthProvider to entirely bypass Turbopack ESM export crashes
function AutoSizedGrid({ layoutMap, handleLayoutChange, widgets, projectId, handleRemove }: any) {
    const [width, setWidth] = useState(1200);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver(entries => {
            setWidth(entries[0].contentRect.width);
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className="pb-20 flex-1 w-full">
            <ResponsiveGridLayout
                className="layout"
                width={width}
                layouts={{ lg: layoutMap }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={30}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".drag-handle"
                compactType={null}
                preventCollision={true}
                isResizable={true}
            >
                {widgets.map((widget: any) => (
                    <div key={widget.id}>
                        <AsyncWidget projectId={projectId} widget={widget} onRemove={handleRemove} />
                    </div>
                ))}
            </ResponsiveGridLayout>
        </div>
    );
}
