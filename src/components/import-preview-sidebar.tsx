"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X, FileText, FileJson, Sheet, Database, Upload,
    AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type ImportFormat = "csv" | "json" | "xlsx" | "sql";

export interface ImportPreviewData {
    file: File;
    format: ImportFormat;
    /** Column headers detected in the file */
    headers: string[];
    /** First N preview rows (string values) */
    previewRows: (string | null)[][];
    /** Total row count (excluding header) */
    totalRows: number;
    /** Parsed Blob ready to upload */
    csvBlob: Blob;
}

interface ImportPreviewSidebarProps {
    data: ImportPreviewData | null;
    isUploading: boolean;
    uploadProgress: string | null;
    onConfirm: (data: ImportPreviewData) => void;
    onCancel: () => void;
}

const FORMAT_ICON: Record<ImportFormat, React.ReactNode> = {
    csv:  <FileText  className="h-4 w-4 text-emerald-500" />,
    json: <FileJson  className="h-4 w-4 text-yellow-500"  />,
    xlsx: <Sheet     className="h-4 w-4 text-blue-500"    />,
    sql:  <Database  className="h-4 w-4 text-violet-500"  />,
};

const FORMAT_LABEL: Record<ImportFormat, string> = {
    csv:  "CSV",
    json: "JSON",
    xlsx: "Excel",
    sql:  "SQL",
};

const PREVIEW_ROWS = 8;
const PREVIEW_COLS = 6;

export function ImportPreviewSidebar({
    data,
    isUploading,
    uploadProgress,
    onConfirm,
    onCancel,
}: ImportPreviewSidebarProps) {
    const [colOffset, setColOffset] = React.useState(0);
    const [excludedColumns, setExcludedColumns] = React.useState<Set<string>>(new Set());

    React.useEffect(() => { 
        setColOffset(0); 
        setExcludedColumns(new Set());
    }, [data]);

    const visibleHeaders = data ? data.headers.slice(colOffset, colOffset + PREVIEW_COLS) : [];
    const canScrollLeft  = colOffset > 0;
    const canScrollRight = data ? colOffset + PREVIEW_COLS < data.headers.length : false;

    const formatBytes = (n: number) =>
        n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

    const toggleColumn = (h: string) => {
        setExcludedColumns(prev => {
            const next = new Set(prev);
            if (next.has(h)) next.delete(h);
            else next.add(h);
            return next;
        });
    };

    const handleConfirm = () => {
        if (!data) return;
        // Inject excludedColumns into the data object without changing its base type for now
        onConfirm({ ...data, excludedColumns: Array.from(excludedColumns) } as ImportPreviewData & { excludedColumns: string[] });
    };

    return (
        <AnimatePresence>
            {data && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={!isUploading ? onCancel : undefined}
                        className="fixed inset-0 z-40 bg-black/20"
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ opacity: 0, x: 520 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 520 }}
                        transition={{ duration: 0.22, type: "spring", bounce: 0.08 }}
                        className="fixed right-0 top-0 bottom-0 z-50 w-[500px] flex flex-col bg-card border-l border-border shadow-2xl"
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-border">
                            <div className="flex items-center gap-2.5">
                                {FORMAT_ICON[data.format]}
                                <div>
                                    <p className="text-sm font-semibold text-foreground leading-none">Import Preview</p>
                                    <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate max-w-[260px]">
                                        {data.file.name}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onCancel}
                                disabled={isUploading}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* ── Stats strip ── */}
                        <div className="flex items-center gap-3 px-5 py-3 shrink-0 border-b border-border bg-muted/30">
                            <StatBadge label="Rows" value={data.totalRows.toLocaleString()} />
                            <StatBadge label="Columns" value={(data.headers.length - excludedColumns.size).toString()} />
                            <StatBadge label="Format" value={FORMAT_LABEL[data.format]} />
                            <StatBadge label="Size" value={formatBytes(data.file.size)} />
                        </div>

                        {/* ── Column list ── */}
                        <div className="px-5 py-3 shrink-0 border-b border-border">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-2 flex items-center justify-between">
                                <span>Detected Columns</span>
                                <span className="text-[10px] lowercase normal-case opacity-70">Click to exclude</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {data.headers.map(h => {
                                    const isExcluded = excludedColumns.has(h);
                                    return (
                                        <button
                                            key={h}
                                            onClick={() => toggleColumn(h)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11.5px] font-mono transition-colors ${
                                                isExcluded 
                                                    ? "bg-transparent border-dashed border-border/50 text-muted-foreground line-through opacity-60 hover:opacity-100" 
                                                    : "bg-secondary border-border text-foreground hover:bg-secondary/80"
                                            }`}
                                        >
                                            <CheckCircle2 className={`h-3 w-3 shrink-0 transition-all ${isExcluded ? 'opacity-0 w-0' : 'text-emerald-500'}`} />
                                            {h}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Data preview table ── */}
                        <div className="flex-1 overflow-hidden flex flex-col px-5 py-3 min-h-0">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
                                    Preview — first {Math.min(PREVIEW_ROWS, data.previewRows.length)} rows
                                </p>
                                {data.headers.length > PREVIEW_COLS && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setColOffset(o => Math.max(0, o - PREVIEW_COLS))}
                                            disabled={!canScrollLeft}
                                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </button>
                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                            {colOffset + 1}–{Math.min(colOffset + PREVIEW_COLS, data.headers.length)} / {data.headers.length}
                                        </span>
                                        <button
                                            onClick={() => setColOffset(o => Math.min(data.headers.length - PREVIEW_COLS, o + PREVIEW_COLS))}
                                            disabled={!canScrollRight}
                                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                                        >
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-auto rounded-md border border-border min-h-0">
                                <table className="w-full text-[11.5px] border-collapse">
                                    <thead className="sticky top-0 z-10">
                                        <tr>
                                            {visibleHeaders.map(h => (
                                                <th
                                                    key={h}
                                                    className={`px-2.5 py-2 text-left font-semibold text-foreground/70 bg-muted border-b border-border whitespace-nowrap truncate max-w-[120px] ${excludedColumns.has(h) ? 'line-through opacity-50' : ''}`}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.previewRows.slice(0, PREVIEW_ROWS).map((row, ri) => (
                                            <tr
                                                key={ri}
                                                className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                                            >
                                                {visibleHeaders.map((h, ci) => {
                                                    const globalIdx = data.headers.indexOf(h);
                                                    const val = row[globalIdx];
                                                    const isExcluded = excludedColumns.has(h);
                                                    return (
                                                        <td
                                                            key={ci}
                                                            className={`px-2.5 py-1.5 max-w-[140px] whitespace-nowrap overflow-hidden text-ellipsis ${isExcluded ? 'opacity-30' : ''}`}
                                                        >
                                                            {val === null || val === '' ? (
                                                                <span className="text-muted-foreground/40 italic">null</span>
                                                            ) : (
                                                                <span className="text-foreground/85 font-mono">{val}</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.totalRows > PREVIEW_ROWS && (
                                    <p className="text-center text-[11px] text-muted-foreground py-2 border-t border-border/50">
                                        + {(data.totalRows - PREVIEW_ROWS).toLocaleString()} more rows not shown
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ── Warning ── */}
                        {data.totalRows > 10000 && (
                            <div className="mx-5 mb-3 flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11.5px] text-amber-600 dark:text-amber-400 shrink-0">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>Large import ({data.totalRows.toLocaleString()} rows) — this may take a few seconds.</span>
                            </div>
                        )}

                        {/* ── Actions ── */}
                        <div className="px-5 py-4 shrink-0 border-t border-border flex items-center gap-2 bg-card/95">
                            <Button
                                className="flex-1"
                                onClick={handleConfirm}
                                disabled={isUploading || excludedColumns.size === data.headers.length}
                            >
                                {isUploading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{uploadProgress || "Uploading…"}</>
                                ) : (
                                    <><Upload className="mr-2 h-4 w-4" />Import {data.totalRows.toLocaleString()} row{data.totalRows !== 1 ? "s" : ""}</>
                                )}
                            </Button>
                            <Button variant="outline" onClick={onCancel} disabled={isUploading}>
                                Cancel
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function StatBadge({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col items-center px-3 py-1.5 rounded-md bg-secondary border border-border min-w-[64px]">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
            <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
        </div>
    );
}
