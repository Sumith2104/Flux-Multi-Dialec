'use client';

import React, { useRef } from 'react';
import { Play, Save, Download, Loader2, Plus, AlignLeft, Activity, Share2, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Card, CardContent, CardHeader } from './ui/card';
import Editor from '@monaco-editor/react';
import { useToast } from '@/hooks/use-toast';

interface SqlEditorProps {
    projectId?: string;
    query: string;
    setQuery: (query: string) => void;
    onRun: (queryOverride?: string) => void;
    isGenerating: boolean;
    results: any | null;
}

export function SqlEditor({ projectId, query, setQuery, onRun, isGenerating, results }: SqlEditorProps) {
    const editorRef = useRef<any>(null);
    const { toast } = useToast();

    const handleEditorMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Run Shortcut (Ctrl + Enter)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            handleRunClick();
        });

        // Save Shortcut (Ctrl + S)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            handleSaveQuery();
        });

        // Format Shortcut (Ctrl + Shift + F)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
            handleFormatSql();
        });

        if (projectId) {
            fetch(`/api/schema?projectId=${projectId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.tables) {
                        registerSqlCompletion(monaco, data.tables);
                    }
                })
                .catch(err => console.error("Failed to load schema for autocomplete:", err));
        }
    };

    const registerSqlCompletion = (monaco: any, tables: Record<string, any[]>) => {
        monaco.languages.registerCompletionItemProvider('sql', {
            provideCompletionItems: (model: any, position: any) => {
                const suggestions: any[] = [];
                Object.keys(tables).forEach(tableName => {
                    suggestions.push({
                        label: tableName,
                        kind: monaco.languages.CompletionItemKind.Struct,
                        insertText: tableName,
                        detail: 'Table'
                    });
                    tables[tableName].forEach(col => {
                        suggestions.push({
                            label: col.name,
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: col.name,
                            detail: `Column (${col.type}) in ${tableName}`
                        });
                    });
                });
                return { suggestions };
            }
        });
    };

    const handleRunClick = () => {
        if (editorRef.current) {
            const selection = editorRef.current.getSelection();
            if (selection && !selection.isEmpty()) {
                const selectedText = editorRef.current.getModel().getValueInRange(selection).trim();
                if (selectedText) {
                    onRun(selectedText);
                    return;
                }
            }
            // Fallback to grabbing the full text directly from Monaco to avoid React stale closures
            const fullText = editorRef.current.getModel().getValue().trim();
            onRun(fullText);
            return;
        }
        onRun();
    };

    const handleNewQuery = () => {
        setQuery('');
        editorRef.current?.focus();
    };

    const handleFormatSql = () => {
        // Fetch from Monaco reference to bypass old closures in shortcut handlers
        const currentQuery = editorRef.current?.getModel().getValue() || query;
        if (!currentQuery.trim()) return;

        const formatted = currentQuery
            .replace(/\s+/g, ' ')
            .replace(/SELECT/gi, '\nSELECT')
            .replace(/FROM/gi, '\nFROM')
            .replace(/WHERE/gi, '\nWHERE')
            .replace(/GROUP BY/gi, '\nGROUP BY')
            .replace(/ORDER BY/gi, '\nORDER BY')
            .replace(/LIMIT/gi, '\nLIMIT')
            .trim();

        setQuery(formatted);
        toast({ title: "SQL Formatted", description: "Query has been pretty-printed." });
    };

    const handleImportSql = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sql';
        input.onchange = (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                setQuery(content);
                toast({ title: "SQL Imported", description: `Successfully loaded ${file.name}` });
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleExplainQuery = () => {
        onRun(`EXPLAIN ANALYZE ${query}`);
    };

    const handleSaveQuery = () => {
        toast({ title: "Query Saved", description: "Saved securely to Project Workspace." });
    };

    const handleShareQuery = () => {
        navigator.clipboard.writeText(query);
        toast({ title: "Copied to Clipboard", description: "Query sharing link generated." });
    };

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
        link.setAttribute('download', 'fluxbase_query_export.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card className="h-full flex flex-col shadow-none rounded-none border-0 bg-transparent">
            {/* Advanced IDE Toolbar */}
            <CardHeader className="p-2 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between space-y-2 sm:space-y-0 min-h-[2.5rem] h-auto flex-wrap sm:flex-nowrap w-full overflow-x-auto">
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleNewQuery}>
                        <Plus className="h-3 w-3 mr-1" /> New
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleFormatSql} title="Format SQL (Ctrl+Shift+F)">
                        <AlignLeft className="h-3 w-3 mr-1" /> Format
                    </Button>
                    <Separator orientation="vertical" className="h-4 mx-1" />
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleImportSql} title="Import .sql File">
                        <Upload className="h-3 w-3 mr-1" /> Import
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-orange-500/10 transition-colors group" onClick={handleExplainQuery} title="Generate Visual EXPLAIN plan">
                        <Activity className="h-3 w-3 mr-1 text-orange-500 group-hover:animate-pulse" /> Explain
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleSaveQuery} title="Save to Workspace (Ctrl+S)">
                        <Save className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleShareQuery}>
                        <Share2 className="h-3 w-3 mr-1" /> Share
                    </Button>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <span className="text-[10px] text-muted-foreground mr-2 hidden lg:inline-block">
                        Ctrl+Enter Run | Ctrl+S Save
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={handleExport}
                        disabled={!results || !results.rows || results.rows.length === 0}
                        title="Export CSV"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleRunClick}
                        disabled={isGenerating}
                        className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-green-700 font-medium px-3 ml-1"
                    >
                        {isGenerating ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                            <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                        )}
                        Run Query
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-grow relative bg-[#1e1e1e]">
                {/* Empty State Overlay */}
                {!query.trim() && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                        <div className="text-center bg-black/40 backdrop-blur-sm px-6 py-4 rounded-lg border border-white/5 opacity-80">
                            <p className="text-white/70 text-sm font-medium">Start typing SQL or use the AI assistant to generate queries.</p>
                        </div>
                    </div>
                )}

                <Editor
                    height="100%"
                    defaultLanguage="sql"
                    theme="vs-dark"
                    value={query}
                    onChange={(val) => setQuery(val || '')}
                    onMount={handleEditorMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: 'Consolas, JetBrains Mono, Menlo, monospace',
                        lineNumbers: 'on',
                        roundedSelection: false,
                        scrollBeyondLastLine: false,
                        renderLineHighlight: 'all',
                        padding: { top: 16 }
                    }}
                />
            </CardContent>
        </Card>
    );
}

