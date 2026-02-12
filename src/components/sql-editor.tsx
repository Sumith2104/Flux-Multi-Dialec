
'use client';

import { Play, Save, Download, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader } from './ui/card';

interface SqlEditorProps {
    query: string;
    setQuery: (query: string) => void;
    onRun: () => void;
    isGenerating: boolean;
    results: any | null;
}

export function SqlEditor({ query, setQuery, onRun, isGenerating, results }: SqlEditorProps) {

    const handleExport = () => {
        if (!results || !results.rows || results.rows.length === 0) {
            return;
        }

        const { columns, rows } = results;
        const header = columns.join(',');
        const csvRows = rows.map((row: any) =>
            columns.map((colName: string) => {
                let cell = row[colName] === null || row[colName] === undefined ? '' : String(row[colName]);
                if (cell.includes('"') || cell.includes(',')) {
                    cell = `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')
        );

        const csvString = [header, ...csvRows].join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'query_results.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card className="h-full flex flex-col shadow-none rounded-none border-0 bg-transparent">
            <CardHeader className="p-2 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between space-y-0 h-10">
                <div className="flex items-center gap-1">
                    {/* Placeholder for future toolbar items or empty */}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="default"
                        onClick={onRun}
                        disabled={isGenerating}
                        className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-green-700 font-medium px-3"
                    >
                        {isGenerating ? (
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        ) : (
                            <Play className="h-3 w-3 mr-1.5 fill-current" />
                        )}
                        Run
                    </Button>
                    <Separator orientation="vertical" className="h-4 mx-1" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled title="Save Query">
                        <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleExport}
                        disabled={!results || !results.rows || results.rows.length === 0}
                        title="Export CSV"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-grow relative bg-[#0d0d0d]">
                {/* Line numbers container */}
                <div className="absolute left-0 top-0 bottom-0 w-10 border-r border-white/5 bg-[#0d0d0d] flex flex-col items-end pr-2 py-4 text-xs font-mono text-muted-foreground/30 select-none pointer-events-none z-10">
                    {Array.from({ length: 50 }).map((_, i) => <div key={i} className="leading-6">{i + 1}</div>)}
                </div>

                <Textarea
                    placeholder="-- Enter your SQL query here..."
                    className="h-full w-full border-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm leading-6 pl-12 pt-4 bg-transparent text-gray-300 placeholder:text-gray-700"
                    value={query}
                    spellCheck={false}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </CardContent>
        </Card>
    );
}
