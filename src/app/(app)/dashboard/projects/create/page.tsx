'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createProjectAction, getAllowedInstanceSizesAction, testExternalConnectionAction, listExternalDatabasesAction } from '@/components/layout/actions';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, Loader2 } from 'lucide-react';
import { useState, useContext, useEffect } from 'react';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';

const timezones = Intl.supportedValuesOf('timeZone');

export default function CreateProjectPage() {
    const router = useRouter();
    const { setProject } = useContext(ProjectContext);
    const { toast } = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedDialect, setSelectedDialect] = useState<'postgresql' | 'mysql'>('postgresql');
    const [allowedSizes, setAllowedSizes] = useState<string[]>(['db.t3.micro']);
    
    // External Connection States
    const [connectionType, setConnectionType] = useState<'internal' | 'external_db' | 'external_server'>('internal');
    const [importMode, setImportMode] = useState<'direct' | 'import'>('direct');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('5432');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [database, setDatabase] = useState('');
    const [ssl, setSsl] = useState(false);
    const [serverDatabases, setServerDatabases] = useState<string[]>([]);
    const [fetchedDbSelected, setFetchedDbSelected] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [isFetchingDbs, setIsFetchingDbs] = useState(false);

    useEffect(() => {
        getAllowedInstanceSizesAction().then(res => setAllowedSizes(res.allowedSizes || ['db.t3.micro']));
    }, []);

    // Sync default port on dialect change
    useEffect(() => {
        setPort(selectedDialect === 'postgresql' ? '5432' : '3306');
        setServerDatabases([]);
        setFetchedDbSelected('');
    }, [selectedDialect]);

    async function handleTestConnection() {
        if (!host) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Database host is required.' });
            return;
        }
        setIsTesting(true);
        try {
            const config = {
                host,
                port: parseInt(port, 10),
                user,
                password,
                database: connectionType === 'external_db' ? database : (selectedDialect === 'postgresql' ? 'postgres' : undefined),
                ssl
            };
            const result = await testExternalConnectionAction(selectedDialect, config);
            if (result.success) {
                toast({
                    title: 'Connection Success',
                    description: 'Successfully reached the target database server!',
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Connection Failed',
                    description: result.error || 'Check host, port, or user credentials.',
                });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Connection Error', description: err.message });
        } finally {
            setIsTesting(false);
        }
    }

    async function handleFetchDatabases() {
        if (!host) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Database host is required.' });
            return;
        }
        setIsFetchingDbs(true);
        try {
            const config = {
                host,
                port: parseInt(port, 10),
                user,
                password,
                database: selectedDialect === 'postgresql' ? 'postgres' : undefined,
                ssl
            };
            const result = await listExternalDatabasesAction(selectedDialect, config);
            if (result.success && result.databases) {
                setServerDatabases(result.databases);
                toast({
                    title: 'Discovery Complete',
                    description: `Found ${result.databases.length} databases on server.`,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Discovery Failed',
                    description: result.error || 'Failed to list databases. Ensure credentials are correct.',
                });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Discovery Error', description: err.message });
        } finally {
            setIsFetchingDbs(false);
        }
    }

    async function handleCreateProject(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        
        const form = e.currentTarget;
        const projectNameElement = form.elements.namedItem('projectName') as HTMLInputElement;
        const timezoneElement = form.elements.namedItem('timezone') as HTMLInputElement;

        if (!projectNameElement.value) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Project name is required.' });
            return;
        }

        if (connectionType === 'external_db' && !database) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Target database name is required.' });
            return;
        }

        if (connectionType === 'external_server' && !fetchedDbSelected) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fetch databases and select one.' });
            return;
        }

        setIsSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('projectName', projectNameElement.value);
            formData.append('timezone', timezoneElement.value);
            formData.append('dialect', selectedDialect);
            formData.append('connectionType', connectionType);

            if (connectionType === 'internal') {
                const instanceSizeElement = form.elements.namedItem('instanceSize') as HTMLInputElement;
                formData.append('instanceSize', instanceSizeElement.value);
            } else {
                formData.append('importMode', importMode);
                const config = {
                    host,
                    port,
                    user,
                    password,
                    database: connectionType === 'external_db' ? database : fetchedDbSelected,
                    ssl
                };
                formData.append('connectionConfig', JSON.stringify(config));
            }

            const result = await createProjectAction(formData);
            if (result.success && result.project) {
                // Auto-hydrate the global context so Navbar reflects the change instantly
                setProject(result.project);
                toast({ title: 'Success', description: 'Project created successfully!' });

                // Route back to the Dashboard list view
                router.push(`/dashboard/projects`);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to create project' });
            }
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-full bg-background p-4 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl">
                <Button variant="ghost" className="mb-4 text-muted-foreground hover:text-foreground" onClick={() => router.push('/dashboard')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>

                <Card className="border-white/10 shadow-2xl bg-card/60 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">Create New Project</CardTitle>
                        <CardDescription>Configure and deploy a dynamic database tenant in your workspace.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="create-project-form" onSubmit={handleCreateProject} className="grid gap-8">

                            {/* Dialect Selection */}
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-base font-semibold">Database Engine</Label>
                                    <p className="text-sm text-muted-foreground mb-4">Select the SQL dialect for your relational mapping environment.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div
                                        onClick={() => setSelectedDialect('postgresql')}
                                        className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedDialect === 'postgresql' ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
                                    >
                                        <Database className={`h-10 w-10 mb-3 ${selectedDialect === 'postgresql' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <h3 className={`font-bold text-lg ${selectedDialect === 'postgresql' ? 'text-primary' : 'text-foreground'}`}>PostgreSQL</h3>
                                        <p className="text-xs text-center text-muted-foreground mt-2">Highly extensible, standards-compliant object-relational database.</p>
                                        {selectedDialect === 'postgresql' && (
                                            <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                                                <div className="h-2 w-2 rounded-full bg-background" />
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        onClick={() => setSelectedDialect('mysql')}
                                        className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedDialect === 'mysql' ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.05)]' : 'border-border/50 bg-background/50 hover:border-blue-500/50'}`}
                                    >
                                        <Database className={`h-10 w-10 mb-3 ${selectedDialect === 'mysql' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                                        <h3 className={`font-bold text-lg ${selectedDialect === 'mysql' ? 'text-blue-500' : 'text-foreground'}`}>MySQL</h3>
                                        <p className="text-xs text-center text-muted-foreground mt-2">Fast, reliable, and widely-used open-source relational database.</p>
                                        {selectedDialect === 'mysql' && (
                                            <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
                                                <div className="h-2 w-2 rounded-full bg-background" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <input type="hidden" name="dialect" value={selectedDialect} />
                            </div>

                            <hr className="border-white/10" />

                            {/* Deployment Connection Type selection */}
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-base font-semibold">Deployment Option</Label>
                                    <p className="text-sm text-muted-foreground mb-4">Choose whether to deploy on Fluxbase Cloud or connect an external server.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div
                                        onClick={() => setConnectionType('internal')}
                                        className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${connectionType === 'internal' ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
                                    >
                                        <Database className={`h-8 w-8 mb-2 ${connectionType === 'internal' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <h3 className={`font-bold text-xs ${connectionType === 'internal' ? 'text-primary' : 'text-foreground'}`}>Fluxbase Cloud</h3>
                                        <p className="text-[10px] text-center text-muted-foreground mt-2">Fully-managed autoscaling instance container.</p>
                                        {connectionType === 'internal' && (
                                            <div className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center rounded-full bg-primary">
                                                <div className="h-1.5 w-1.5 rounded-full bg-background" />
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        onClick={() => setConnectionType('external_db')}
                                        className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${connectionType === 'external_db' ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
                                    >
                                        <Database className={`h-8 w-8 mb-2 ${connectionType === 'external_db' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <h3 className={`font-bold text-xs ${connectionType === 'external_db' ? 'text-primary' : 'text-foreground'}`}>External DB</h3>
                                        <p className="text-[10px] text-center text-muted-foreground mt-2">Connect to a pre-existing target database schema.</p>
                                        {connectionType === 'external_db' && (
                                            <div className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center rounded-full bg-primary">
                                                <div className="h-1.5 w-1.5 rounded-full bg-background" />
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        onClick={() => setConnectionType('external_server')}
                                        className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${connectionType === 'external_server' ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
                                    >
                                        <Database className={`h-8 w-8 mb-2 ${connectionType === 'external_server' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <h3 className={`font-bold text-xs ${connectionType === 'external_server' ? 'text-primary' : 'text-foreground'}`}>External Server</h3>
                                        <p className="text-[10px] text-center text-muted-foreground mt-2">Scan external hosts and choose a target database.</p>
                                        {connectionType === 'external_server' && (
                                            <div className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center rounded-full bg-primary">
                                                <div className="h-1.5 w-1.5 rounded-full bg-background" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <input type="hidden" name="connectionType" value={connectionType} />
                            </div>

                            <hr className="border-white/10" />

                            {/* Internal Provisioning Settings */}
                            {connectionType === 'internal' && (
                                <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
                                    <div>
                                        <Label className="text-base font-semibold">Infrastructure Profile</Label>
                                        <p className="text-sm text-muted-foreground mb-4">Select the hardware specifications for your database deployment.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="instanceSize" className="text-sm font-medium">Instance Size</Label>
                                            <Select name="instanceSize" defaultValue="db.t3.micro" required>
                                                <SelectTrigger className="h-12 border-white/20 hover:border-white/40">
                                                    <SelectValue placeholder="Select instance size" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="db.t3.micro">Dev (t3.micro - 2 vCPU, 1GB RAM)</SelectItem>
                                                    <SelectItem value="db.t3.medium" disabled={!allowedSizes.includes('db.t3.medium')}>
                                                        Pro (t3.medium - 2 vCPU, 4GB RAM) {!allowedSizes.includes('db.t3.medium') && <span className="text-xs text-muted-foreground ml-2">(Pro Plan)</span>}
                                                    </SelectItem>
                                                    <SelectItem value="db.t3.large" disabled={!allowedSizes.includes('db.t3.large')}>
                                                        Scale (t3.large - 2 vCPU, 8GB RAM) {!allowedSizes.includes('db.t3.large') && <span className="text-xs text-muted-foreground ml-2">(Max Plan)</span>}
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-2">
                                            <Label htmlFor="region" className="text-sm font-medium">Cloud Region</Label>
                                            <Select name="region" defaultValue="ap-south-1" required>
                                                <SelectTrigger className="h-12 border-white/20 hover:border-white/40">
                                                    <SelectValue placeholder="Select region" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ap-south-1">Mumbai (ap-south-1)</SelectItem>
                                                    <SelectItem value="us-east-1">N. Virginia (us-east-1)</SelectItem>
                                                    <SelectItem value="eu-central-1">Frankfurt (eu-central-1)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* External Credentials Fields */}
                            {connectionType !== 'internal' && (
                                <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
                                    <div>
                                        <Label className="text-base font-semibold">External Server Connection Settings</Label>
                                        <p className="text-sm text-muted-foreground mb-4">Input the network location and access credentials for your server.</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2 grid gap-2">
                                            <Label htmlFor="ext-host" className="text-sm font-medium">Host Address</Label>
                                            <Input
                                                id="ext-host"
                                                placeholder="e.g. postgres-db.example.com or 192.168.1.100"
                                                value={host}
                                                onChange={e => setHost(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="ext-port" className="text-sm font-medium">Port</Label>
                                            <Input
                                                id="ext-port"
                                                type="number"
                                                placeholder={selectedDialect === 'postgresql' ? '5432' : '3306'}
                                                value={port}
                                                onChange={e => setPort(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="ext-user" className="text-sm font-medium">Username</Label>
                                            <Input
                                                id="ext-user"
                                                placeholder="root or pgadmin"
                                                value={user}
                                                onChange={e => setUser(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="ext-pass" className="text-sm font-medium">Password</Label>
                                            <Input
                                                id="ext-pass"
                                                type="password"
                                                placeholder="••••••••••••"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2 pt-2">
                                        <input
                                            id="ext-ssl"
                                            type="checkbox"
                                            checked={ssl}
                                            onChange={e => setSsl(e.target.checked)}
                                            className="h-4 w-4 rounded border-white/20 bg-background accent-primary text-primary focus:ring-0"
                                        />
                                        <Label htmlFor="ext-ssl" className="text-sm cursor-pointer select-none">Require SSL (rejectUnauthorized: false)</Label>
                                    </div>

                                    {/* Connection Type-Specific Inputs */}
                                    {connectionType === 'external_db' && (
                                        <div className="grid gap-2 pt-2 animate-in fade-in duration-200">
                                            <Label htmlFor="ext-database" className="text-sm font-medium">Database / Schema Name</Label>
                                            <Input
                                                id="ext-database"
                                                placeholder="e.g. prod_analytics"
                                                value={database}
                                                onChange={e => setDatabase(e.target.value)}
                                                className="h-12"
                                            />
                                        </div>
                                    )}

                                    {connectionType === 'external_server' && (
                                        <div className="space-y-4 pt-2 animate-in fade-in duration-200">
                                            <div className="flex gap-4">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    className="w-full h-11"
                                                    disabled={isFetchingDbs}
                                                    onClick={handleFetchDatabases}
                                                >
                                                    {isFetchingDbs ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching...
                                                        </>
                                                    ) : (
                                                        'Fetch Databases'
                                                    )}
                                                </Button>
                                            </div>

                                            {serverDatabases.length > 0 && (
                                                <div className="grid gap-2 animate-in slide-in-from-top duration-300">
                                                    <Label htmlFor="discovered-db" className="text-sm font-medium">Initial Default Database</Label>
                                                    <span className="text-[11px] text-muted-foreground/80 leading-normal block -mt-1">
                                                        Select the starting database catalog to load first. Inside the editor sidebar, you will be able to dynamically switch to **any** other database catalog on this server at any time.
                                                    </span>
                                                    <Select value={fetchedDbSelected} onValueChange={setFetchedDbSelected} required>
                                                        <SelectTrigger className="h-12">
                                                            <SelectValue placeholder="Choose a database from the server..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {serverDatabases.map(db => (
                                                                <SelectItem key={db} value={db}>{db}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Replication & Sync Mode */}
                                    <div className="space-y-3 pt-2">
                                        <Label className="text-sm font-semibold">Data Synchronization Mode</Label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div
                                                onClick={() => setImportMode('direct')}
                                                className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${importMode === 'direct' ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,255,255,0.03)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
                                            >
                                                <h4 className={`font-bold text-xs ${importMode === 'direct' ? 'text-primary' : 'text-foreground'}`}>Direct Connection (Live Mode)</h4>
                                                <p className="text-[10px] text-muted-foreground mt-1">Keep tables and data on your remote server. Fluxbase queries your database live.</p>
                                                {importMode === 'direct' && (
                                                    <div className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center rounded-full bg-primary">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-background" />
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                onClick={() => setImportMode('import')}
                                                className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${importMode === 'import' ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,255,255,0.03)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
                                            >
                                                <h4 className={`font-bold text-xs ${importMode === 'import' ? 'text-primary' : 'text-foreground'}`}>Import to Cloud (Copy Mode)</h4>
                                                <p className="text-[10px] text-muted-foreground mt-1">Copy all external tables, columns, and rows to our internal database (Fluxbase Cloud).</p>
                                                {importMode === 'import' && (
                                                    <div className="absolute top-2 right-2 flex h-3 w-3 items-center justify-center rounded-full bg-primary">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-background" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Test Connection Button */}
                                    <div className="pt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full h-11 border-white/20 hover:bg-white/5"
                                            disabled={isTesting}
                                            onClick={handleTestConnection}
                                        >
                                            {isTesting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing Connection...
                                                </>
                                            ) : (
                                                'Test Database Connection'
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <hr className="border-white/10" />

                            {/* Project Meta Details */}
                            <div className="grid gap-2">
                                <Label htmlFor="projectName" className="text-base font-semibold">Project Name</Label>
                                <Input
                                    id="projectName"
                                    name="projectName"
                                    placeholder="e.g., E-Commerce Analytics Database"
                                    className="h-12 text-md transition-all focus:ring-primary"
                                    required
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="timezone" className="text-base font-semibold">Database Timezone</Label>
                                <Select name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} required>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Select a timezone" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {timezones.map(tz => (
                                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Default timezone for automatically generated timestamps (e.g., NOW()).</p>
                            </div>
                        </form>
                    </CardContent>
                    <CardFooter className="bg-muted/10 pt-6 pb-6 rounded-b-xl border-t border-white/5">
                        <Button type="submit" form="create-project-form" className="w-full h-12 text-base font-bold" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Provisioning...
                                </>
                            ) : (
                                connectionType === 'internal' 
                                    ? 'Complete Provisioning' 
                                    : importMode === 'import'
                                        ? 'Import & Link Database'
                                        : 'Link Database Connection'
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
