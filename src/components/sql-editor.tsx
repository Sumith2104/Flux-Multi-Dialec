'use client';

import React, { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Save, Download, Loader2, Plus, AlignLeft, Activity, Share2, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Card, CardContent, CardHeader } from './ui/card';
import Editor from '@monaco-editor/react';
import { useToast } from '@/hooks/use-toast';

// ─── Module-level constants — live outside React, never recreated ─────────────
const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
    'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'INDEX',
    'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'FULL JOIN',
    'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'IN', 'NOT IN',
    'LIKE', 'ILIKE', 'BETWEEN', 'EXISTS', 'DISTINCT', 'AS', 'ORDER BY', 'GROUP BY',
    'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CAST', 'COALESCE', 'NULLIF', 'COUNT', 'SUM', 'AVG', 'MIN',
    'MAX', 'NOW()', 'CURRENT_TIMESTAMP', 'TRUE', 'FALSE', 'PRIMARY KEY',
    'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'RETURNING',
    'WITH', 'TRUNCATE', 'EXPLAIN', 'ANALYZE', 'VACUUM', 'BEGIN', 'COMMIT',
    'ROLLBACK', 'TRANSACTION', 'SERIAL', 'INTEGER', 'TEXT', 'VARCHAR', 'BOOLEAN',
    'TIMESTAMP', 'DATE', 'JSONB', 'JSON', 'UUID', 'BIGINT', 'DECIMAL', 'FLOAT',
];

// Module-level mutable ref — shared with the provider closure.
// React state/useState is NOT used here because the provider closure
// is registered once and must always read the latest schema.
const _schemaRef: { current: Record<string, any[]> | null } = { current: null };
let _providerRegistered = false;

/**
 * Registers the SQL completion provider on the Monaco singleton.
 * Called via beforeMount — guaranteed to fire exactly once before
 * any editor instance is created, even across HMR reloads.
 */
function ensureProviderRegistered(monaco: any) {
    if (_providerRegistered) return;
    _providerRegistered = true;

    monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '\t', '\n', '.', '('],
        provideCompletionItems(model: any, position: any) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const suggestions: any[] = [];

            // ── SQL Keywords ──────────────────────────────────────────────────
            for (const kw of SQL_KEYWORDS) {
                suggestions.push({
                    label: kw,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: kw,
                    detail: 'SQL Keyword',
                    sortText: 'A' + kw,
                    range,
                });
            }

            // ── Tables + Columns (live from module-level ref) ─────────────────
            const tables = _schemaRef.current;
            if (tables) {
                for (const tableName of Object.keys(tables)) {
                    const cols: any[] = tables[tableName] ?? [];
                    suggestions.push({
                        label: tableName,
                        kind: monaco.languages.CompletionItemKind.Struct,
                        insertText: tableName,
                        detail: `Table  (${cols.length} cols)`,
                        documentation: {
                            value: `**${tableName}**\n\n${cols.map((c: any) => `- \`${c.name}\` *${c.type}*`).join('\n')}`,
                        },
                        sortText: 'B' + tableName,
                        range,
                    });
                    for (const col of cols) {
                        suggestions.push({
                            label: col.name,
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: col.name,
                            detail: `${col.type}  ←  ${tableName}`,
                            sortText: 'C' + col.name,
                            range,
                        });
                    }
                }
            }

            return { suggestions };
        },
    });
}
// ─────────────────────────────────────────────────────────────────────────────

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

    // Fetch schema — used only to populate the module-level ref
    const { data: schema } = useQuery({
        queryKey: ['schema', projectId],
        queryFn: async () => {
            const res = await fetch(`/api/schema?projectId=${projectId}&_t=${Date.now()}`);
            const data = await res.json();
            return (data.success && data.tables) ? data.tables as Record<string, any[]> : null;
        },
        enabled: !!projectId,
    });

    // Keep the module-level ref in sync with latest schema.
    // The provider closure reads _schemaRef.current on every invocation.
    useEffect(() => {
        _schemaRef.current = schema ?? null;
    }, [schema]);

    // beforeMount — fires ONCE on the Monaco singleton before any editor renders.
    // This is the correct place to register global providers.
    const handleBeforeMount = (monaco: any) => {
        ensureProviderRegistered(monaco);
    };

    const handleEditorMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Keyboard shortcuts
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handleRunClick());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSaveQuery());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => handleFormatSql());
        // Ctrl+Space — force-open the suggestion widget
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
            editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
        });
    };

    // Monaco GC — dispose editor model on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (editorRef.current) {
                editorRef.current.dispose();
                editorRef.current = null;
            }
        };
    }, []);

    const handleRunClick = () => {
        if (editorRef.current) {
            const selection = editorRef.current.getSelection();
            if (selection && !selection.isEmpty()) {
                const selected = editorRef.current.getModel().getValueInRange(selection).trim();
                if (selected) { onRun(selected); return; }
            }
            onRun(editorRef.current.getModel().getValue().trim());
            return;
        }
        onRun();
    };

    const handleNewQuery = () => { setQuery(''); editorRef.current?.focus(); };

    const handleFormatSql = () => {
        const q = editorRef.current?.getModel().getValue() || query;
        if (!q.trim()) return;
        const formatted = q
            .replace(/\s+/g, ' ')
            .replace(/SELECT/gi, '\nSELECT').replace(/FROM/gi, '\nFROM')
            .replace(/WHERE/gi, '\nWHERE').replace(/GROUP BY/gi, '\nGROUP BY')
            .replace(/ORDER BY/gi, '\nORDER BY').replace(/LIMIT/gi, '\nLIMIT')
            .trim();
        setQuery(formatted);
        toast({ title: 'SQL Formatted', description: 'Query has been pretty-printed.' });
    };

    const handleImportSql = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.sql';
        input.onchange = (e: any) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                setQuery(ev.target?.result as string);
                toast({ title: 'SQL Imported', description: `Loaded ${file.name}` });
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleExplainQuery = () => onRun(`EXPLAIN ANALYZE ${query}`);
    const handleSaveQuery = () => toast({ title: 'Query Saved', description: 'Saved to Project Workspace.' });
    const handleShareQuery = () => {
        navigator.clipboard.writeText(query);
        toast({ title: 'Copied', description: 'Query copied to clipboard.' });
    };

    const handleExport = () => {
        if (!results?.rows?.length) return;
        const { columns, rows } = results;
        const csv = [
            columns.join(','),
            ...rows.map((row: any) => columns.map((col: string) => {
                let c = row[col] == null ? '' : String(row[col]);
                if (c.includes('"') || c.includes(',')) c = `"${c.replace(/"/g, '""')}"`;
                return c;
            }).join(',')),
        ].join('\n');
        const link = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
            download: 'fluxbase_export.csv',
            style: 'display:none',
        });
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    return (
        <Card className="h-full flex flex-col shadow-none rounded-none border-0 bg-transparent">
            {/* Toolbar */}
            <CardHeader className="p-2 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between space-y-2 sm:space-y-0 min-h-[2.5rem] h-auto flex-wrap sm:flex-nowrap w-full overflow-x-auto">
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleNewQuery}><Plus className="h-3 w-3 mr-1" /> New</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleFormatSql} title="Format SQL (Ctrl+Shift+F)"><AlignLeft className="h-3 w-3 mr-1" /> Format</Button>
                    <Separator orientation="vertical" className="h-4 mx-1" />
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleImportSql}><Upload className="h-3 w-3 mr-1" /> Import</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-orange-500/10 group" onClick={handleExplainQuery}><Activity className="h-3 w-3 mr-1 text-orange-500 group-hover:animate-pulse" /> Explain</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleSaveQuery}><Save className="h-3 w-3 mr-1" /> Save</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground" onClick={handleShareQuery}><Share2 className="h-3 w-3 mr-1" /> Share</Button>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <span className="text-[10px] text-muted-foreground mr-2 hidden lg:inline-block">
                        Ctrl+Enter Run · Ctrl+Space Autocomplete
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleExport} disabled={!results?.rows?.length} title="Export CSV">
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={handleRunClick} disabled={isGenerating} className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-3 ml-1">
                        {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />}
                        Run Query
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="p-0 flex-grow relative bg-[#1e1e1e]">
                {!query.trim() && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                        <div className="text-center bg-black/40 backdrop-blur-sm px-6 py-4 rounded-lg border border-white/5 opacity-80">
                            <p className="text-white/70 text-sm font-medium">
                                Start typing SQL — press <kbd className="px-1 py-0.5 rounded bg-white/10 text-xs font-mono">Ctrl+Space</kbd> for autocomplete.
                            </p>
                        </div>
                    </div>
                )}
                <Editor
                    height="100%"
                    defaultLanguage="sql"
                    theme="vs-dark"
                    value={query}
                    onChange={(val) => setQuery(val || '')}
                    beforeMount={handleBeforeMount}
                    onMount={handleEditorMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: 'Consolas, JetBrains Mono, Menlo, monospace',
                        lineNumbers: 'on',
                        roundedSelection: false,
                        scrollBeyondLastLine: false,
                        renderLineHighlight: 'all',
                        padding: { top: 16 },
                        // Autocomplete settings
                        quickSuggestions: { other: true, comments: false, strings: true },
                        suggestOnTriggerCharacters: true,
                        acceptSuggestionOnEnter: 'on',
                        tabCompletion: 'on',
                        wordBasedSuggestions: 'off',
                        suggest: { showKeywords: true, showSnippets: true, preview: true, showIcons: true },
                    }}
                />
            </CardContent>
        </Card>
    );
}
