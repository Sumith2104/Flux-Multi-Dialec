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
                <div className="p-4 text-center h-full flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Query executed successfully, but returned no rows.</p>
                </div>
            );
        }

        return (
            <div className="overflow-auto h-full">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary z-10 hidden sm:table-header-group">
                        {/* Hidden on mobile if needed, but usually we want headers. 
                             Added bg-secondary to distinguish header. 
                             Sticky is important.
                          */}
                        <TableRow>
                            {results.columns.map(col => <TableHead key={col} className="h-8 whitespace-nowrap">{col}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.rows.map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                                {results.columns.map(col => (
                                    <TableCell key={`${rowIndex}-${col}`} className="whitespace-nowrap font-mono text-xs">
                                        {row[col] === null ? <span className="text-muted-foreground italic">NULL</span> : String(row[col])}
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
        <div className="overflow-auto h-full flex flex-col items-center justify-center text-muted-foreground p-8">
            <div className="grid grid-cols-3 gap-4 opacity-20 mb-4 w-full max-w-sm">
                <div className="h-4 bg-current rounded col-span-1"></div>
                <div className="h-4 bg-current rounded col-span-1"></div>
                <div className="h-4 bg-current rounded col-span-1"></div>
                <div className="h-4 bg-current rounded col-span-3"></div>
                <div className="h-4 bg-current rounded col-span-2"></div>
                <div className="h-4 bg-current rounded col-span-1"></div>
            </div>
            <p>Run a query to see results.</p>
        </div>
    );
}
