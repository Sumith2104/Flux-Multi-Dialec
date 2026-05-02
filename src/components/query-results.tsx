'use client';

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { AlertCircle, Table as TableIcon, BarChart3, Code2, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
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
        // Empty rows will fall through to the table renderer below instead of abruptly returning.

        return (
            <div className="flex flex-col h-full bg-background relative overflow-hidden">
                <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/10 px-2 py-1 sm:flex-row sm:items-center sm:justify-between">
                    <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full min-w-0 sm:max-w-[400px]">
                        <TabsList className="h-8 max-w-full gap-1 overflow-x-auto bg-transparent pb-0">
                            <TabsTrigger value="table" className="h-7 text-[11px] data-[state=active]:bg-muted"><TableIcon className="h-3.5 w-3.5 mr-1" /> Table</TabsTrigger>
                            <TabsTrigger value="chart" className="h-7 text-[11px] data-[state=active]:bg-muted"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Chart</TabsTrigger>
                            <TabsTrigger value="json" className="h-7 text-[11px] data-[state=active]:bg-muted"><Code2 className="h-3.5 w-3.5 mr-1" /> JSON</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {view === 'chart' && (
                        <div className="mx-0 flex items-center gap-1 sm:mx-2">
                            <Button variant={chartType === 'bar' ? 'secondary' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setChartType('bar')}><BarChart3 className="h-3 w-3" /></Button>
                            <Button variant={chartType === 'line' ? 'secondary' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setChartType('line')}><LineChartIcon className="h-3 w-3" /></Button>
                            <Button variant={chartType === 'pie' ? 'secondary' : 'ghost'} size="sm" className="h-6 w-6 p-0" onClick={() => setChartType('pie')}><PieChartIcon className="h-3 w-3" /></Button>
                        </div>
                    )}
                    {results.rows.length > 100 && view === 'table' && (
                        <div className="mr-2 flex items-center text-[10px] font-medium text-muted-foreground">
                            Showing first 100 of {results.rows.length.toLocaleString()} rows
                        </div>
                    )}
                    {results.rows.length > 500 && view === 'chart' && (
                        <div className="text-[10px] text-muted-foreground mr-2 font-medium flex items-center">
                            Showing first 500 of {results.rows.length.toLocaleString()} rows
                        </div>
                    )}
                </div>

                <div className="flex-grow relative overflow-auto">
                    {view === 'table' && (
                        <Table className="relative w-max min-w-full border-collapse border-spacing-0">
                            <TableHeader className="sticky top-0 z-20 shadow-sm">
                                <TableRow className="hover:bg-muted/50 border-b border-border">
                                    {results.columns.map((col, idx) => (
                                        <TableHead
                                            key={`${idx}-${col}`}
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
                                {results.rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={results.columns.length || 1} className="h-32 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <AlertCircle className="h-8 w-8 text-muted-foreground/50 opacity-50" />
                                                <p className="text-sm font-medium">No results found</p>
                                                <p className="text-xs opacity-70">Query executed successfully, but 0 rows were returned.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    results.rows.slice(0, 100).map((row, rowIndex) => (
                                        <TableRow key={rowIndex} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                                            {results.columns.map((col, colIndex) => (
                                                <TableCell
                                                    key={`${rowIndex}-${colIndex}-${col}`}
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
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}

                    {view === 'chart' && chartDataConfig && (
                        <div className="h-full w-full p-6 flex flex-col pt-8 pb-12">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === 'bar' ? (
                                    <BarChart data={results.rows.slice(0, 500)}>
                                        <XAxis dataKey={chartDataConfig.xAxisKey} tick={{ fontSize: 12, fill: '#888' }} />
                                        <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                                        <Bar dataKey={chartDataConfig.yAxisKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                ) : chartType === 'line' ? (
                                    <LineChart data={results.rows.slice(0, 500)}>
                                        <XAxis dataKey={chartDataConfig.xAxisKey} tick={{ fontSize: 12, fill: '#888' }} />
                                        <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                                        <Line type="monotone" dataKey={chartDataConfig.yAxisKey} stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                                    </LineChart>
                                ) : (
                                    <PieChart>
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                                        <Pie data={results.rows.slice(0, 500)} dataKey={chartDataConfig.yAxisKey} nameKey={chartDataConfig.xAxisKey} cx="50%" cy="50%" outerRadius={120}>
                                            {results.rows.slice(0, 500).map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    )}

                    {view === 'json' && (
                        <div className="h-full overflow-auto bg-card p-4">
                            <pre className="font-mono text-xs text-green-400">
                                {JSON.stringify(results.rows.slice(0, 100), null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col items-center justify-center bg-muted/50 p-8 text-muted-foreground">
            <div className="w-16 h-16 mb-4 rounded-xl bg-muted/50 flex items-center justify-center border border-dashed border-muted-foreground/30">
                <TableHead className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="font-medium text-foreground">No Results Detected</p>
            <p className="text-sm mt-1">Execute a query using the editor to view data.</p>
        </div>
    );
}

