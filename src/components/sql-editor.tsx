
'use client';

import { Play, Save, History, Download, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader } from './ui/card';

interface SqlEditorProps {
    query: string;
    setQuery: (query: string) => void;
    onRun: () => void;
    isGenerating: boolean;
    results: { rows: any[], columns: string[] } | null;
}

export function SqlEditor({ query, setQuery, onRun, isGenerating, results }: SqlEditorProps) {
    
    const handleExport = () => {
        if (!results || results.rows.length === 0) {
            // In a real app, you might want to show a toast notification here.
            console.log("No data to export.");
            return;
        }

        const { columns, rows } = results;
        const header = columns.join(',');
        const csvRows = rows.map(row => 
            columns.map(colName => {
                let cell = row[colName] === null || row[colName] === undefined ? '' : String(row[colName]);
                // Escape quotes and wrap in quotes if it contains a comma or quote
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
        <Card className="h-full flex flex-col">
            <CardHeader className="p-2 border-b">
                 <div className="flex items-center gap-2">
                    <Button size="sm" onClick={onRun} disabled={isGenerating}>
                        {isGenerating ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Play className="h-4 w-4 mr-2" />
                        )}
                        Run
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <Button variant="ghost" size="sm" disabled>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                    </Button>
                    <Button variant="ghost" size="sm" disabled>
                        <History className="h-4 w-4 mr-2" />
                        History
                    </Button>
                     <div className="flex-grow" />
                    <Button variant="ghost" size="sm" onClick={handleExport} disabled={!results || results.rows.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-grow">
                <Textarea
                    placeholder="-- Write a SQL query..."
                    className="h-full w-full border-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-base"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </CardContent>
        </Card>
    );
}
