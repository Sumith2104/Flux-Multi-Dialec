'use client';

import { useGlobalAlert } from '@/components/global-alert-provider';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GridColDef, GridRowSelectionModel, GridPaginationModel } from '@mui/x-data-grid';
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
import { getTableData } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
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
    const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>([]);
    const [isEditRowOpen, setIsEditRowOpen] = useState(false);
    const [isEditColumnOpen, setIsEditColumnOpen] = useState(false);
    const [isDeleteTableAlertOpen, setIsDeleteTableAlertOpen] = useState(false);
    const [tableToDelete, setTableToDelete] = useState<DbTable | null>(null);
    const [columnToEdit, setColumnToEdit] = useState<DbColumn | null>(null);
    const [columnToDelete, setColumnToDelete] = useState<DbColumn | null>(null);
    const [constraintToDelete, setConstraintToDelete] = useState<DbConstraint | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState('data');

    const [rows, setRows] = useState<any[]>([]);
    const [rowCount, setRowCount] = useState(0);
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 100 });
    const [foreignKeyData, setForeignKeyData] = useState<Record<string, any[]>>({});
    const [constraints, setConstraints] = useState<DbConstraint[]>(initialConstraints);

    useEffect(() => {
        setConstraints(initialConstraints);
    }, [initialConstraints]);


    const abortControllerRef = React.useRef<AbortController | null>(null);

    const fetchTableData = useCallback(async (model: { page: number, pageSize: number }) => {
        if (!tableId || !tableName) return;

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsTableLoading(true);
        try {
            const response = await fetch(`/api/table-data?projectId=${projectId}&tableName=${tableName}&page=${model.page + 1}&pageSize=${model.pageSize}`, {
                signal: controller.signal
            });
            if (!response.ok) throw new Error('Failed to fetch table data');
            const data = await response.json();
            setRows(data.rows);
            setRowCount(data.totalRows);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return;
            }
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load table data.' });
        } finally {
            // Only turn off loading if this is the active request?
            // Actually, if aborted, we don't care.
            // But if we have a race condition where a new request starts before this finally block?
            // The new request sets loading=true.
            // This finally sets loading=false.
            // We should check if the signal is aborted?
            if (!controller.signal.aborted) {
                setIsTableLoading(false);
            }
        }
    }, [projectId, tableId, tableName, toast]);

    useEffect(() => {
        if (tableId && tableName) {
            fetchTableData(paginationModel);
        }
    }, [tableId, tableName, fetchTableData, paginationModel]);

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
                            const { rows } = await getTableData(projectId, refTable.table_name, 1, 1000); // Fetch up to 1000 rows for dropdown
                            fkData[col.column_name] = rows;
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

    const handlePaginationModelChange = (model: GridPaginationModel) => {
        setPaginationModel(model);
    };

    const refreshData = useCallback(() => {
        fetchTableData(paginationModel);
    }, [fetchTableData, paginationModel]);

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

    const columns: GridColDef[] = useMemo(() => {
        return initialColumns.map(col => ({
            field: col.column_name,
            headerName: col.column_name,
            minWidth: 150,
            flex: 1,
            sortable: false,
        }));
    }, [initialColumns]);

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
                router.push(`/editor?projectId=${projectId}`);
            } else {
                router.refresh();
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
            router.refresh();
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
            <div className="flex w-full items-start h-full">
                {/* Sidebar */}
                <aside className="w-64 flex-shrink-0 border-r bg-background flex flex-col h-full">
                    <div className="p-4">
                        <h2 className="text-lg font-semibold">Table Editor</h2>
                    </div>
                    <div className="p-2">
                        <Button variant="outline" className="w-full justify-start text-muted-foreground">
                            <span className="truncate">schema <strong>public</strong></span>
                            <ChevronDown className="ml-auto h-4 w-4" />
                        </Button>
                    </div>
                    <div className="p-2 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search tables..." className="pl-8" />
                    </div>
                    <nav className="flex-1 overflow-y-auto px-2 space-y-1 py-2">
                        {allTables.map((table) => (
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
                <main className="flex-1 flex flex-col overflow-hidden">
                    {currentTable && tableId && tableName ? (
                        <>
                            <header className="flex h-14 items-center gap-4 border-b bg-background px-6 flex-shrink-0">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Table className="h-4 w-4" />
                                    <span className="font-semibold text-foreground">{currentTable.table_name}</span>
                                </div>
                                <Separator orientation="vertical" className="h-6" />
                                <div className="flex items-center gap-2">
                                    {tableId && tableName && projectId && initialColumns && (
                                        <>
                                            <AddRowDialog
                                                projectId={projectId}
                                                tableId={tableId}
                                                tableName={tableName}
                                                columns={initialColumns}
                                                onRowAdded={refreshData}
                                                foreignKeyData={foreignKeyData}
                                                allTables={allTables}
                                                constraints={constraints}
                                            />

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
                                            columns={initialColumns}
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
                                <div className="flex items-center gap-2 ml-auto">
                                    <Button variant="outline" size="sm"><Filter className="mr-2 h-4 w-4" /> Filter</Button>
                                    <Button variant="outline" size="sm"><ArrowDownUp className="mr-2 h-4 w-4" /> Sort</Button>
                                </div>
                            </header>

                            <div className="p-6 overflow-y-auto">
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                    <TabsList>
                                        <TabsTrigger value="data">Data</TabsTrigger>
                                        <TabsTrigger value="structure">Structure</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="data" className="mt-4">
                                        <DataTable
                                            columns={columns}
                                            rows={rows}
                                            rowCount={rowCount}
                                            loading={isTableLoading}
                                            paginationModel={paginationModel}
                                            onPaginationModelChange={handlePaginationModelChange}
                                            selectionModel={selectionModel}
                                            onRowSelectionModelChange={(newSelectionModel) => {
                                                setSelectionModel(newSelectionModel);
                                            }}
                                        />
                                    </TabsContent>
                                    <TabsContent value="structure" className="mt-4 space-y-6 overflow-y-auto flex-1 min-h-0 pb-24">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Table Structure</CardTitle>
                                                <CardDescription>
                                                    {currentTable.description || `This is the schema for the '${currentTable.table_name}' table.`}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="border rounded-lg">
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
                                                            {initialColumns.map(col => (
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
                                                <AddColumnDialog
                                                    projectId={projectId}
                                                    tableId={tableId}
                                                    tableName={tableName}
                                                />
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
