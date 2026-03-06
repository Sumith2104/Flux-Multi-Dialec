'use client';

import { useState, useEffect } from 'react';
import { Database, Table2, Columns, ChevronRight, ChevronDown, Play, LayoutGrid, Hash, Loader2, Folder, FolderOpen, Box, Binary, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ColumnDef {
    name: string;
    type: string;
}

interface SchemaData {
    [tableName: string]: ColumnDef[];
}

export function SchemaExplorer({ projectId, onInsertQuery }: { projectId?: string, onInsertQuery: (query: string) => void }) {
    const [schema, setSchema] = useState<SchemaData | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

    // Core structural folders
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['tables']));

    useEffect(() => {
        if (!projectId) {
            setSchema(null);
            return;
        }
        const fetchSchema = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/schema?projectId=${projectId}`);
                const data = await res.json();
                if (data.success && data.tables) {
                    setSchema(data.tables);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchSchema();
    }, [projectId]);

    const toggleFolder = (folder: string) => {
        const next = new Set(expandedFolders);
        if (next.has(folder)) next.delete(folder);
        else next.add(folder);
        setExpandedFolders(next);
    };

    const toggleTable = (tableName: string) => {
        const next = new Set(expandedTables);
        if (next.has(tableName)) next.delete(tableName);
        else next.add(tableName);
        setExpandedTables(next);
    };

    if (!projectId) {
        return (
            <div className="h-full flex items-center justify-center p-4 text-center">
                <span className="text-xs text-muted-foreground opacity-70">Select a project to view schema</span>
            </div>
        );
    }

    if (loading && !schema) {
        return (
            <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        );
    }

    const tableNames = schema ? Object.keys(schema) : [];

    return (
        <div className="flex flex-col h-full overflow-y-auto w-full text-sm font-mono pb-8">
            <div className="px-3 py-2 border-b bg-muted/10 sticky top-0 z-10 flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold text-xs tracking-tight">Database Explorer</span>
            </div>

            <div className="p-2 select-none">

                {/* Tables Folder */}
                <div className="mb-1">
                    <div
                        className="flex items-center gap-1.5 p-1 rounded hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => toggleFolder('tables')}
                    >
                        {expandedFolders.has('tables') ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                        <span className="text-xs font-medium">Tables ({tableNames.length})</span>
                    </div>

                    {expandedFolders.has('tables') && (
                        <div className="pl-4 mt-1 border-l ml-2.5 border-border/40 flex flex-col gap-0.5">
                            {tableNames.length === 0 && !loading && (
                                <span className="text-[10px] text-muted-foreground p-1 italic h-6 flex items-center">No tables found</span>
                            )}

                            {tableNames.map((tableName) => (
                                <div key={tableName}>
                                    <div
                                        className="group flex flex-col rounded hover:bg-muted/40 transition-colors"
                                    >
                                        <div className="flex items-center justify-between p-1 pl-1 cursor-pointer" onClick={() => toggleTable(tableName)}>
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                {expandedTables.has(tableName) ?
                                                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" /> :
                                                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                                                }
                                                <Table2 className="h-3.5 w-3.5 shrink-0 text-blue-500/80" />
                                                <span className="text-xs truncate" title={tableName}>{tableName}</span>
                                            </div>
                                        </div>

                                        {/* Quick Actions (Hover) */}
                                        <div className="hidden group-hover:flex items-center gap-1 px-5 pb-1.5 pt-0.5">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-5 px-1.5 text-[9px] bg-primary/10 hover:bg-primary/20 text-primary border-transparent"
                                                onClick={(e) => { e.stopPropagation(); onInsertQuery(`SELECT * FROM ${tableName} LIMIT 50;`); }}
                                            >
                                                Preview
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-5 px-1.5 text-[9px] bg-muted/50 border-transparent"
                                                onClick={(e) => { e.stopPropagation(); onInsertQuery(`SELECT count(*) FROM ${tableName};`); }}
                                            >
                                                Count Count
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Columns */}
                                    {expandedTables.has(tableName) && (
                                        <div className="pl-5 py-1 border-l ml-2.5 border-border/30 flex flex-col gap-1">
                                            {schema![tableName].map((col, idx) => (
                                                <div key={idx} className="flex items-center justify-between group/col px-1">
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <Columns className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                                        <span className="text-[10px] truncate text-foreground/80" title={col.name}>{col.name}</span>
                                                    </div>
                                                    <span className="text-[9px] text-muted-foreground/60 font-medium shrink-0 ml-2">{col.type}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Mocked structural folders matching IDE standards */}
                <div className="mb-1">
                    <div className="flex items-center gap-1.5 p-1 rounded cursor-not-allowed opacity-50 text-muted-foreground">
                        <Folder className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Views (0)</span>
                    </div>
                </div>
                <div className="mb-1">
                    <div className="flex items-center gap-1.5 p-1 rounded cursor-not-allowed opacity-50 text-muted-foreground">
                        <Folder className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Indexes (0)</span>
                    </div>
                </div>
                <div className="mb-1">
                    <div className="flex items-center gap-1.5 p-1 rounded cursor-not-allowed opacity-50 text-muted-foreground">
                        <FileCode2 className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Functions</span>
                    </div>
                </div>
                <div className="mb-1">
                    <div className="flex items-center gap-1.5 p-1 rounded cursor-not-allowed opacity-50 text-muted-foreground">
                        <Box className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Extensions</span>
                    </div>
                </div>

            </div>
        </div>
    );
}

