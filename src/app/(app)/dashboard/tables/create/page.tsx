
'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createTableAction } from './actions';
import { SubmitButton } from '@/components/submit-button';
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DeleteProgress } from '@/components/delete-progress';

type ColumnType =
    // Special / Auto-generated
    | 'gen_random_uuid()' | 'now()'
    // Text
    | 'text' | 'varchar' | 'char' | 'bpchar' | 'name' | 'citext'
    // Numeric
    | 'integer' | 'int2' | 'int4' | 'int8' | 'bigint' | 'smallint'
    | 'numeric' | 'decimal' | 'real' | 'float4' | 'float8' | 'double precision' | 'money'
    // Boolean
    | 'boolean'
    // Date / Time
    | 'date' | 'time' | 'timetz' | 'timestamp' | 'timestamptz' | 'interval'
    // UUID
    | 'uuid'
    // JSON
    | 'json' | 'jsonb'
    // Binary
    | 'bytea'
    // Network
    | 'inet' | 'cidr' | 'macaddr'
    // Geometric
    | 'point' | 'line' | 'lseg' | 'box' | 'path' | 'polygon' | 'circle'
    // Arrays
    | 'text[]' | 'integer[]' | 'boolean[]' | 'jsonb[]'
    // Range
    | 'int4range' | 'int8range' | 'numrange' | 'tsrange' | 'tstzrange' | 'daterange'
    // Full-text Search
    | 'tsvector' | 'tsquery'
    // Other
    | 'xml' | 'bit' | 'varbit' | 'oid' | 'serial' | 'bigserial' | 'smallserial';

type Column = {
    id: string;
    name: string;
    type: ColumnType;
    isPrimaryKey: boolean;
    isNullable: boolean;
    defaultValue: string;
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
        { id: uuidv4(), name: 'id', type: 'gen_random_uuid()', isPrimaryKey: true, isNullable: false, defaultValue: '' },
    ]);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvFileName, setCsvFileName] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('manual');
    const [isSubmitting, setIsSubmitting] = useState(false);


    const addColumn = () => {
        setColumns([...columns, { id: uuidv4(), name: '', type: 'text', isPrimaryKey: false, isNullable: true, defaultValue: '' }]);
    };

    const removeColumn = (id: string) => {
        setColumns(columns.filter(col => col.id !== id));
    };

    const updateColumn = (id: string, field: keyof Column, value: string | boolean) => {
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
                        type: name.toLowerCase() === 'id' ? 'gen_random_uuid()' : 'text' as ColumnType,
                        isPrimaryKey: name.toLowerCase() === 'id',
                        isNullable: name.toLowerCase() !== 'id',
                        defaultValue: '',
                    }));

                    if (!header.some(h => h.toLowerCase() === 'id')) {
                        newColumns.unshift({ id: uuidv4(), name: 'id', type: 'gen_random_uuid()', isPrimaryKey: true, isNullable: false, defaultValue: '' });
                    }
                    setColumns(newColumns);
                }
            };
            reader.readAsText(file);
        }
    };

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        setColumns([{ id: uuidv4(), name: 'id', type: 'gen_random_uuid()', isPrimaryKey: true, isNullable: false, defaultValue: '' }]);
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

        const columnsStr = columns.map(c => [
            c.name,
            c.type,
            c.isPrimaryKey ? 'pk' : '',
            c.isNullable ? 'nullable' : 'notnull',
            c.defaultValue ? `default:${c.defaultValue}` : '',
        ].filter(Boolean).join('|')).join(',');
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
                                            <textarea
                                                id="description"
                                                name="description"
                                                placeholder="e.g., A table to store customer information."
                                                value={description}
                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                                                    <div key={col.id} className="rounded-lg border bg-card p-3 space-y-3">
                                                        {/* Row 1: Name + Type + Delete */}
                                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] items-center gap-2">
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
                                                                <SelectContent className="max-h-72">
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Special —</SelectLabel>
                                                                        <SelectItem value="gen_random_uuid()">UUID (Auto-generated)</SelectItem>
                                                                        <SelectItem value="now()">Timestamp (now())</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Text —</SelectLabel>
                                                                        <SelectItem value="text">text</SelectItem>
                                                                        <SelectItem value="varchar">varchar</SelectItem>
                                                                        <SelectItem value="char">char</SelectItem>
                                                                        <SelectItem value="citext">citext (case-insensitive)</SelectItem>
                                                                        <SelectItem value="name">name</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Integer —</SelectLabel>
                                                                        <SelectItem value="integer">integer (int4)</SelectItem>
                                                                        <SelectItem value="smallint">smallint (int2)</SelectItem>
                                                                        <SelectItem value="bigint">bigint (int8)</SelectItem>
                                                                        <SelectItem value="serial">serial (auto-increment)</SelectItem>
                                                                        <SelectItem value="bigserial">bigserial</SelectItem>
                                                                        <SelectItem value="smallserial">smallserial</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Decimal / Float —</SelectLabel>
                                                                        <SelectItem value="numeric">numeric / decimal</SelectItem>
                                                                        <SelectItem value="real">real (float4)</SelectItem>
                                                                        <SelectItem value="double precision">double precision (float8)</SelectItem>
                                                                        <SelectItem value="money">money</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Boolean —</SelectLabel>
                                                                        <SelectItem value="boolean">boolean</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Date / Time —</SelectLabel>
                                                                        <SelectItem value="date">date</SelectItem>
                                                                        <SelectItem value="time">time</SelectItem>
                                                                        <SelectItem value="timetz">timetz (with timezone)</SelectItem>
                                                                        <SelectItem value="timestamp">timestamp</SelectItem>
                                                                        <SelectItem value="timestamptz">timestamptz (with timezone)</SelectItem>
                                                                        <SelectItem value="interval">interval</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— UUID —</SelectLabel>
                                                                        <SelectItem value="uuid">uuid</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— JSON —</SelectLabel>
                                                                        <SelectItem value="json">json</SelectItem>
                                                                        <SelectItem value="jsonb">jsonb (binary json)</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Arrays —</SelectLabel>
                                                                        <SelectItem value="text[]">text[]</SelectItem>
                                                                        <SelectItem value="integer[]">integer[]</SelectItem>
                                                                        <SelectItem value="boolean[]">boolean[]</SelectItem>
                                                                        <SelectItem value="jsonb[]">jsonb[]</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Network —</SelectLabel>
                                                                        <SelectItem value="inet">inet (IP address)</SelectItem>
                                                                        <SelectItem value="cidr">cidr (network)</SelectItem>
                                                                        <SelectItem value="macaddr">macaddr</SelectItem>
                                                                    </SelectGroup>
                                                                    <SelectGroup>
                                                                        <SelectLabel>— Other —</SelectLabel>
                                                                        <SelectItem value="bytea">bytea (binary)</SelectItem>
                                                                        <SelectItem value="xml">xml</SelectItem>
                                                                        <SelectItem value="tsvector">tsvector (full-text)</SelectItem>
                                                                        <SelectItem value="point">point (geometry)</SelectItem>
                                                                    </SelectGroup>
                                                                </SelectContent>
                                                            </Select>
                                                            <Button
                                                                variant="destructive"
                                                                size="icon"
                                                                onClick={() => removeColumn(col.id)}
                                                                type="button"
                                                                disabled={col.name === 'id'}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                <span className="sr-only">Remove column</span>
                                                            </Button>
                                                        </div>

                                                        {/* Row 2: PK / Nullable / Default */}
                                                        <div className="flex flex-wrap items-center gap-4 pt-1">
                                                            {/* Primary Key */}
                                                            <div className="flex items-center gap-2">
                                                                <Switch
                                                                    id={`pk-${col.id}`}
                                                                    checked={col.isPrimaryKey}
                                                                    onCheckedChange={(v) => updateColumn(col.id, 'isPrimaryKey', v)}
                                                                    disabled={col.name === 'id'}
                                                                />
                                                                <Label htmlFor={`pk-${col.id}`} className="text-xs flex items-center gap-1 cursor-pointer">
                                                                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">PK</Badge>
                                                                    Primary Key
                                                                </Label>
                                                            </div>

                                                            {/* Nullable */}
                                                            <div className="flex items-center gap-2">
                                                                <Switch
                                                                    id={`null-${col.id}`}
                                                                    checked={col.isNullable}
                                                                    onCheckedChange={(v) => updateColumn(col.id, 'isNullable', v)}
                                                                    disabled={col.isPrimaryKey}
                                                                />
                                                                <Label htmlFor={`null-${col.id}`} className="text-xs cursor-pointer">Nullable</Label>
                                                            </div>

                                                            {/* Default Value */}
                                                            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                                                <Label className="text-xs shrink-0 text-muted-foreground">Default:</Label>
                                                                <Input
                                                                    placeholder="e.g. now(), 0, 'active'"
                                                                    value={col.defaultValue}
                                                                    onChange={(e) => updateColumn(col.id, 'defaultValue', e.target.value)}
                                                                    className="font-mono text-xs h-7"
                                                                    disabled={col.name === 'id'}
                                                                />
                                                            </div>
                                                        </div>
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
                                                                    <SelectContent className="max-h-72">
                                                                        <SelectGroup>
                                                                            <SelectLabel>— Special —</SelectLabel>
                                                                            <SelectItem value="gen_random_uuid()">UUID (Auto-generated)</SelectItem>
                                                                            <SelectItem value="now()">Timestamp (now())</SelectItem>
                                                                        </SelectGroup>
                                                                        <SelectGroup>
                                                                            <SelectLabel>— Text —</SelectLabel>
                                                                            <SelectItem value="text">text</SelectItem>
                                                                            <SelectItem value="varchar">varchar</SelectItem>
                                                                            <SelectItem value="char">char</SelectItem>
                                                                            <SelectItem value="citext">citext</SelectItem>
                                                                        </SelectGroup>
                                                                        <SelectGroup>
                                                                            <SelectLabel>— Integer —</SelectLabel>
                                                                            <SelectItem value="integer">integer</SelectItem>
                                                                            <SelectItem value="smallint">smallint</SelectItem>
                                                                            <SelectItem value="bigint">bigint</SelectItem>
                                                                            <SelectItem value="serial">serial (auto-inc)</SelectItem>
                                                                        </SelectGroup>
                                                                        <SelectGroup>
                                                                            <SelectLabel>— Decimal —</SelectLabel>
                                                                            <SelectItem value="numeric">numeric</SelectItem>
                                                                            <SelectItem value="real">real</SelectItem>
                                                                            <SelectItem value="double precision">double precision</SelectItem>
                                                                        </SelectGroup>
                                                                        <SelectGroup>
                                                                            <SelectLabel>— Boolean —</SelectLabel>
                                                                            <SelectItem value="boolean">boolean</SelectItem>
                                                                        </SelectGroup>
                                                                        <SelectGroup>
                                                                            <SelectLabel>— Date / Time —</SelectLabel>
                                                                            <SelectItem value="date">date</SelectItem>
                                                                            <SelectItem value="time">time</SelectItem>
                                                                            <SelectItem value="timestamp">timestamp</SelectItem>
                                                                            <SelectItem value="timestamptz">timestamptz</SelectItem>
                                                                            <SelectItem value="interval">interval</SelectItem>
                                                                        </SelectGroup>
                                                                        <SelectGroup>
                                                                            <SelectLabel>— JSON / Other —</SelectLabel>
                                                                            <SelectItem value="uuid">uuid</SelectItem>
                                                                            <SelectItem value="json">json</SelectItem>
                                                                            <SelectItem value="jsonb">jsonb</SelectItem>
                                                                            <SelectItem value="bytea">bytea</SelectItem>
                                                                            <SelectItem value="xml">xml</SelectItem>
                                                                            <SelectItem value="inet">inet</SelectItem>
                                                                        </SelectGroup>
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
