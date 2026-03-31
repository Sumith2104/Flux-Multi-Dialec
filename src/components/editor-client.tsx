'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useGlobalAlert } from '@/components/global-alert-provider';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import React, { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import type { Table as DbTable, Column as DbColumn, Constraint as DbConstraint } from '@/lib/data';
import {
    Plus,
    Table,
    Search,
    ChevronDown,
    Filter,
    ArrowDownUp,
    Edit,
    Trash2,
    MoreHorizontal,
    KeyRound,
    Link2,
    Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColumnDef } from '@/components/data-table';
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
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useRef } from 'react';

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
    const [tableSearchQuery, setTableSearchQuery] = useState('');
    const csvInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [foreignKeyData, setForeignKeyData] = useState<Record<string, any[]>>({});
    const [constraints, setConstraints] = useState<DbConstraint[]>(initialConstraints);
    // Local copy of columns — updated optimistically so mutations don't need router.refresh()
    const [localColumns, setLocalColumns] = useState<DbColumn[]>(initialColumns);
    // Local copy of tables — updated optimistically so sidebar doesn't need router.refresh() on delete
    const [localTables, setLocalTables] = useState<DbTable[]>(allTables);
    const [, startTransition] = useTransition();

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

    const [sortConfig, setSortConfig] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);
    const [filterConfig, setFilterConfig] = useState<{ field: string; operator: string; value: string } | null>(null);

    // Load saved filters/sorts when table changes
    useEffect(() => {
        if (!projectId || !tableName) return;
        try {
            const savedSort = localStorage.getItem(`sort_${projectId}_${tableName}`);
            const savedFilter = localStorage.getItem(`filter_${projectId}_${tableName}`);
            setSortConfig(savedSort ? JSON.parse(savedSort) : null);
            setFilterConfig(savedFilter ? JSON.parse(savedFilter) : null);
        } catch (e) {
            console.error("Failed to parse cached table view state", e);
        }
    }, [projectId, tableName]);

    // Save sort selection
    useEffect(() => {
        if (!projectId || !tableName) return;
        if (sortConfig) localStorage.setItem(`sort_${projectId}_${tableName}`, JSON.stringify(sortConfig));
        else localStorage.removeItem(`sort_${projectId}_${tableName}`);
    }, [sortConfig, projectId, tableName]);

    // Save filter selection
    useEffect(() => {
        if (!projectId || !tableName) return;
        if (filterConfig) localStorage.setItem(`filter_${projectId}_${tableName}`, JSON.stringify(filterConfig));
        else localStorage.removeItem(`filter_${projectId}_${tableName}`);
    }, [filterConfig, projectId, tableName]);

    useEffect(() => {
        setConstraints(initialConstraints);
    }, [initialConstraints]);

    // Sync localTables when allTables changes (e.g. after creating a new table)
    useEffect(() => {
        setLocalTables(allTables);
    }, [allTables]);

    // Reset local column state when switching to a different table
    useEffect(() => {
        setLocalColumns(initialColumns);
    }, [tableId]); // tableId change = different table → reset to server-provided columns

    const { lastEvent } = useRealtimeSubscription(projectId);

    const {
        data: infiniteData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isTableLoading,
        refetch
    } = useInfiniteQuery({
        queryKey: ['table-data', projectId, tableId],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) => {
            if (!tableId || !tableName) return { rows: [], nextCursorId: null, hasMore: false };
            let url = `/api/table-data?projectId=${projectId}&tableName=${tableName}&pageSize=50`;
            if (pageParam) url += `&page=${pageParam}`;

            // Append a timestamp to completely bypass Next.js and browser cache
            url += `&_t=${Date.now()}`;

            const response = await fetch(url, { headers: { 'Cache-Control': 'no-store' } });
            if (!response.ok) throw new Error('Failed to fetch table data');
            return response.json();
        },
        getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursorId : null,
        enabled: !!tableId && !!tableName,
        staleTime: 4000,
        refetchInterval: 10000, // Reduced polling since we have WS now
        refetchOnWindowFocus: false,
    });

    const rows = useMemo(() => {
        if (!infiniteData) return [];
        return infiniteData.pages.flatMap((page) => Array.isArray(page?.rows) ? page.rows : []);
    }, [infiniteData]);

    const filteredAndSortedRows = useMemo(() => {
        let result = [...rows];

        if (filterConfig && filterConfig.value !== '') {
            result = result.filter(row => {
                const val = String(row[filterConfig.field] || '').toLowerCase();
                const search = filterConfig.value.toLowerCase();
                if (filterConfig.operator === 'contains') return val.includes(search);
                if (filterConfig.operator === 'equals') return val === search;
                if (filterConfig.operator === 'starts_with') return val.startsWith(search);
                if (filterConfig.operator === 'ends_with') return val.endsWith(search);
                return true;
            });
        }

        if (sortConfig) {
            result.sort((a, b) => {
                const aVal = a[sortConfig.field];
                const bVal = b[sortConfig.field];
                if (aVal === bVal) return 0;
                if (aVal === null || aVal === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
                if (bVal === null || bVal === undefined) return sortConfig.direction === 'asc' ? 1 : -1;

                const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [rows, sortConfig, filterConfig]);

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
                            const res = await fetch(`/api/table-data?projectId=${projectId}&tableName=${refTable.table_name}&pageSize=1000`);
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
        // Drop the entire cached pages so infinite query resets to page 1,
        // then immediately re-fetch fresh data (invalidate alone won't re-fetch empty-state tables)
        queryClient.removeQueries({ queryKey: ['table-data', projectId, tableId] });
        refetch();
    }, [queryClient, projectId, tableId, refetch]);

    // Instant refresh for table data when a WebSocket event arrives for this specific table
    useEffect(() => {
        if (lastEvent && lastEvent.type === 'update' && lastEvent.table === tableName) {
            console.log('[Realtime Editor] Pushing update for table:', tableName);
            refreshData();
        }
    }, [lastEvent, tableName, refreshData]);



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
        }));
    }, [localColumns]);

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
            if (tableToDelete.table_id === tableId) {
                // Navigate away — unavoidable since the current table is gone
                router.push(`/editor?projectId=${projectId}`);
            } else {
                // Optimistically remove from sidebar — no server round-trip, no flicker
                setLocalTables(prev => prev.filter(t => t.table_id !== tableToDelete.table_id));
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
            // Optimistically remove from local state — no page reload needed
            setLocalColumns(prev => prev.filter(c => c.column_id !== columnToDelete.column_id));
            refreshData(); // also refresh row data in case the column was used in display
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
            router.refresh();
            router.push(`/editor?projectId=${projectId}`);
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset database.' });
        }
    };

    return (
        <>
            <div className="flex flex-col md:flex-row w-full items-start h-full">
                {/* Sidebar */}
                <aside className="w-full md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r bg-background flex flex-col h-64 md:h-full overflow-hidden">
                    <div className="p-4 hidden md:block">
                        <h2 className="text-lg font-semibold">Table Editor</h2>
                    </div>
                    <div className="p-2">
                        <Button variant="outline" className="w-full justify-start text-muted-foreground pointer-events-none">
                            <span className="truncate">Database <strong>{dialect.toUpperCase()}</strong></span>
                        </Button>
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
                                className={`group flex items-center justify-between rounded-md text-sm font-medium hover:bg-accent ${table.table_id === tableId ? 'bg-accent' : ''}`}
                            >
                                <Link
                                    href={`/editor?projectId=${projectId}&tableId=${table.table_id}&tableName=${table.table_name}`}
                                    className="flex items-center gap-2 px-3 py-2 flex-grow"
                                >
                                    <Table className="h-4 w-4" />
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
                                        <DropdownMenuItem onClick={() => openDeleteTableDialog(table)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
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
                            <Link href={projectId ? `/dashboard/tables/create?projectId=${projectId}` : '#'}>
                                <Plus className="mr-2 h-4 w-4" />
                                New Table
                            </Link>
                        </Button>
                        <Button variant="destructive" className="w-full" onClick={handleResetDatabase}>
                            <Trash2 className="mr-2 h-4 w-4" /> Reset Database
                        </Button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col overflow-hidden w-full">
                    {currentTable && tableId && tableName ? (
                        <>
                            <header className="flex flex-col sm:flex-row min-h-14 py-2 h-auto items-start sm:items-center gap-4 border-b bg-background px-4 sm:px-6 flex-shrink-0 overflow-x-auto">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                                       <Table className="h-4 w-4" />
                                       <span className="font-semibold text-foreground">{currentTable.table_name}</span>
                                       <span className="ml-3 text-xs text-muted-foreground font-medium">({rowCount.toLocaleString()} rows)</span>
                                  </div>
                                <Separator orientation="vertical" className="h-6" />
                                <div className="flex items-center gap-2 shrink-0">
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
                                                onColumnAdded={refreshData}
                                            />
                                            {/* Import CSV — hidden file input triggered by button */}
                                            <input
                                                ref={csvInputRef}
                                                type="file"
                                                accept=".csv,text/csv"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file || !projectId || !tableName) return;
                                                    e.target.value = ''; // allow re-selecting same file

                                                    setIsImportingCsv(true);
                                                    const fd = new FormData();
                                                    fd.append('projectId', projectId);
                                                    fd.append('tableName', tableName);
                                                    fd.append('csvFile', file);

                                                    try {
                                                        const res = await fetch('/api/import-csv', { method: 'POST', body: fd });
                                                        const json = await res.json();
                                                        if (!res.ok) {
                                                            toast({
                                                                variant: 'destructive',
                                                                title: 'Import Failed',
                                                                description: json.error + (json.details ? '\n' + json.details.slice(0, 3).join('\n') : ''),
                                                                duration: 8000,
                                                            });
                                                        } else {
                                                            toast({
                                                                title: 'Import Complete',
                                                                description: `${json.importedCount} row(s) imported from ${file.name}${json.warnings?.length ? ` (${json.warnings.length} row(s) skipped)` : ''
                                                                    }.`,
                                                            });
                                                            refreshData();
                                                        }
                                                    } catch (err: any) {
                                                        toast({ variant: 'destructive', title: 'Import Error', description: err.message });
                                                    } finally {
                                                        setIsImportingCsv(false);
                                                    }
                                                }}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isImportingCsv}
                                                onClick={() => csvInputRef.current?.click()}
                                            >
                                                {isImportingCsv ? (
                                                    <><span className="mr-2 h-4 w-4 animate-spin">⏳</span> Importing...</>
                                                ) : (
                                                    <><Upload className="mr-2 h-4 w-4" /> Import CSV</>
                                                )}
                                            </Button>
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
                                <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 sm:ml-auto shrink-0">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className={filterConfig ? 'bg-primary/10 border-primary/20 text-primary' : ''}>
                                                <Filter className="mr-2 h-4 w-4" /> Filter
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80">
                                            <div className="space-y-4">
                                                <h4 className="font-medium leading-none">Filter Data</h4>
                                                <div className="grid gap-2">
                                                    <Select onValueChange={(v) => setFilterConfig(prev => ({ field: v, operator: prev?.operator || 'contains', value: prev?.value || '' }))} value={filterConfig?.field || ''}>
                                                        <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                                                        <SelectContent>
                                                            {columns.map(c => <SelectItem key={c.field} value={c.field}>{c.headerName}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Select onValueChange={(v) => setFilterConfig(prev => ({ field: prev?.field || columns[0]?.field, operator: v, value: prev?.value || '' }))} value={filterConfig?.operator || 'contains'}>
                                                        <SelectTrigger><SelectValue placeholder="Operator" /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="contains">Contains</SelectItem>
                                                            <SelectItem value="equals">Equals</SelectItem>
                                                            <SelectItem value="starts_with">Starts with</SelectItem>
                                                            <SelectItem value="ends_with">Ends with</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Input
                                                        placeholder="Filter value..."
                                                        value={filterConfig?.value || ''}
                                                        onChange={(e) => setFilterConfig(prev => ({ field: prev?.field || columns[0]?.field, operator: prev?.operator || 'contains', value: e.target.value }))}
                                                    />
                                                    <Button variant="outline" size="sm" onClick={() => setFilterConfig(null)} className="w-full">Clear Filter</Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className={sortConfig ? 'bg-primary/10 border-primary/20 text-primary' : ''}>
                                                <ArrowDownUp className="mr-2 h-4 w-4" /> Sort
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80">
                                            <div className="space-y-4">
                                                <h4 className="font-medium leading-none">Sort Data</h4>
                                                <div className="grid gap-2">
                                                    <Select onValueChange={(v) => setSortConfig(prev => ({ field: v, direction: prev?.direction || 'asc' }))} value={sortConfig?.field || ''}>
                                                        <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                                                        <SelectContent>
                                                            {columns.map(c => <SelectItem key={c.field} value={c.field}>{c.headerName}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Select onValueChange={(v: 'asc' | 'desc') => setSortConfig(prev => ({ field: prev?.field || columns[0]?.field, direction: v }))} value={sortConfig?.direction || 'asc'}>
                                                        <SelectTrigger><SelectValue placeholder="Direction" /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="asc">Ascending (A-Z)</SelectItem>
                                                            <SelectItem value="desc">Descending (Z-A)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button variant="outline" size="sm" onClick={() => setSortConfig(null)} className="w-full">Clear Sort</Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </header>

                            <div className="flex-grow flex flex-col overflow-hidden">
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0">
                                    <div className="flex items-center justify-between w-full border-b pb-2 mb-2">
                                        <TabsList>
                                            <TabsTrigger value="data">Data</TabsTrigger>
                                            <TabsTrigger value="structure">Structure</TabsTrigger>
                                        </TabsList>
                                        <div className="text-sm font-medium text-muted-foreground px-4 py-1.5 bg-muted/50 rounded-md border shadow-sm">
                                            {rowCount.toLocaleString()} Rows
                                        </div>
                                    </div>
                                    <TabsContent value="data" className="mt-6 flex-1 flex flex-col min-h-0 relative overflow-hidden">
                                        <div className="flex-1 min-h-0">
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
                                            />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="structure" className="mt-4 space-y-6 overflow-y-auto flex-1 min-h-0 pb-24 pr-2">
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
                                </Tabs>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-6">
                            <Table className="h-16 w-16 text-muted-foreground" />
                            <h2 className="mt-4 text-xl font-semibold">Select a table to begin</h2>
                            <p className="mt-2 text-muted-foreground">Choose a table from the sidebar to view its data and structure.</p>
                            <Button asChild className="mt-4">
                                <Link href={projectId ? `/dashboard/tables/create?projectId=${projectId}` : '#'}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create New Table
                                </Link>
                            </Button>
                        </div>
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
