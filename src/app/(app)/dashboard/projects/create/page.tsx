'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createProjectAction } from '@/components/layout/actions';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, Loader2 } from 'lucide-react';
import { useState, useContext } from 'react';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';

const timezones = Intl.supportedValuesOf('timeZone');

export default function CreateProjectPage() {
    const router = useRouter();
    const { setProject } = useContext(ProjectContext);
    const { toast } = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedDialect, setSelectedDialect] = useState<'postgresql' | 'mysql'>('postgresql');

    async function handleCreateProject(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Construct FormData manually to bypass Next.js Server Action payload stripping
            const form = e.currentTarget;
            const projectNameElement = form.elements.namedItem('projectName') as HTMLInputElement;
            const timezoneElement = form.elements.namedItem('timezone') as HTMLInputElement;

            const formData = new FormData();
            formData.append('projectName', projectNameElement.value);
            formData.append('timezone', timezoneElement.value);
            formData.append('dialect', selectedDialect);

            const result = await createProjectAction(formData);
            if (result.success && result.project) {
                // Auto-hydrate the global context so Navbar reflects the change instantly
                setProject(result.project);
                toast({ title: 'Success', description: 'Project created successfully!' });

                // Route back to the Dashboard list view for the new project
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
                <Button variant="ghost" className="mb-4" onClick={() => router.push('/dashboard')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>

                <Card className="border-white/10 shadow-2xl bg-card/60 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-3xl font-bold tracking-tight">Create New Project</CardTitle>
                        <CardDescription>Provision an isolated database container on the Fluxbase Infrastructure.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form id="create-project-form" onSubmit={handleCreateProject} className="grid gap-8">

                            {/* Dialect Selection Cards */}
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-base font-semibold">Database Engine</Label>
                                    <p className="text-sm text-muted-foreground mb-4">Select the relational mapping environment for your data.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div
                                        onClick={() => setSelectedDialect('postgresql')}
                                        className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedDialect === 'postgresql' ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'border-border/50 bg-background/50 hover:border-primary/50'}`}
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
                                        className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedDialect === 'mysql' ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'border-border/50 bg-background/50 hover:border-blue-500/50'}`}
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
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Provisioning Cluster...
                                </>
                            ) : (
                                'Complete Provisioning'
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
