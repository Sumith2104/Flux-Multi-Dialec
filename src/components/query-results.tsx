'use client';

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { AlertCircle, Table as TableIcon, BarChart3, Code2, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface QueryResultsProps {
    results: { rows: any[], columns: string[] } | null;
    error: string | null;
    isGenerating: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

export function QueryResults({ results, error, isGenerating }: QueryResultsProps) {
    const [view, setView] = useState<'table' | 'chart' | 'json'>('table');
    const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');

    const chartDataConfig = useMemo(() => {
        if (!results || !results.rows || results.rows.length === 0) return null;

        const firstRow = results.rows[0];
        let xAxisKey = results.columns[0]; // Default string/category column
        let yAxisKey = results.columns.find(c => typeof firstRow[c] === 'number') || results.columns[1] || results.columns[0];

        // Try to identify a better string category for X and number for Y
        for (const col of results.columns) {
            if (typeof firstRow[col] === 'string' && !xAxisKey) xAxisKey = col;
            if (typeof firstRow[col] === 'number') yAxisKey = col;
        }

        return { xAxisKey, yAxisKey };
    }, [results]);

    if (isGenerating) {
        return (
            <div className="p-4 space-y-2 h-full">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="h-8 w-2/3" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 flex items-center gap-4 text-destructive h-full">
                <AlertCircle className="h-6 w-6" />
                <div className='font-mono text-sm'>
                    <p className='font-semibold'>Execution Failed</p>
                    <p>{error}</p>
                </div>
            </div>
        )
    }

    if (results && results.rows) {
        if (results.rows.length === 0) {
            return (
                <div className="p-12 text-center h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
                    <div className="rounded-full bg-background p-4 mb-4 border shadow-sm">
                        <AlertCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Success</h3>
                    <p className="text-sm">Query executed successfully. No rows returned.</p>
                    <p className="text-xs mt-2 font-mono bg-muted px-2 py-1 rounded">0 rows affected</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full bg-background relative overflow-hidden">
                <div className="flex items-center justify-between border-b px-2 py-1 shrink-0 bg-muted/10">
                    <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full max-w-[400px]">
                        <TabsList className="h-8 pb-0 bg-transparent gap-1">
                            <TabsTrigger value="table" className="h-7 text-[11px] data-[state=active]:bg-muted"><TableIcon className="h-3.5 w-3.5 mr-1" /> Table</TabsTrigger>
                            <TabsTrigger value="chart" className="h-7 text-[11px] data-[state=active]:bg-muted"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Chart</TabsTrigger>
                            <TabsTrigger value="json" className="h-7 text-[11px] data-[state=active]:bg-muted"><Code2 className="h-3.5 w-3.5 mr-1" /> JSON</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {view === 'chart' && (
                        <div className="flex items-center gap-1 mx-2">
                            <Button variant={chartType === 'bar' ? 'secondary' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setChartType('bar')}><BarChart3 className="h-3 w-3" /></Button>
                            <Button variant={chartType === 'line' ? 'secondary' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setChartType('line')}><LineChartIcon className="h-3 w-3" /></Button>
                            <Button variant={chartType === 'pie' ? 'secondary' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setChartType('pie')}><PieChartIcon className="h-3 w-3" /></Button>
                        </div>
                    )}
                </div>

                <div className="flex-grow relative overflow-auto">
                    {view === 'table' && (
                        <Table className="border-collapse border-spacing-0 w-full relative">
                            <TableHeader className="sticky top-0 z-20 shadow-sm">
                                <TableRow className="hover:bg-muted/50 border-b border-border">
                                    {results.columns.map((col, idx) => (
                                        <TableHead
                                            key={col}
                                            className="h-9 px-4 py-2 whitespace-nowrap bg-muted/80 backdrop-blur-sm text-xs font-semibold uppercase tracking-wider text-foreground border-r last:border-r-0 border-border select-none"
                                        >
                                            <div className="flex items-center gap-2">
                                                {col}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.rows.map((row, rowIndex) => (
                                    <TableRow key={rowIndex} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                                        {results.columns.map((col, colIndex) => (
                                            <TableCell
                                                key={`${rowIndex}-${col}`}
                                                className="px-4 py-1.5 whitespace-nowrap font-mono text-xs border-r border-border/50 last:border-r-0 group-hover:border-border/80"
                                            >
                                                {row[col] === null ? (
                                                    <span className="text-muted-foreground/50 italic text-[10px]">NULL</span>
                                                ) : (
                                                    <span className="text-foreground/90">{String(row[col])}</span>
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    {view === 'chart' && chartDataConfig && (
                        <div className="h-full w-full p-6 flex flex-col pt-8 pb-12">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === 'bar' ? (
                                    <BarChart data={results.rows}>
                                        <XAxis dataKey={chartDataConfig.xAxisKey} tick={{ fontSize: 12, fill: '#888' }} />
                                        <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                                        <Bar dataKey={chartDataConfig.yAxisKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                ) : chartType === 'line' ? (
                                    <LineChart data={results.rows}>
                                        <XAxis dataKey={chartDataConfig.xAxisKey} tick={{ fontSize: 12, fill: '#888' }} />
                                        <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                                        <Line type="monotone" dataKey={chartDataConfig.yAxisKey} stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                                    </LineChart>
                                ) : (
                                    <PieChart>
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                                        <Pie data={results.rows} dataKey={chartDataConfig.yAxisKey} nameKey={chartDataConfig.xAxisKey} cx="50%" cy="50%" outerRadius={120}>
                                            {results.rows.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    )}

                    {view === 'json' && (
                        <div className="p-4 h-full overflow-auto bg-[#1e1e1e]">
                            <pre className="text-xs font-mono text-green-400">
                                {JSON.stringify(results.rows, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/5/50">
            <div className="w-16 h-16 mb-4 rounded-xl bg-muted/50 flex items-center justify-center border border-dashed border-muted-foreground/30">
                <TableHead className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="font-medium text-foreground">No Results Detected</p>
            <p className="text-sm mt-1">Execute a query using the editor to view data.</p>
        </div>
    );
}

