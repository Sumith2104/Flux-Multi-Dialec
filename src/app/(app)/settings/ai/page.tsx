'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useContext, useEffect, useState } from "react";
import { ProjectContext } from "@/contexts/project-context";
import { updateProjectAiSettingsAction } from "@/app/(app)/settings/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert } from "lucide-react";

export default function AiSettingsPage() {
    const { project, setProject } = useContext(ProjectContext);
    const { toast } = useToast();
    
    const [allowDestructive, setAllowDestructive] = useState(false);
    const [schemaInference, setSchemaInference] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Sync initial state from project context
    useEffect(() => {
        if (project) {
            setAllowDestructive(project.ai_allow_destructive ?? false);
            setSchemaInference(project.ai_schema_inference ?? true);
            setHasChanges(false);
        }
    }, [project]);

    // Track unsaved changes
    useEffect(() => {
        if (!project) return;
        const destructiveChanged = allowDestructive !== (project.ai_allow_destructive ?? false);
        const schemaChanged = schemaInference !== (project.ai_schema_inference ?? true);
        setHasChanges(destructiveChanged || schemaChanged);
    }, [allowDestructive, schemaInference, project]);

    const handleSave = async () => {
        if (!project) return;
        setIsSaving(true);
        const res = await updateProjectAiSettingsAction(project.project_id, allowDestructive, schemaInference);
        setIsSaving(false);

        if (res.success) {
            toast({ title: "Preferences Saved", description: "AI behavior rules have been updated for this project." });
            setHasChanges(false);
            
            // Critical Fix: Sync the new DB state back to the LocalStorage Context
            // so a page refresh doesn't load the old JSON payload.
            if (setProject) {
                setProject({
                    ...project,
                    ai_allow_destructive: allowDestructive,
                    ai_schema_inference: schemaInference
                });
            }
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error || "Failed to save AI preferences." });
        }
    };

    if (!project) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>AI Assistant</CardTitle>
                    <CardDescription>Configure how your AI interacts with your database.</CardDescription>
                </CardHeader>
                <CardContent className="h-32 flex items-center justify-center text-muted-foreground">
                    Please select a project first.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>AI Assistant</CardTitle>
                <CardDescription>Configure how the GenAI Engine treats your data definitions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-background">
                    <div className="space-y-1">
                        <Label className="text-base flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-destructive" />
                            Allow Destructive Query Execution
                        </Label>
                        <p className="text-muted-foreground text-sm max-w-xl">
                            If enabled, the AI is allowed to write and autonomously execute DELETE, DROP, and TRUNCATE SQL sequences in responses. Keep this disabled for production safety.
                        </p>
                    </div>
                    <Switch 
                        checked={allowDestructive} 
                        onCheckedChange={setAllowDestructive} 
                    />
                </div>
                
                <div className="flex items-center justify-between p-4 rounded-lg border bg-background">
                    <div className="space-y-1">
                        <Label className="text-base">Realtime Schema Inference</Label>
                        <p className="text-muted-foreground text-sm max-w-xl">
                            Allow the AI to natively read your PostgreSQL database table structures continuously to map accurate DDL prompts, instead of relying on manually curated metadata tables.
                        </p>
                    </div>
                    <Switch 
                        checked={schemaInference}
                        onCheckedChange={setSchemaInference}
                    />
                </div>
            </CardContent>
            <CardFooter className="bg-muted/50 py-4 mt-6 flex justify-end">
                <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Preferences
                </Button>
            </CardFooter>
        </Card>
    );
}
