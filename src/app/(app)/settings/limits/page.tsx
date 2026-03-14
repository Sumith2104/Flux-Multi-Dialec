'use client';

import { useState, useContext, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { getProjectLimitsAction, updateProjectLimitsAction } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from "@/components/ui/slider"
import { ShieldAlert } from 'lucide-react';

export default function LimitsSettingsPage() {
    const { project: selectedProject } = useContext(ProjectContext);
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [limits, setLimits] = useState({
        custom_row_limit: '',
        custom_api_limit: '',
        custom_request_limit: '',
        alert_email: '',
        alert_threshold_percent: [80]
    });

    useEffect(() => {
        async function loadLimits() {
            if (!selectedProject) return;
            setLoading(true);
            const res = await getProjectLimitsAction(selectedProject.project_id);
            if (res.success && res.data) {
                setLimits({
                    custom_row_limit: res.data.custom_row_limit?.toString() || '',
                    custom_api_limit: res.data.custom_api_limit?.toString() || '',
                    custom_request_limit: res.data.custom_request_limit?.toString() || '',
                    alert_email: res.data.alert_email || '',
                    alert_threshold_percent: [res.data.alert_threshold_percent || 80]
                });
            }
            setLoading(false);
        }
        loadLimits();
    }, [selectedProject]);

    const handleSave = async () => {
        if (!selectedProject) return;
        setSaving(true);
        
        const payload = {
            custom_row_limit: limits.custom_row_limit === '' ? null : parseInt(limits.custom_row_limit, 10),
            custom_api_limit: limits.custom_api_limit === '' ? null : parseInt(limits.custom_api_limit, 10),
            custom_request_limit: limits.custom_request_limit === '' ? null : parseInt(limits.custom_request_limit, 10),
            alert_email: limits.alert_email || null,
            alert_threshold_percent: limits.alert_threshold_percent[0]
        };

        const res = await updateProjectLimitsAction(selectedProject.project_id, payload);
        
        if (res.success) {
            toast({ title: 'Success', description: 'Resource limits updated successfully.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: res.error || 'Failed to update limits.' });
        }
        setSaving(false);
    };

    if (loading) return <div className="space-y-6"><Skeleton className="h-[400px] w-full" /></div>;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Resource Limits</CardTitle>
                            <CardDescription>Configure custom quotas for this project to prevent unexpected usage.</CardDescription>
                        </div>
                        <ShieldAlert className="h-8 w-8 text-primary opacity-50" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="row-limit">Total Rows Limit</Label>
                        <Input 
                            id="row-limit" 
                            type="number" 
                            placeholder="Leave blank for plan default" 
                            value={limits.custom_row_limit}
                            onChange={(e) => setLimits(prev => ({ ...prev, custom_row_limit: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Maximum number of rows allowed across all tables.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="api-limit">API & Query Execution Limit</Label>
                        <Input 
                            id="api-limit" 
                            type="number" 
                            placeholder="Leave blank for plan default" 
                            value={limits.custom_api_limit}
                            onChange={(e) => setLimits(prev => ({ ...prev, custom_api_limit: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Maximum data mutations and SQL executions allowed.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="request-limit">Total Requests Limit</Label>
                        <Input 
                            id="request-limit" 
                            type="number" 
                            placeholder="Leave blank for plan default" 
                            value={limits.custom_request_limit}
                            onChange={(e) => setLimits(prev => ({ ...prev, custom_request_limit: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Maximum overall HTTP requests the API will accept.</p>
                    </div>

                    <div className="border-t pt-6 mt-6">
                        <h4 className="font-semibold mb-4">Email Alerts</h4>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="alert-email">Notification Email</Label>
                                <Input 
                                    id="alert-email" 
                                    type="email" 
                                    placeholder="alerts@yourdomain.com" 
                                    value={limits.alert_email}
                                    onChange={(e) => setLimits(prev => ({ ...prev, alert_email: e.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground">Email address to notify when resources approach the configured limit.</p>
                            </div>

                            <div className="space-y-4 pt-2">
                                <Label>Warning Threshold ({limits.alert_threshold_percent}%)</Label>
                                <Slider
                                    value={limits.alert_threshold_percent}
                                    onValueChange={(val) => setLimits(prev => ({ ...prev, alert_threshold_percent: val }))}
                                    max={100}
                                    step={5}
                                    className="w-full"
                                />
                                <p className="text-xs text-muted-foreground">Send a warning email when usage hits this percentage of the hard limit.</p>
                            </div>
                        </div>
                    </div>

                </CardContent>
                <CardFooter className="flex justify-between items-center bg-card/50 backdrop-blur border-t px-6 py-4">
                    <p className="text-xs text-muted-foreground">All limits are scoped specifically to <b>{selectedProject?.display_name}</b>.</p>
                    <Button onClick={handleSave} disabled={saving || !selectedProject}>
                        {saving ? 'Saving...' : 'Save Limits'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
