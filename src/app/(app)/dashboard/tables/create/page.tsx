
'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createTableAction } from './actions';
import { SubmitButton } from '@/components/submit-button';
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DeleteProgress } from '@/components/delete-progress';

type ColumnType = 'text' | 'number' | 'date' | 'gen_random_uuid()' | 'now()';

type Column = {
    id: string;
    name: string;
    type: ColumnType;
};

export default function CreateTablePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId');
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [tableName, setTableName] = useState('');
    const [description, setDescription] = useState('');
    const [columns, setColumns] = useState<Column[]>([
        { id: uuidv4(), name: 'id', type: 'gen_random_uuid()' },
    ]);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvFileName, setCsvFileName] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('manual');
    const [isSubmitting, setIsSubmitting] = useState(false);


    const addColumn = () => {
        setColumns([...columns, { id: uuidv4(), name: '', type: 'text' }]);
    };

    const removeColumn = (id: string) => {
        setColumns(columns.filter(col => col.id !== id));
    };

    const updateColumn = (id: string, field: keyof Column, value: string) => {
        setColumns(columns.map(col =>
            col.id === id ? { ...col, [field]: value } : col
        ));
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setCsvFile(file);
            setCsvFileName(file.name);

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                const lines = text.trim().split('\n');
                if (lines.length > 0) {
                    const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                    let newColumns: Column[] = header.map(name => ({
                        id: uuidv4(),
                        name: name,
                        type: name.toLowerCase() === 'id' ? 'gen_random_uuid()' : 'text',
                    }));

                    if (!header.some(h => h.toLowerCase() === 'id')) {
                        newColumns.unshift({ id: uuidv4(), name: 'id', type: 'gen_random_uuid()' });
                    }
                    setColumns(newColumns);
                }
            };
            reader.readAsText(file);
        }
    };

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        setColumns([{ id: uuidv4(), name: 'id', type: 'gen_random_uuid()' }]);
        setCsvFile(null);
        setCsvFileName(null);
        setTableName('');
        setDescription('');
    };

    async function handleCreateTable(formData: FormData) {
        if (!projectId) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Project ID is missing. Cannot create table.",
            });
            return;
        }

        if (activeTab === 'import' && !csvFile) {
            toast({ variant: "destructive", title: "Missing File", description: "Please select a CSV file to import." });
            return;
        }

        for (const col of columns) {
            if (!col.name.trim() || !col.type) {
                toast({
                    variant: "destructive",
                    title: "Invalid Column",
                    description: "All column names and types must be filled out.",
                });
                return;
            }
        }

        setIsSubmitting(true);

        const columnsStr = columns.map(c => `${c.name}:${c.type}`).join(',');
        formData.set('columns', columnsStr);
        formData.append('projectId', projectId);

        // Step 1: Create the table schema
        const result = await createTableAction(formData);

        if (!result.success || !result.tableId) {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error || 'Failed to create table schema.',
            });
            setIsSubmitting(false);
            return;
        }

        // Step 2: If creating from CSV, stream the file to the import API
        if (activeTab === 'import' && csvFile) {
            const importFormData = new FormData();
            importFormData.append('projectId', projectId);
            importFormData.append('tableId', result.tableId);
            importFormData.append('tableName', formData.get('tableName') as string);
            importFormData.append('csvFile', csvFile);

            try {
                const response = await fetch('/api/import-csv', {
                    method: 'POST',
                    body: importFormData,
                });
                const importResult = await response.json();

                if (!response.ok) {
                    throw new Error(importResult.error || 'An unknown error occurred during import.');
                }
                toast({
                    title: "Success",
                    description: `Table created and ${importResult.importedCount} rows imported successfully.`,
                });
                router.push(`/editor?projectId=${projectId}&tableId=${result.tableId}&tableName=${formData.get('tableName') as string}`);

            } catch (error) {
                toast({
                    variant: "destructive",
                    title: "Import Failed",
                    description: `The table schema was created, but data import failed. You can import data later. Error: ${(error as Error).message}`,
                    duration: 10000,
                });
                // Redirect to the (empty) table so the user can try importing again
                router.push(`/editor?projectId=${projectId}&tableId=${result.tableId}&tableName=${formData.get('tableName') as string}`);
            } finally {
                setIsSubmitting(false);
            }
        } else {
            toast({
                title: "Success",
                description: "Table created successfully.",
            });
            router.push(`/editor?projectId=${projectId}&tableId=${result.tableId}&tableName=${formData.get('tableName') as string}`);
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-full bg-background p-4 animate-in fade-in duration-500">
            <div className="w-full max-w-3xl">
                <Button variant="ghost" asChild className="mb-4">
                    <Link href="/dashboard">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Dashboard
                    </Link>
                </Button>
                <form action={handleCreateTable}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">Create New Table</CardTitle>
                            {isSubmitting ? (
                                <CardDescription>
                                    Your table is being created. Please wait...
                                </CardDescription>
                            ) : (
                                <CardDescription>
                                    Define the schema for your new table manually or by importing a CSV file.
                                </CardDescription>
                            )}

                        </CardHeader>
                        <CardContent>
                            {isSubmitting ? (
                                <div className="py-8 space-y-4">
                                    <p className="text-center text-muted-foreground">Creating table and importing data... Please do not close this window.</p>
                                    <DeleteProgress />
                                </div>
                            ) : (
                                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="manual">Create Manually</TabsTrigger>
                                        <TabsTrigger value="import">Import from CSV</TabsTrigger>
                                    </TabsList>
                                    <div className="grid gap-6 pt-6">
                                        <div className="grid gap-2">
                                            <Label htmlFor="tableName">Table Name</Label>
                                            <Input
                                                id="tableName"
                                                name="tableName"
                                                placeholder="e.g., users"
                                                required
                                                className="font-mono"
                                                value={tableName}
                                                onChange={(e) => setTableName(e.target.value)}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="description">Description (Optional)</Label>
                                            <Textarea
                                                id="description"
                                                name="description"
                                                placeholder="e.g., A table to store customer information."
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <TabsContent value="manual" className="mt-6">
                                        <div className="grid gap-4">
                                            <div>
                                                <Label>Columns</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Define the name and data type for each column.
                                                </p>
                                            </div>
                                            <div className="space-y-4">
                                                {columns.map((col, index) => (
                                                    <div key={col.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] items-center gap-2">
                                                        <Input
                                                            placeholder="Column name"
                                                            value={col.name}
                                                            onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                                                            className="font-mono"
                                                            required
                                                            disabled={col.name === 'id'}
                                                        />
                                                        <Select
                                                            value={col.type}
                                                            onValueChange={(value: ColumnType) => updateColumn(col.id, 'type', value)}
                                                            disabled={col.name === 'id'}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Type" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="text">Text</SelectItem>
                                                                <SelectItem value="number">Number</SelectItem>
                                                                <SelectItem value="date">Date</SelectItem>
                                                                <SelectItem value="gen_random_uuid()">UUID (Auto-generated)</SelectItem>
                                                                <SelectItem value="now()">Current Timestamp (now())</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            variant="destructive"
                                                            size="icon"
                                                            onClick={() => removeColumn(col.id)}
                                                            type="button"
                                                            disabled={col.name === 'id'}
                                                            className="justify-self-end"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Remove column</span>
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button variant="outline" onClick={addColumn} type="button">
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add Column
                                            </Button>
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="import" className="mt-6">
                                        <div className="grid gap-4">
                                            <Alert>
                                                <AlertTitle>Import Guidelines</AlertTitle>
                                                <AlertDescription>
                                                    The first row of the CSV must be a header that exactly matches the columns defined below. An 'id' column will be added automatically if not present.
                                                </AlertDescription>
                                            </Alert>
                                            <Input
                                                type="file"
                                                accept=".csv"
                                                ref={fileInputRef}
                                                className="hidden"
                                                onChange={handleFileChange}
                                                required={activeTab === 'import'}
                                            />
                                            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                                <Upload className="mr-2 h-4 w-4" />
                                                {csvFileName ? `Selected: ${csvFileName}` : "Choose a CSV file"}
                                            </Button>

                                            {csvFile && (
                                                <div className="grid gap-4">
                                                    <div>
                                                        <Label>Columns Detected</Label>
                                                        <p className="text-sm text-muted-foreground">
                                                            Adjust data types as needed.
                                                        </p>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {columns.map((col) => (
                                                            <div key={col.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] items-center gap-2">
                                                                <Input
                                                                    value={col.name}
                                                                    readOnly
                                                                    className="font-mono bg-muted"
                                                                />
                                                                <Select
                                                                    value={col.type}
                                                                    onValueChange={(value: ColumnType) => updateColumn(col.id, 'type', value)}
                                                                    disabled={col.name === 'id'}
                                                                >
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Type" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="text">Text</SelectItem>
                                                                        <SelectItem value="number">Number</SelectItem>
                                                                        <SelectItem value="date">Date</SelectItem>
                                                                        <SelectItem value="gen_random_uuid()">UUID</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                                <div className="w-10 h-10 justify-self-end" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            )}
                        </CardContent>
                        {!isSubmitting && (
                            <CardFooter>
                                <SubmitButton type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? 'Creating...' : 'Create Table'}
                                </SubmitButton>
                            </CardFooter>
                        )}
                    </Card>
                </form>
            </div>
        </div>
    );
}
