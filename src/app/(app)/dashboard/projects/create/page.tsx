

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createProjectAction } from '@/components/layout/actions';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/submit-button';
import { ArrowLeft } from 'lucide-react';

const timezones = Intl.supportedValuesOf('timeZone');

export default function CreateProjectPage() {

    async function handleCreateProject(formData: FormData) {
        'use server';
        const result = await createProjectAction(formData);
        if (result.success) {
            redirect(`/dashboard`);
        } else {
            // In a real app, you'd want to show the error to the user
            console.error(result.error);
            redirect('/dashboard/projects/create?error=' + encodeURIComponent(result.error || ''));
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-full bg-background p-4 animate-in fade-in duration-500">
            <div className="w-full max-w-md">
                <Button variant="ghost" asChild className="mb-4">
                    <Link href="/dashboard">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Dashboard
                    </Link>
                </Button>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">Create New Project</CardTitle>
                        <CardDescription>Enter a name and select a dialect for your new database.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form action={handleCreateProject} className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="projectName">Project Name</Label>
                                <Input
                                    id="projectName"
                                    name="projectName"
                                    placeholder="e.g., Q4 Marketing Analysis"
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="dialect">SQL Dialect</Label>
                                <Select name="dialect" defaultValue="postgresql" required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a dialect" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="postgresql">PostgreSQL (Standard)</SelectItem>
                                        <SelectItem value="mysql">MySQL</SelectItem>
                                        <SelectItem value="oracle">Oracle</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">This determines syntax validation rules.</p>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="timezone">Database Timezone</Label>
                                <Select name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} required>
                                    <SelectTrigger>
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
                            <SubmitButton type="submit" className="w-full">
                                Create Project
                            </SubmitButton>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
