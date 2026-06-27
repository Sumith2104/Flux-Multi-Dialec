'use client';

import { useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useGlobalAlert } from '@/components/global-alert-provider';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Table as DbTable, Column as DbColumn, Constraint as DbConstraint } from '@/lib/data';
import {
    Plus, Table, Search, Filter, ArrowDownUp, Edit, Trash2, MoreHorizontal,
    KeyRound, Link2, Upload, Columns, Download, FileJson, FileText, Sheet, X, ChevronDown,
    Database, Loader2, Menu,
} from 'lucide-react';
import { Sheet as SheetRoot, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from './ui/badge';
import { ColumnDef, SortState } from '@/components/data-table';
import { AddRowDialog } from '@/components/add-row-dialog';
import { AddColumnDialog } from '@/components/add-column-dialog';
import { EditRowDialog } from '@/components/edit-row-dialog';
import { EditColumnDialog } from '@/components/edit-column-dialog';

import { AddConstraintDialog } from '@/components/add-constraint-dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import {
    Table as ShadcnTable,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Skeleton } from '@/components/ui/skeleton';
import { deleteRowAction, deleteTableAction, deleteColumnAction, deleteConstraintAction } from '@/app/(app)/editor/actions';
// Removed getTableData import to prevent client boundary violations
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { useRouter } from 'next/navigation';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteProgress } from './delete-progress';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { ImportPreviewSidebar, type ImportPreviewData, type ImportFormat } from '@/components/import-preview-sidebar';

const DataTable = dynamic(() => import('@/components/data-table').then(mod => mod.DataTable), {
    ssr: false,
    loading: () => <Skeleton className="h-[600px] w-full" />,
});

interface EditorClientProps {
    projectId: string;
    tableId?: string;
    tableName?: string;
    allTables: DbTable[];
    currentTable: DbTable | null | undefined;
    initialColumns: DbColumn[];
    initialConstraints: DbConstraint[];

    allProjectConstraints: DbConstraint[];
    dialect: string;
    connectionType?: string;
    activeDatabase?: string;
}

export function EditorClient({
    projectId,
    tableId,
    tableName,
    allTables,
    currentTable,
    initialColumns,
    initialConstraints,
    allProjectConstraints,
    dialect,
    connectionType,
    activeDatabase,
}: EditorClientProps) {
    const { toast } = useToast();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [selectionModel, setSelectionModel] = useState<string[]>([]);
    const [isEditRowOpen, setIsEditRowOpen] = useState(false);
    const [isEditColumnOpen, setIsEditColumnOpen] = useState(false);
    const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
    const [isAddRowOpen, setIsAddRowOpen] = useState(false);
    const [isDeleteTableAlertOpen, setIsDeleteTableAlertOpen] = useState(false);
    const [tableToDelete, setTableToDelete] = useState<DbTable | null>(null);
    const [columnToEdit, setColumnToEdit] = useState<DbColumn | null>(null);
    const [columnToDelete, setColumnToDelete] = useState<DbColumn | null>(null);
    const [constraintToDelete, setConstraintToDelete] = useState<DbConstraint | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState('data');
    const [isImportingCsv, setIsImportingCsv] = useState(false);
    const [importProgress, setImportProgress] = useState<string | null>(null);
    const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
    const [tableSearchQuery, setTableSearchQuery] = useState('');
    const [isMobileExplorerOpen, setIsMobileExplorerOpen] = useState(false);

    // Multi-database / external server states
    const [databases, setDatabases] = useState<string[]>([]);
    const [isLoadingDbs, setIsLoadingDbs] = useState(false);
    const [currentDb, setCurrentDb] = useState(activeDatabase || '');

    useEffect(() => {
        if (connectionType === 'external_server') {
            setIsLoadingDbs(true);
            import('@/components/layout/actions').then(actions => {
                actions.getProjectDatabasesAction(projectId).then(res => {
                    if (res.success && res.databases) {
                        setDatabases(res.databases);
                    } else {
                        console.warn("Failed to load project databases:", res.error);
                    }
                    setIsLoadingDbs(false);
                });
            });
        }
    }, [connectionType, projectId]);

    const handleDatabaseChange = (newDb: string) => {
        setCurrentDb(newDb);
        document.cookie = `fluxbase_active_db_${projectId}=${newDb}; path=/; max-age=31536000`;
        
        toast({
            title: 'Switching Database',
            description: `Switched database to: ${newDb}. Refreshing tables...`,
        });

        // Trigger router pushes to refresh editor contents
        router.push(`/editor?projectId=${projectId}`);
        router.refresh();
    };
    const csvInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const xlsxInputRef = useRef<HTMLInputElement>(null);
    const sqlInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    // ── Tier 1: Column visibility ──────────────────────────────────────────────
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
    const [showColumnPanel, setShowColumnPanel] = useState(false);
    // ── Tier 1: Server-side sorts (multi-column) ──────────────────────────────
    const [sorts, setSorts] = useState<SortState[]>([]);
    // ── Tier 1: Server-side multi-filters ─────────────────────────────────────
    const [filters, setFilters] = useState<{id:string;field:string;op:string;value:string}[]>([]);
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const [foreignKeyData, setForeignKeyData] = useState<Record<string, any[]>>({});
    const [constraints, setConstraints] = useState<DbConstraint[]>(initialConstraints);
    // Phase 3: Diff-set pattern — track only deleted IDs, not full data copies.
    // Eliminates two full array copies of tables/columns from the JS heap.
    const [deletedTableIds, setDeletedTableIds] = useState<Set<string>>(new Set());
    const [deletedColumnIds, setDeletedColumnIds] = useState<Set<string>>(new Set());



    // Derived local tables/columns — computed from props minus deletions (no copy)
    const localTables = useMemo(
        () => allTables.filter(t => !deletedTableIds.has(t.table_id)),
        [allTables, deletedTableIds]
    );
    const localColumns = useMemo(
        () => initialColumns.filter(c => !deletedColumnIds.has(c.column_id)),
        [initialColumns, deletedColumnIds]
    );

    useKeyboardShortcuts([
        {
            combination: 'n',
            handler: () => setIsAddRowOpen(true),
            description: 'Add New Row'
        },
        {
            combination: { key: 'f', ctrl: true },
            handler: () => searchInputRef.current?.focus(),
            description: 'Search Table'
        },
        {
            combination: 'delete',
            handler: () => {
                if (selectionModel.length > 0) {
                    handleDeleteSelectedRows();
                }
            },
            description: 'Delete Selected Rows'
        },
        {
            combination: 'escape',
            handler: () => setSelectionModel([]),
            description: 'Clear Selection'
        }
    ], !!tableId);

    const searchedTables = React.useMemo(() => { return localTables.filter(t => t.table_name.toLowerCase().includes(tableSearchQuery.toLowerCase())); }, [localTables, tableSearchQuery]);

    // Persist sorts/filters/hidden columns per table
    useEffect(() => {
        if (!projectId || !tableName) return;
        try {
            const s = localStorage.getItem(`sorts_${projectId}_${tableName}`);
            const f = localStorage.getItem(`filters_${projectId}_${tableName}`);
            const h = localStorage.getItem(`hidden_${projectId}_${tableName}`);
            if (s) setSorts(JSON.parse(s));
            if (f) setFilters(JSON.parse(f));
            if (h) setHiddenColumns(new Set(JSON.parse(h)));
        } catch { /* ignore */ }
    }, [projectId, tableName]);
    useEffect(() => { if (projectId && tableName) localStorage.setItem(`sorts_${projectId}_${tableName}`, JSON.stringify(sorts)); }, [sorts, projectId, tableName]);
    useEffect(() => { if (projectId && tableName) localStorage.setItem(`filters_${projectId}_${tableName}`, JSON.stringify(filters)); }, [filters, projectId, tableName]);
    useEffect(() => { if (projectId && tableName) localStorage.setItem(`hidden_${projectId}_${tableName}`, JSON.stringify([...hiddenColumns])); }, [hiddenColumns, projectId, tableName]);

    useEffect(() => {
        setConstraints(initialConstraints);
    }, [initialConstraints]);

    // Reset deletion trackers when allTables/tableId change
    useEffect(() => { setDeletedTableIds(new Set()); }, [allTables]);
    useEffect(() => { setDeletedColumnIds(new Set()); }, [tableId]);

    useRealtimeSubscription(projectId);

    const {
        data: infiniteData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isTableLoading,
    } = useInfiniteQuery({
        queryKey: ['table-data', projectId, tableId, sorts, filters],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) => {
            if (!tableId || !tableName) return { rows: [], nextCursorId: null, hasMore: false };
            let url = `/api/table-data?projectId=${projectId}&tableName=${tableName}&pageSize=50`;
            if (pageParam) url += `&page=${pageParam}`;
            if (sorts.length) url += `&sorts=${encodeURIComponent(JSON.stringify(sorts))}`;
            const activeFilters = filters.filter(f => f.value || f.op === 'is_null' || f.op === 'is_not_null');
            if (activeFilters.length) url += `&filters=${encodeURIComponent(JSON.stringify(activeFilters.map(f => ({ field: f.field, op: f.op, value: f.value }))))}` ;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch table data');
            return await response.json();
        },
        getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursorId : null,
        enabled: !!tableId && !!tableName,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        // Keep previous data visible while new sort/filter results load — no blank flash
        placeholderData: keepPreviousData,
    });

    // Rows are now sorted/filtered server-side — just flatten pages
    const rows = useMemo(() => {
        if (!infiniteData) return [];
        return infiniteData.pages.flatMap((page) => Array.isArray(page?.rows) ? page.rows : []);
    }, [infiniteData]);
    const filteredAndSortedRows = rows; // alias kept for downstream compatibility

    const rowCount = infiniteData?.pages?.[0]?.totalRows || 0;


    // Removed legacy fetchTableData and AbortControllers, useInfiniteQuery handles it

    useEffect(() => {
        async function fetchFkData() {
            if (!initialColumns.length) return;

            const fkData: Record<string, any[]> = {};
            const fkConstraints = constraints.filter(c => c.type === 'FOREIGN KEY');

            for (const col of initialColumns) {
                const constraint = fkConstraints.find(c => c.column_names === col.column_name);
                if (constraint && constraint.referenced_table_id) {
                    const refTable = allTables.find(t => t.table_id === constraint.referenced_table_id);
                    if (refTable) {
                        try {
                            // Phase 3: Hard cap at 200 rows for FK dropdowns.
                            // Old: pageSize=1000 — with 3 FK cols on 50K-row tables = 150K rows in RAM.
                            const res = await fetch(`/api/table-data?projectId=${projectId}&tableName=${refTable.table_name}&pageSize=200`);
                            if (res.ok) {
                                const data = await res.json();
                                fkData[col.column_name] = data.rows;
                            }
                        } catch (error) {
                            console.error(`Failed to fetch data for FK column ${col.column_name}`, error);
                        }
                    }
                }
            }
            setForeignKeyData(fkData);
        }
        fetchFkData();
    }, [initialColumns, constraints, allTables, projectId]);

    const refreshData = useCallback(() => {
        // refetchQueries forces an immediate network request, bypassing the staleTime.
        // This ensures the UI remains snappy during manual operations.
        queryClient.refetchQueries({ 
            queryKey: ['table-data', projectId, tableId],
            type: 'active'
        });
    }, [queryClient, projectId, tableId]);

    // Cache refetching is now ALSO handled globally in useRealtimeSubscription.ts
    // to ensure consistency across the sidebar, analytics, and editor.

    // ── JSON sanitizer — fixes common malformed patterns before JSON.parse ──────
    const sanitizeJson = (raw: string): string => raw
        // "key": ,  or  "key":,  → "key": null
        .replace(/:\s*,/g, ': null,')
        // "key":  }  (missing value before closing brace) → "key": null }
        .replace(/:\s*([}\]])/g, ': null$1')
        // trailing commas before } or ]
        .replace(/,\s*([}\]])/g, '$1')
        // bare undefined → null
        .replace(/:\s*undefined\b/g, ': null');


    // ── Phase 1: Parse file → build preview data (no upload yet) ────────────
    const parseForPreview = useCallback(async (file: File, format: ImportFormat) => {
        if (!projectId || !tableName) return;
        setImportProgress(`Parsing ${file.name}…`);

        try {
            let csvBlob: Blob;
            let headers: string[] = [];
            let previewRows: (string | null)[][] = [];
            let totalRows = 0;

            const rowsToPreview = (allRows: (string | null)[][], hdrs: string[]) => {
                headers = hdrs;
                previewRows = allRows.slice(0, 10);
                totalRows = allRows.length;
            };

            if (format === 'csv') {
                csvBlob = file;
                // Quick parse for preview only
                const text = await file.text();
                const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean);
                if (lines.length < 1) throw new Error('CSV file is empty.');
                const parseLine = (l: string) => {
                    const vals: string[] = []; let cur = ''; let inQ = false;
                    for (let i = 0; i < l.length; i++) {
                        const c = l[i];
                        if (c === '"') { if (inQ && l[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
                        else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
                        else cur += c;
                    }
                    vals.push(cur.trim()); return vals;
                };
                const hdrs = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
                const rows = lines.slice(1).map(l => parseLine(l).map(v => v.replace(/^"|"$/g, '').trim() || null));
                rowsToPreview(rows, hdrs);
            } else if (format === 'json') {
                const text = await file.text();
                let parsed: any;
                try { parsed = JSON.parse(sanitizeJson(text)); } catch { throw new Error('Invalid JSON — could not parse file.'); }
                let data: Record<string, any>[];
                if (Array.isArray(parsed)) { data = parsed; }
                else if (parsed && typeof parsed === 'object') {
                    const wk = ['data','rows','results','records','items'].find(k => Array.isArray(parsed[k]));
                    data = wk ? parsed[wk] : [parsed];
                } else throw new Error('JSON must be an object or array of objects.');
                if (!data.length) throw new Error('JSON contains no rows.');
                const hdrs = Object.keys(data[0]);
                const rows: (string | null)[][] = data.map(r => hdrs.map(k => { const v = r[k]; return v === null || v === undefined ? null : String(v); }));
                rowsToPreview(rows, hdrs);
                const csvLines = [hdrs.map(k => `"${k}"`).join(','), ...rows.map(r => r.map(v => `"${(v??'').replace(/"/g,'""')}"`).join(','))];
                csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
            } else if (format === 'xlsx') {
                const { read, utils } = await import('xlsx');
                const buf = await file.arrayBuffer();
                const wb = read(buf, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data: Record<string, any>[] = utils.sheet_to_json(ws, { defval: '' });
                if (!data.length) throw new Error('Excel file appears to be empty.');
                const hdrs = Object.keys(data[0]);
                const rows: (string | null)[][] = data.map(r => hdrs.map(k => { const v = r[k]; return v === '' ? null : String(v); }));
                rowsToPreview(rows, hdrs);
                const csvLines = [hdrs.map(k => `"${k}"`).join(','), ...rows.map(r => r.map(v => `"${(v??'').replace(/"/g,'""')}"`).join(','))];
                csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
            } else {
                const text = await file.text();
                const hm = text.match(/INSERT\s+INTO\s+[\w`"[\]]+\s*\(([^)]+)\)/i);
                if (!hm) throw new Error('No INSERT INTO statement found in SQL file.');
                const cols = hm[1].split(',').map(c => c.trim().replace(/[`"[\]]/g, ''));
                const vb = [...text.matchAll(/VALUES\s*\(([^;]+?)\)\s*[;,]/gi)];
                if (!vb.length) throw new Error('No VALUES found in SQL file.');
                const rows = vb.map(m => {
                    const vals = m[1].split(',').map(v => v.trim().replace(/^'([\s\S]*)'$/, '$1').replace(/^"([\s\S]*)"$/, '$1').replace(/^NULL$/i, ''));
                    return cols.map((_, i) => vals[i] === '' ? null : (vals[i] ?? null));
                });
                rowsToPreview(rows, cols);
                const csvLines = [cols.map(c => `"${c}"`).join(','), ...rows.map(r => r.map(v => `"${(v??'').replace(/"/g,'""')}"`).join(','))];
                csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
            }

            setImportPreview({ file, format, headers, previewRows, totalRows, csvBlob: csvBlob! });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Parse Failed', description: err.message });
        } finally {
            setImportProgress(null);
        }
    }, [projectId, tableName, sanitizeJson]);

    // ── Phase 2: Upload confirmed preview data ────────────────────────────────
    const uploadImport = useCallback(async (data: ImportPreviewData) => {
        if (!projectId || !tableName) return;
        setIsImportingCsv(true);
        setImportProgress('Uploading…');
        try {
            const fd = new FormData();
            fd.append('projectId', projectId);
            fd.append('tableName', tableName);
            if ((data as any).excludedColumns?.length) {
                fd.append('excludedColumns', JSON.stringify((data as any).excludedColumns));
            }
            fd.append('csvFile', data.csvBlob, data.file.name.replace(/\.[^.]+$/, '.csv'));
            const res = await fetch('/api/import-csv', { method: 'POST', body: fd });
            const ct = res.headers.get('content-type') || '';
            if (!res.ok && !ct.includes('application/json')) {
                throw new Error(res.status === 413 ? 'File too large (max 200 MB).' : `Server error ${res.status}`);
            }
            const json = await res.json();
            if (!res.ok) throw new Error(json.error + (json.details ? '\n' + json.details.slice(0, 3).join('\n') : ''));
            toast({
                title: 'Import Complete',
                description: `${json.importedCount} row(s) imported from ${data.file.name}${json.warnings?.length ? ` (${json.warnings.length} skipped)` : ''}.`,
            });
            setImportPreview(null);
            refreshData();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Import Failed', description: err.message });
        } finally {
            setIsImportingCsv(false);
            setImportProgress(null);
        }
    }, [projectId, tableName, refreshData]);


    const handleDeleteSelectedRows = async () => {
        if (!projectId || !tableId || !tableName || selectionModel.length === 0) return;

        setIsDeleting(true);
        const result = await deleteRowAction(projectId, tableId, tableName, selectionModel as string[]);

        if (result.success) {
            toast({ title: 'Success', description: `${result.deletedCount} row(s) deleted successfully.` });
            setSelectionModel([]);
            refreshData();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to delete rows.` });
        }
        setIsDeleting(false);
    };

    const columns: ColumnDef[] = useMemo(() => {
        return localColumns.map(col => ({
            field: col.column_name,
            headerName: col.column_name,
            hidden: hiddenColumns.has(col.column_name),
        }));
    }, [localColumns, hiddenColumns]);

    // ── Inline Cell Save (optimistic — no full refetch) ──────────────────────
    const handleCellSave = useCallback(async (rowId: string, field: string, value: string) => {
        if (!projectId || !tableId || !tableName) return;

        // 1. Optimistically patch the cache immediately — zero flicker
        const queryKey = ['table-data', projectId, tableId, sorts, filters];
        queryClient.setQueryData<any>(queryKey, (old: any) => {
            if (!old) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    rows: page.rows.map((r: any) =>
                        (r.id === rowId || r._id === rowId)
                            ? { ...r, [field]: value }
                            : r
                    ),
                })),
            };
        });

        // 2. Persist to server in background
        try {
            const { editRowAction } = await import('@/app/(app)/editor/actions');
            const row = rows.find(r => (r.id || r._id) === rowId);
            if (!row) return;
            const fd = new FormData();
            fd.append('projectId', projectId);
            fd.append('tableId', tableId);
            fd.append('tableName', tableName);
            fd.append('rowId', rowId);
            for (const [k, v] of Object.entries(row)) {
                if (k !== 'id' && k !== '_id' && v !== null && v !== undefined) {
                    fd.append(k, String(v));
                }
            }
            fd.set(field, value);
            const result = await editRowAction(fd);
            if (!result?.success) {
                // Rollback optimistic update on failure
                queryClient.invalidateQueries({ queryKey });
                throw new Error(result?.error || 'Save failed');
            }
            // No refetch needed — cache is already correct
        } catch (err) {
            // Re-throw so DataTable can show the error state
            throw err;
        }
    }, [projectId, tableId, tableName, rows, sorts, filters, queryClient]);

    // ── Multi-format Export ───────────────────────────────────────────────────
    const handleExport = useCallback(async (format: 'csv' | 'json' | 'sql' | 'excel') => {
        if (!tableName) return;
        // Fetch all rows (no pagination) respecting current sort/filter
        let url = `/api/table-data?projectId=${projectId}&tableName=${tableName}&pageSize=100&page=0`;
        if (sorts.length) url += `&sorts=${encodeURIComponent(JSON.stringify(sorts))}`;
        const activeFilters = filters.filter(f => f.value || f.op === 'is_null' || f.op === 'is_not_null');
        if (activeFilters.length) url += `&filters=${encodeURIComponent(JSON.stringify(activeFilters.map(f => ({ field: f.field, op: f.op, value: f.value }))))}` ;
        const all: any[] = [];
        let page = 0, hasMore = true;
        while (hasMore) {
            const res = await fetch(url.replace('page=0', `page=${page}`));
            const data = await res.json();
            all.push(...(data.rows || []));
            hasMore = data.hasMore;
            page++;
            if (page > 100) break;
        }
        const cols = columns.filter(c => !c.hidden).map(c => c.field);
        const download = (blob: Blob, ext: string) => {
            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(blob), download: `${tableName}_export.${ext}`, style: 'display:none'
            });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
        if (format === 'csv') {
            const csv = [cols.join(','), ...all.map(r => cols.map(c => { let v = r[c] == null ? '' : String(r[c]); if (v.includes(',') || v.includes('"')) v = `"${v.replace(/"/g, '""')}"`; return v; }).join(','))].join('\n');
            download(new Blob([csv], { type: 'text/csv' }), 'csv');
        } else if (format === 'json') {
            download(new Blob([JSON.stringify(all.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))), null, 2)], { type: 'application/json' }), 'json');
        } else if (format === 'sql') {
            const stmts = all.map(r => `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(c => r[c] == null ? 'NULL' : `'${String(r[c]).replace(/'/g, "''")}'`).join(', ')});`).join('\n');
            download(new Blob([stmts], { type: 'text/plain' }), 'sql');
        } else if (format === 'excel') {
            try {
                const XLSX = await import('xlsx');
                const ws = XLSX.utils.json_to_sheet(all.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 31));
                XLSX.writeFile(wb, `${tableName}_export.xlsx`);
            } catch { toast({ variant: 'destructive', title: 'Error', description: 'xlsx package not installed. Run: npm i xlsx' }); }
        }
    }, [projectId, tableName, sorts, filters, columns, toast]);

    const selectedRowData = useMemo(() => {
        if (selectionModel.length !== 1) return null;
        const selectedId = selectionModel[0];
        return rows.find(row => row.id === selectedId) || null;
    }, [selectionModel, rows]);

    const handleDeleteTable = async () => {
        if (!tableToDelete || !projectId) return;

        const result = await deleteTableAction(projectId, tableToDelete.table_id, tableToDelete.table_name);
        if (result.success) {
            toast({ title: 'Success', description: `Table '${tableToDelete.table_name}' deleted successfully.` });
            
            // Dispatch local schema change event to refresh explorer instantly
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId } }));
            }

            refreshData();

            if (tableToDelete.table_id === tableId) {
                router.push(`/editor?projectId=${projectId}`);
            } else {
                // Diff-set: track deletion ID instead of copying the full array
                setDeletedTableIds(prev => new Set([...prev, tableToDelete.table_id]));
            }
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete table.' });
        }
        setTableToDelete(null);
        setIsDeleteTableAlertOpen(false);
    };

    const openDeleteTableDialog = (table: DbTable) => {
        setTableToDelete(table);
        setIsDeleteTableAlertOpen(true);
    };

    const handleOpenEditColumnDialog = (column: DbColumn) => {
        setColumnToEdit(column);
        setIsEditColumnOpen(true);
    };

    const handleOpenDeleteColumnDialog = (column: DbColumn) => {
        setColumnToDelete(column);
    };

    const handleDeleteColumn = async () => {
        if (!columnToDelete || !projectId || !tableId || !tableName) return;

        const formData = new FormData();
        formData.append('projectId', projectId);
        formData.append('tableId', tableId);
        formData.append('tableName', tableName);
        formData.append('columnId', columnToDelete.column_id);
        formData.append('columnName', columnToDelete.column_name);

        const result = await deleteColumnAction(formData);

        if (result.success) {
            toast({ title: 'Success', description: `Column '${columnToDelete.column_name}' deleted successfully.` });
            
            // Dispatch local schema change event to refresh explorer instantly
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId } }));
            }

            // Diff-set: track deletion ID instead of copying the full array
            setDeletedColumnIds(prev => new Set([...prev, columnToDelete.column_id]));
            
            refreshData();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error, duration: 8000 });
        }
        setColumnToDelete(null);
    };


    const pkColumns = useMemo(() => {
        const pk = constraints.find(c => c.type === 'PRIMARY KEY');
        return pk ? new Set(pk.column_names.split(',')) : new Set();
    }, [constraints]);

    const getReferencedTable = (constraint: DbConstraint) => {
        if (constraint.type !== 'FOREIGN KEY') return null;
        const table = allTables.find(t => t.table_id === constraint.referenced_table_id);
        return table || null;
    }

    const handleDeleteConstraint = async () => {
        if (!constraintToDelete || !projectId || !tableId || !tableName) return;

        const formData = new FormData();
        formData.append('projectId', projectId);
        formData.append('tableId', tableId);
        formData.append('tableName', tableName);
        formData.append('constraintId', constraintToDelete.constraint_id);

        const result = await deleteConstraintAction(formData);

        if (result.success) {
            toast({ title: 'Success', description: 'Constraint deleted successfully.' });
            setConstraints(prev => prev.filter(c => c.constraint_id !== constraintToDelete.constraint_id));
            setConstraintToDelete(null);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete constraint.' });
            setConstraintToDelete(null);
        }
    };

    const handleConstraintAdded = (newConstraint: DbConstraint) => {
        setConstraints(prev => [...prev, newConstraint]);
    };




    const { showConfirm } = useGlobalAlert();

    // ...

    const handleResetDatabase = async () => {
        if (!projectId) return;
        const confirmed = await showConfirm(
            'Are you certain you want to reset the database? This will delete ALL tables and data. This action cannot be undone.',
            {
                variant: 'destructive',
                confirmText: 'Reset Database',
                title: 'Reset Database?'
            }
        );
        if (!confirmed) return;

        try {
            const res = await fetch('/api/reset-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId })
            });

            if (!res.ok) throw new Error('Failed to reset');

            toast({ title: 'Success', description: 'Database has been reset.' });
            
            // Dispatch local schema change event to refresh explorer instantly
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId } }));
            }

            refreshData();

            router.refresh();
            router.push(`/editor?projectId=${projectId}`);
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset database.' });
        }
    };

    const sidebarExplorerContent = (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="p-2 space-y-2">
                <Button variant="outline" className="w-full justify-start text-muted-foreground pointer-events-none text-xs font-mono">
                    <span className="truncate">{dialect.toUpperCase()}</span>
                </Button>

                {connectionType === 'external_server' && (
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider px-1 block">Active Database</label>
                        {isLoadingDbs ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/40 rounded-md border border-white/5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                <span className="truncate">Scanning catalogs...</span>
                            </div>
                        ) : (
                            <select
                                value={currentDb}
                                onChange={(e) => handleDatabaseChange(e.target.value)}
                                className="w-full h-10 px-3 rounded-md border border-white/10 bg-background text-sm text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 cursor-pointer"
                            >
                                <option value="" disabled>Select database...</option>
                                {databases.map(db => (
                                    <option key={db} value={db}>{db}</option>
                                ))}
                            </select>
                        )}
                    </div>
                )}
            </div>
            <div className="p-2 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    ref={searchInputRef}
                    placeholder="Search tables..." 
                    className="pl-8" 
                    value={tableSearchQuery} 
                    onChange={(e) => setTableSearchQuery(e.target.value)} 
                />
            </div>
            <nav className="flex-1 overflow-y-auto px-2 space-y-1 py-2">
                {searchedTables.map((table) => (
                    <div
                        key={table.table_id}
                        className={`group flex items-center justify-between rounded-md text-sm font-medium transition-colors ${
                            table.table_id === tableId
                                ? 'bg-muted border-l-2 border-foreground/30 text-foreground'
                                : 'hover:bg-muted/50 border-l-2 border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Link
                            href={`/editor?projectId=${projectId}&tableId=${table.table_id}&tableName=${table.table_name}`}
                            className="flex items-center gap-2 px-3 py-2 flex-grow"
                            onClick={() => setIsMobileExplorerOpen(false)}
                        >
                            <Table className={`h-4 w-4 shrink-0 ${table.table_id === tableId ? 'text-foreground/70' : 'text-muted-foreground/60'}`} />
                            <span className="truncate">{table.table_name}</span>
                        </Link>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 mr-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Table options</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem disabled>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setIsMobileExplorerOpen(false); openDeleteTableDialog(table); }} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ))}
            </nav>
            <div className="mt-auto p-2 border-t space-y-2">
                <Button asChild className="w-full">
                    <Link href={projectId ? `/dashboard/tables/create?projectId=${projectId}` : '#'} onClick={() => setIsMobileExplorerOpen(false)}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Table
                    </Link>
                </Button>
                <Button variant="destructive" className="w-full" onClick={() => { setIsMobileExplorerOpen(false); handleResetDatabase(); }}>
                    <Trash2 className="mr-2 h-4 w-4" /> Reset Database
                </Button>
            </div>
        </div>
    );

    return (
        <>
            {/* ── Import Preview Sidebar ── */}
            <ImportPreviewSidebar
                data={importPreview}
                isUploading={isImportingCsv}
                uploadProgress={importProgress}
                onConfirm={uploadImport}
                onCancel={() => setImportPreview(null)}
            />
            <div className="flex flex-col md:flex-row w-full items-start h-full">
                {/* Sidebar - Desktop Only */}
                <aside className="hidden md:flex md:w-64 flex-shrink-0 md:border-r bg-background flex-col md:h-full overflow-hidden">
                    <div className="p-4 border-b">
                        <h2 className="text-sm font-medium tracking-tight">Table Editor</h2>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {sidebarExplorerContent}
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col overflow-hidden w-full">
                            {currentTable && tableId && tableName ? (
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0">
                                    <header className="flex flex-col sm:flex-row min-h-12 py-1.5 h-auto items-start sm:items-center gap-3 border-b bg-background px-3 sm:px-4 flex-shrink-0">
                                          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                                               <SheetRoot open={isMobileExplorerOpen} onOpenChange={setIsMobileExplorerOpen}>
                                                   <SheetTrigger asChild>
                                                       <Button variant="outline" size="icon" className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground mr-1">
                                                           <Menu className="h-4 w-4" />
                                                       </Button>
                                                   </SheetTrigger>
                                                   <SheetContent side="left" className="p-0 w-72 flex flex-col h-full bg-background border-r">
                                                       <div className="p-4 border-b">
                                                            <h2 className="text-sm font-medium tracking-tight">Table Explorer</h2>
                                                       </div>
                                                       <div className="flex-1 overflow-hidden">
                                                           {sidebarExplorerContent}
                                                       </div>
                                                   </SheetContent>
                                               </SheetRoot>
                                               <Table className="h-4 w-4 text-orange-500" />
                                               <span className="font-semibold text-foreground">{currentTable.table_name}</span>
                                               <span className="ml-2 text-xs text-muted-foreground font-medium">({rowCount.toLocaleString()} rows)</span>
                                          </div>
                                        <TabsList className="h-8 p-0.5 bg-muted/60">
                                            <TabsTrigger value="data" className="text-xs px-3 py-1">Data</TabsTrigger>
                                            <TabsTrigger value="structure" className="text-xs px-3 py-1">Structure</TabsTrigger>
                                        </TabsList>
                                        <Separator orientation="vertical" className="hidden sm:block h-5" />
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                    {tableId && tableName && projectId && initialColumns && (
                                        <>
                                            <AddRowDialog
                                                projectId={projectId}
                                                tableId={tableId}
                                                tableName={tableName}
                                                columns={localColumns}
                                                onRowAdded={refreshData}
                                                foreignKeyData={foreignKeyData}
                                                allTables={allTables}
                                                constraints={constraints}
                                                isOpen={isAddRowOpen}
                                                onOpenChange={setIsAddRowOpen}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setIsAddColumnOpen(true)}
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Add Column
                                            </Button>
                                            <AddColumnDialog
                                                isOpen={isAddColumnOpen}
                                                setIsOpen={setIsAddColumnOpen}
                                                projectId={projectId}
                                                tableId={tableId}
                                                tableName={tableName}
                                                onColumnAdded={() => {
                                                    if (typeof window !== 'undefined') {
                                                        window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId } }));
                                                    }
                                                    refreshData();
                                                }}
                                            />
                                            {/* ── Hidden file inputs for each import format ── */}
                                            <input ref={csvInputRef}  type="file" accept=".csv,text/csv"                                     className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value=''; if(f) parseForPreview(f,'csv');  }} />
                                            <input ref={jsonInputRef} type="file" accept=".json,application/json"                            className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value=''; if(f) parseForPreview(f,'json'); }} />
                                            <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls,application/vnd.ms-excel"              className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value=''; if(f) parseForPreview(f,'xlsx'); }} />
                                            <input ref={sqlInputRef}  type="file" accept=".sql,text/plain"                                   className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value=''; if(f) parseForPreview(f,'sql');  }} />

                                            {/* ── Import dropdown ── */}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" disabled={isImportingCsv}>
                                                        {isImportingCsv ? (
                                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{importProgress || 'Importing…'}</>
                                                        ) : (
                                                            <><Upload className="mr-2 h-4 w-4" />Import<ChevronDown className="ml-1 h-3 w-3 opacity-60" /></>
                                                        )}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-52">
                                                    <DropdownMenuItem onClick={() => csvInputRef.current?.click()}>
                                                        <FileText className="mr-2 h-4 w-4 text-emerald-500" />
                                                        <div>
                                                            <p className="font-medium">CSV</p>
                                                            <p className="text-[11px] text-muted-foreground">Comma-separated values</p>
                                                        </div>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => jsonInputRef.current?.click()}>
                                                        <FileJson className="mr-2 h-4 w-4 text-yellow-500" />
                                                        <div>
                                                            <p className="font-medium">JSON</p>
                                                            <p className="text-[11px] text-muted-foreground">Array of row objects</p>
                                                        </div>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => xlsxInputRef.current?.click()}>
                                                        <Sheet className="mr-2 h-4 w-4 text-blue-500" />
                                                        <div>
                                                            <p className="font-medium">Excel</p>
                                                            <p className="text-[11px] text-muted-foreground">.xlsx / .xls spreadsheet</p>
                                                        </div>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => sqlInputRef.current?.click()}>
                                                        <Database className="mr-2 h-4 w-4 text-violet-500" />
                                                        <div>
                                                            <p className="font-medium">SQL</p>
                                                            <p className="text-[11px] text-muted-foreground">INSERT INTO statements</p>
                                                        </div>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </>
                                    )}
                                    <Button variant="outline" size="sm" disabled={selectionModel.length !== 1} onClick={() => setIsEditRowOpen(true)}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </Button>
                                    {selectedRowData && tableId && tableName && (
                                        <EditRowDialog
                                            isOpen={isEditRowOpen}
                                            setIsOpen={setIsEditRowOpen}
                                            projectId={projectId}
                                            tableId={tableId}
                                            tableName={tableName}
                                            columns={localColumns}
                                            rowData={selectedRowData}
                                            onRowUpdated={refreshData}
                                            foreignKeyData={foreignKeyData}
                                            allTables={allTables}
                                            constraints={constraints}
                                        />
                                    )}

                                    <AlertDialog onOpenChange={(open) => { if (!open) setIsDeleting(false) }}>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" disabled={selectionModel.length === 0}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete ({selectionModel.length})
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    {isDeleting ? 'Deletion in Progress' : 'Are you absolutely sure?'}
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    {isDeleting
                                                        ? 'Please wait while the selected rows are being deleted. This may take a moment.'
                                                        : `This action cannot be undone. This will permanently delete the selected ${selectionModel.length > 1 ? `${selectionModel.length} rows` : 'row'} from the table.`
                                                    }
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            {isDeleting ? (
                                                <div className="py-4">
                                                    <DeleteProgress />
                                                </div>
                                            ) : (
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleDeleteSelectedRows} disabled={isDeleting}>
                                                        Continue
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            )}
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                                 {/* ── Right toolbar: Filter, Columns, Export ── */}
                                 <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 sm:ml-auto shrink-0 flex-wrap">
                                     {/* Active filter chips */}
                                     {filters.length > 0 && (
                                         <div className="flex gap-1 flex-wrap max-w-xs">
                                             {filters.map(f => (
                                                 <Badge key={f.id} variant="secondary" className="gap-1 text-xs py-0.5">
                                                     <span className="font-mono">{f.field}</span>
                                                     <span className="opacity-60">{f.op}</span>
                                                     {f.value && <span className="font-medium">{f.value.slice(0,12)}{f.value.length>12?'…':''}</span>}
                                                     <button onClick={() => setFilters(prev => prev.filter(x => x.id !== f.id))} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                                                         <X className="h-2.5 w-2.5" />
                                                     </button>
                                                 </Badge>
                                             ))}
                                         </div>
                                     )}
                                     {/* Filter button */}
                                     <div className="relative">
                                         <Button variant="outline" size="sm" onClick={() => { setShowFilterPanel(p => !p); setShowColumnPanel(false); }} className={filters.length ? 'bg-primary/10 border-primary/20 text-primary' : ''}>
                                             <Filter className="mr-2 h-4 w-4" /> Filter {filters.length > 0 && <Badge className="ml-1.5 h-4 text-[10px]">{filters.length}</Badge>}
                                         </Button>
                                         {showFilterPanel && (
                                             <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-lg border border-border bg-card shadow-xl p-3 space-y-2">
                                                 <div className="flex items-center justify-between mb-2">
                                                     <span className="text-sm font-semibold">Filters</span>
                                                     <button onClick={() => setFilters([])} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
                                                 </div>
                                                 {filters.map(f => (
                                                     <div key={f.id} className="flex gap-1.5 items-center">
                                                         <select className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5" value={f.field}
                                                             onChange={e => setFilters(prev => prev.map(x => x.id === f.id ? { ...x, field: e.target.value } : x))}>
                                                             {columns.map(c => <option key={c.field} value={c.field}>{c.headerName}</option>)}
                                                         </select>
                                                         <select className="text-xs rounded border border-border bg-background px-2 py-1.5" value={f.op}
                                                             onChange={e => setFilters(prev => prev.map(x => x.id === f.id ? { ...x, op: e.target.value } : x))}>
                                                             <option value="contains">contains</option>
                                                             <option value="equals">equals</option>
                                                             <option value="not_equals">≠</option>
                                                             <option value="starts_with">starts</option>
                                                             <option value="ends_with">ends</option>
                                                             <option value="gt">&gt;</option>
                                                             <option value="gte">&gt;=</option>
                                                             <option value="lt">&lt;</option>
                                                             <option value="lte">&lt;=</option>
                                                             <option value="is_null">is null</option>
                                                             <option value="is_not_null">not null</option>
                                                         </select>
                                                         {f.op !== 'is_null' && f.op !== 'is_not_null' && (
                                                             <Input className="flex-1 h-7 text-xs" value={f.value}
                                                                 onChange={e => setFilters(prev => prev.map(x => x.id === f.id ? { ...x, value: e.target.value } : x))}
                                                                 placeholder="value" />
                                                         )}
                                                         <button onClick={() => setFilters(prev => prev.filter(x => x.id !== f.id))} className="p-1 rounded hover:bg-muted text-muted-foreground">
                                                             <X className="h-3.5 w-3.5" />
                                                         </button>
                                                     </div>
                                                 ))}
                                                 <Button size="sm" variant="outline" className="w-full mt-1 text-xs" onClick={() => setFilters(prev => [...prev, { id: crypto.randomUUID(), field: columns[0]?.field || '', op: 'contains', value: '' }])}>
                                                     + Add filter
                                                 </Button>
                                             </div>
                                         )}
                                     </div>
                                     {/* Column Visibility button */}
                                     <div className="relative">
                                         <Button variant="outline" size="sm" onClick={() => { setShowColumnPanel(p => !p); setShowFilterPanel(false); }} className={hiddenColumns.size ? 'bg-primary/10 border-primary/20 text-primary' : ''}>
                                             <Columns className="mr-2 h-4 w-4" /> Columns {hiddenColumns.size > 0 && <Badge className="ml-1.5 h-4 text-[10px]">{hiddenColumns.size} hidden</Badge>}
                                         </Button>
                                          {showColumnPanel && (
                                              <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-[350px] flex flex-col rounded-lg border border-border bg-card shadow-xl p-3">
                                                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/50 shrink-0">
                                                      <span className="text-sm font-semibold">Columns</span>
                                                      <div className="flex gap-2 text-xs">
                                                          <button onClick={() => setHiddenColumns(new Set())} className="text-muted-foreground hover:text-foreground">Show all</button>
                                                          <button onClick={() => setHiddenColumns(new Set(columns.map(c => c.field)))} className="text-muted-foreground hover:text-foreground">Hide all</button>
                                                      </div>
                                                  </div>
                                                  <div className="overflow-y-auto pr-1 space-y-1 flex-1 custom-scrollbar">
                                                      {localColumns.map(col => (
                                                          <label key={col.column_name} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-muted">
                                                              <input type="checkbox" checked={!hiddenColumns.has(col.column_name)}
                                                                  onChange={e => setHiddenColumns(prev => {
                                                                      const next = new Set(prev);
                                                                      if (e.target.checked) next.delete(col.column_name); else next.add(col.column_name);
                                                                      return next;
                                                                  })}
                                                                  className="accent-primary"
                                                              />
                                                              <span className="font-mono truncate">{col.column_name}</span>
                                                          </label>
                                                      ))}
                                                  </div>
                                              </div>
                                          )}
                                     </div>
                                     {/* Export dropdown */}
                                     <DropdownMenu>
                                         <DropdownMenuTrigger asChild>
                                             <Button variant="outline" size="sm">
                                                 <Download className="mr-2 h-4 w-4" /> Export <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                                             </Button>
                                         </DropdownMenuTrigger>
                                         <DropdownMenuContent align="end">
                                             <DropdownMenuItem onClick={() => handleExport('csv')}>
                                                 <FileText className="mr-2 h-4 w-4" /> CSV
                                             </DropdownMenuItem>
                                             <DropdownMenuItem onClick={() => handleExport('json')}>
                                                 <FileJson className="mr-2 h-4 w-4" /> JSON
                                             </DropdownMenuItem>
                                             <DropdownMenuItem onClick={() => handleExport('sql')}>
                                                 <FileText className="mr-2 h-4 w-4" /> SQL INSERT
                                             </DropdownMenuItem>
                                             <DropdownMenuItem onClick={() => handleExport('excel')}>
                                                 <Sheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
                                             </DropdownMenuItem>
                                         </DropdownMenuContent>
                                     </DropdownMenu>
                                 </div>
                            </header>

                            <div className="flex-grow flex flex-col overflow-hidden">
                                <TabsContent value="data" className="mt-0 pt-0 md:flex-1 md:flex md:flex-col md:min-h-0 h-[600px] md:h-auto relative overflow-hidden">
                                        <div className="relative flex-1 min-h-0" onClick={() => { setShowFilterPanel(false); setShowColumnPanel(false); }}>
                                            <DataTable
                                                columns={columns}
                                                rows={filteredAndSortedRows}
                                                loading={isTableLoading}
                                                fetchNextPage={fetchNextPage}
                                                isFetchingNextPage={isFetchingNextPage}
                                                hasNextPage={hasNextPage}
                                                selectionModel={selectionModel}
                                                onRowSelectionModelChange={(newSelectionModel) => {
                                                    setSelectionModel(newSelectionModel);
                                                }}
                                                sorts={sorts}
                                                onSortsChange={setSorts}
                                                onCellSave={handleCellSave}
                                                storageKey={`${projectId}_${tableName}`}
                                            />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="structure" className="mt-4 space-y-6 md:overflow-y-auto md:flex-1 md:min-h-0 pb-24 pr-2">
                                        <Card>
                                         <CardHeader>
                                             <CardTitle>Table Structure</CardTitle>
                                              <CardDescription>
                                                  {currentTable.description || `This is the schema for the '${currentTable.table_name}' table.`}
                                              </CardDescription>
                                         </CardHeader>
                                            <CardContent>
                                                <div className="border rounded-lg overflow-x-auto">
                                                    <ShadcnTable>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Column Name</TableHead>
                                                                <TableHead>Data Type</TableHead>
                                                                <TableHead>Constraints</TableHead>
                                                                <TableHead className="text-right">Actions</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {localColumns.map(col => (
                                                                <TableRow key={col.column_id}>
                                                                    <TableCell className="font-mono">{col.column_name}</TableCell>
                                                                    <TableCell className="font-mono">{col.data_type}</TableCell>
                                                                    <TableCell>
                                                                        {pkColumns.has(col.column_name) && <Badge variant="secondary" className="mr-2">PK</Badge>}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={col.column_name === 'id'}>
                                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                                    <span className="sr-only">Column options</span>
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent>
                                                                                <DropdownMenuItem onClick={() => handleOpenEditColumnDialog(col)}>
                                                                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                                                                </DropdownMenuItem>
                                                                                <DropdownMenuSeparator />
                                                                                <DropdownMenuItem onClick={() => handleOpenDeleteColumnDialog(col)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                                                </DropdownMenuItem>
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </ShadcnTable>
                                                </div>
                                            </CardContent>
                                            <CardFooter>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setIsAddColumnOpen(true)}
                                                >
                                                    <Plus className="mr-2 h-4 w-4" /> Add Column
                                                </Button>
                                            </CardFooter>
                                        </Card>
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Keys & Relationships</CardTitle>
                                                <CardDescription>
                                                    Primary and Foreign key constraints for this table.
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                {constraints.length > 0 ? (
                                                    <div className="space-y-4">
                                                        {constraints.map(c => (
                                                            <div key={c.constraint_id} className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                                                                <div className="flex items-center gap-4">
                                                                    {c.type === 'PRIMARY KEY' ? <KeyRound className="h-5 w-5 text-yellow-500" /> : <Link2 className="h-5 w-5 text-blue-500" />}
                                                                    <div className="flex flex-col">
                                                                        <span className="font-semibold font-mono">{c.column_names}</span>
                                                                        <span className="text-sm text-muted-foreground">
                                                                            {c.type === 'PRIMARY KEY' ? 'Primary Key' :
                                                                                `→ ${getReferencedTable(c)?.table_name}.${c.referenced_column_names}`
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <AlertDialog open={constraintToDelete?.constraint_id === c.constraint_id} onOpenChange={(open) => !open && setConstraintToDelete(null)}>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setConstraintToDelete(c)}>
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Are you sure you want to delete this constraint?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                This action cannot be undone. This will permanently delete the constraint on <strong>{c.column_names}</strong>.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                onClick={handleDeleteConstraint}
                                                                                className="bg-destructive hover:bg-destructive/90"
                                                                            >
                                                                                Delete Constraint
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No constraints defined for this table.</p>
                                                )}
                                            </CardContent>
                                            <CardFooter>
                                                <AddConstraintDialog
                                                    projectId={projectId}
                                                    tableId={tableId}
                                                    tableName={tableName}
                                                    allTables={allTables}
                                                    columns={initialColumns}
                                                    onConstraintAdded={handleConstraintAdded}
                                                    allProjectConstraints={allProjectConstraints}
                                                />
                                            </CardFooter>
                                        </Card>
                                    </TabsContent>
                                </div>
                            </Tabs>
                    ) : (
                        <>
                            <header className="flex flex-col sm:flex-row min-h-14 py-2 h-auto items-start sm:items-center gap-4 border-b bg-background px-4 sm:px-6 flex-shrink-0 md:hidden">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                                    <SheetRoot open={isMobileExplorerOpen} onOpenChange={setIsMobileExplorerOpen}>
                                        <SheetTrigger asChild>
                                            <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground mr-1">
                                                <Menu className="h-4 w-4" />
                                            </Button>
                                        </SheetTrigger>
                                        <SheetContent side="left" className="p-0 w-72 flex flex-col h-full bg-background border-r">
                                            <div className="p-4 border-b">
                                                <h2 className="text-lg font-semibold">Table Explorer</h2>
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                {sidebarExplorerContent}
                                            </div>
                                        </SheetContent>
                                    </SheetRoot>
                                    <span className="font-semibold text-foreground">Table Editor</span>
                                </div>
                            </header>
                            <div className="flex-grow flex flex-col justify-center items-center overflow-hidden">
                                <div className="flex flex-col items-center justify-center text-center p-6">
                                    <Table className="h-16 w-16 text-muted-foreground" />
                                    <h2 className="mt-4 text-xl font-semibold">Select a table to begin</h2>
                                    <p className="mt-2 text-muted-foreground max-w-sm">
                                        Choose a table from the <span className="hidden md:inline">sidebar</span><span className="md:hidden">menu</span> to view its data and structure.
                                    </p>
                                    <div className="flex flex-col sm:flex-row items-center gap-3 mt-4 w-full justify-center">
                                        <SheetRoot open={isMobileExplorerOpen} onOpenChange={setIsMobileExplorerOpen}>
                                            <SheetTrigger asChild>
                                                <Button variant="outline" className="md:hidden w-full sm:w-auto">
                                                    <Menu className="mr-2 h-4 w-4" />
                                                    Open Table List
                                                </Button>
                                            </SheetTrigger>
                                            <SheetContent side="left" className="p-0 w-72 flex flex-col h-full bg-background border-r">
                                                <div className="p-4 border-b">
                                                    <h2 className="text-lg font-semibold">Table Explorer</h2>
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    {sidebarExplorerContent}
                                                </div>
                                            </SheetContent>
                                        </SheetRoot>
                                        <Button asChild className="w-full sm:w-auto">
                                            <Link href={projectId ? `/dashboard/tables/create?projectId=${projectId}` : '#'}>
                                                <Plus className="mr-2 h-4 w-4" />
                                                Create New Table
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </main>
            </div>

            {columnToEdit && (
                <EditColumnDialog
                    isOpen={isEditColumnOpen}
                    setIsOpen={setIsEditColumnOpen}
                    projectId={projectId}
                    tableId={tableId!}
                    tableName={tableName!}
                    column={columnToEdit}
                    onColumnUpdated={() => refreshData()}
                />
            )}

            <AlertDialog open={!!columnToDelete} onOpenChange={(open) => !open && setColumnToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            <strong> {columnToDelete?.column_name}</strong> column and all of its data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setColumnToDelete(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteColumn} className="bg-destructive hover:bg-destructive/90">
                            Delete Column
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isDeleteTableAlertOpen} onOpenChange={setIsDeleteTableAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            <strong> {tableToDelete?.table_name}</strong> table and all of its data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setTableToDelete(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteTable}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
