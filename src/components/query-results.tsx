'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface QueryResultsProps {
    results: { rows: any[], columns: string[] } | null;
    error: string | null;
    isGenerating: boolean;
}

export function QueryResults({ results, error, isGenerating }: QueryResultsProps) {

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
            <div className="overflow-auto h-full bg-background relative">
                <Table className="border-collapse border-spacing-0 w-full relative">
                    <TableHeader className="sticky top-0 z-20 shadow-sm">
                        <TableRow className="hover:bg-muted/50 border-b border-border">
                            {results.columns.map((col, idx) => (
                                <TableHead
                                    key={col}
                                    className="h-9 px-4 py-2 whitespace-nowrap bg-muted/80 backdrop-blur-sm text-xs font-semibold uppercase tracking-wider text-foreground border-r last:border-r-0 border-border select-none"
                                >
                                    <div className="flex items-center gap-2">
                                        {/* Simple icon based on type estimate could go here */}
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
