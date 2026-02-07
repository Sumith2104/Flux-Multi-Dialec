
'use client';

import { useState, useContext } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/back-button"
import { ProjectContext } from '@/contexts/project-context';
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
import { deleteProjectAction, clearOrganizationAction } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { logoutAction } from '../actions';

export default function SettingsPage() {
    const { project: selectedProject, setProject } = useContext(ProjectContext);
    const { toast } = useToast();
    const router = useRouter();
    const [deleteConfirmation, setDeleteConfirmation] = useState('');

    const handleDeleteProject = async () => {
        if (!selectedProject) {
            toast({ variant: 'destructive', title: 'Error', description: 'No project selected.' });
            return;
        }
        if (deleteConfirmation !== `delete my project ${selectedProject.display_name}`) {
            toast({ variant: 'destructive', title: 'Error', description: 'Confirmation text does not match.' });
            return;
        }
        const result = await deleteProjectAction(selectedProject.project_id);
        if (result.success) {
            toast({ title: 'Success', description: `Project '${selectedProject.display_name}' has been deleted.` });
            setProject(null); // Clear from context and local storage
            setDeleteConfirmation('');
            router.push('/dashboard/projects');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete project.' });
        }
    };

    const handleClearOrganization = async () => {
        const result = await clearOrganizationAction();
        if (result.success) {
            toast({ title: 'Success', description: 'Your organization data has been cleared.' });
            // Log the user out and redirect to the signup page
            await logoutAction();
            router.push('/signup');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to clear organization data.' });
        }
    };


    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
                <BackButton />
                <div>
                    <h1 className="text-3xl font-bold">Settings</h1>
                    <p className="text-muted-foreground">
                        Manage project and organization settings.
                    </p>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Project Configuration</CardTitle>
                    <CardDescription>Adjust settings for the current project. This section is for demonstration and is not functional.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="project-name">Project Name</Label>
                        <Input id="project-name" defaultValue={selectedProject?.display_name || ''} disabled />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <Label htmlFor="public-access" className="cursor-not-allowed">Enable Public Access</Label>
                            <p className="text-sm text-muted-foreground">Allow anyone with the link to view this project.</p>
                        </div>
                        <Switch id="public-access" disabled/>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button disabled>Save Changes</Button>
                </CardFooter>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <Label htmlFor="delete-project">Delete this Project</Label>
                            <p className="text-sm text-muted-foreground">
                                This will permanently delete the '{selectedProject?.display_name || '...'}' project, including all its tables and data.
                            </p>
                        </div>
                        <AlertDialog onOpenChange={(open) => !open && setDeleteConfirmation('')}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={!selectedProject}>Delete Project</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. To confirm, please type{' '}
                                        <strong className="text-foreground">delete my project {selectedProject?.display_name}</strong> in the box below.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="py-2">
                                     <Input
                                        id="delete-confirm"
                                        value={deleteConfirmation}
                                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                                        placeholder={`delete my project ${selectedProject?.display_name}`}
                                        className="font-mono"
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                        onClick={handleDeleteProject} 
                                        disabled={deleteConfirmation !== `delete my project ${selectedProject?.display_name}`}
                                        className="bg-destructive hover:bg-destructive/90"
                                    >
                                        Continue
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                     <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <Label htmlFor="clear-org">Clear Organization</Label>
                             <p className="text-sm text-muted-foreground">This will permanently delete all projects and data associated with your account.</p>
                        </div>
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" >Clear Organization Data</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This is your final confirmation. This action will permanently delete your entire account, all projects, and all data. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearOrganization} className="bg-destructive hover:bg-destructive/90">I understand, delete everything</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
