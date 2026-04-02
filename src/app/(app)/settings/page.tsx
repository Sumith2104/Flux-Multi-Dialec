'use client';

import { useState, useContext, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { deleteProjectAction, clearOrganizationAction, updateProjectSettingsAction, toggleOrganizationSuspensionAction } from './actions';
import { 
    get2FAStatusAction, 
    setup2FAAction, 
    verifyAndEnable2FAAction, 
    disable2FAAction 
} from './2fa-actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { logoutAction } from '../actions';
import { 
    Copy, Check, Shield, Globe, Clock, Table as TableIcon, 
    Key, Loader2, AlertTriangle, Database, ChevronRight
} from "lucide-react";
import { 
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
    CreditCard, Zap, Sparkles, Building2, HelpCircle 
} from "lucide-react";
import { getTablesForProject, Table as DbTable } from '@/lib/data';
import { getUserPlanAction } from './billing-actions';
import { Skeleton } from '@/components/ui/skeleton';

const timezones = Intl.supportedValuesOf('timeZone');

function CopyableField({ label, value }: { label: string, value: string }) {
    const { toast } = useToast();
    const [hasCopied, setHasCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(value);
        setHasCopied(true);
        toast({ title: "Copied!", description: `${label} has been copied to your clipboard.` });
        setTimeout(() => setHasCopied(false), 2000);
    };

    return (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
                <span className="font-mono text-sm text-foreground break-all pr-4">{value}</span>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={copyToClipboard}>
                {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
        </div>
    )
}

export default function GeneralSettingsPage() {
    const { project: selectedProject, setProject } = useContext(ProjectContext);
    const { toast } = useToast();
    const router = useRouter();
    
    // State
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [timezone, setTimezone] = useState(selectedProject?.timezone || 'UTC');
    const [savingTimezone, setSavingTimezone] = useState(false);
    const [tables, setTables] = useState<DbTable[]>([]);
    const [loadingTables, setLoadingTables] = useState(false);

    // 2FA State
    const [is2faEnabled, setIs2faEnabled] = useState(false);
    const [has2faSecret, setHas2faSecret] = useState(false);
    const [is2faLoading, setIs2faLoading] = useState(true);
    const [isSettingUp2fa, setIsSettingUp2fa] = useState(false);
    const [setupData, setSetupData] = useState<{ secret: string; qrUrl: string } | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

    // Billing State
    const [userPlan, setUserPlan] = useState<{ plan: string; billing_cycle_end: string | null; status?: string }>({ plan: 'free', billing_cycle_end: null, status: 'active' });
    const [isBillingLoading, setIsBillingLoading] = useState(true);
    const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

    // Suspension State
    const [suspendConfirmation, setSuspendConfirmation] = useState('');
    const [isSuspending, setIsSuspending] = useState(false);

    useEffect(() => {
        // Load User Plan
        getUserPlanAction().then(res => {
            setUserPlan(res);
            setIsBillingLoading(false);
        });
    }, []);

    useEffect(() => {
        if (selectedProject) {
            setTimezone(selectedProject.timezone || 'UTC');
            
            setLoadingTables(true);
            getTablesForProject(selectedProject.project_id)
                .then(setTables)
                .finally(() => setLoadingTables(false));
            
            // Check 2FA Status
            get2FAStatusAction().then(res => {
                setIs2faEnabled(res.enabled);
                setHas2faSecret(res.hasSecret);
                setIs2faLoading(false);
            });
        }
    }, [selectedProject]);

    const handleSaveTimezone = async () => {
        if (!selectedProject) return;
        setSavingTimezone(true);
        const res = await updateProjectSettingsAction(selectedProject.project_id, timezone);
        setSavingTimezone(false);

        if (res.success) {
            toast({ title: "Settings Saved", description: "Project timezone updated successfully." });
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error });
        }
    };

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
            setProject(null); 
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
            await logoutAction();
            router.push('/');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to clear organization data.' });
        }
    };

    const handleToggleSuspension = async () => {
        setIsSuspending(true);
        const newStatus = userPlan.status === 'suspended' ? 'active' : 'suspended';
        const result = await toggleOrganizationSuspensionAction(newStatus);
        
        if (result.success) {
            toast({ title: 'Success', description: `Organization has been ${newStatus}.` });
            setUserPlan(prev => ({ ...prev, status: newStatus }));
            setSuspendConfirmation('');
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to ${newStatus} organization.` });
        }
        setIsSuspending(false);
    };

    const handleSetup2FA = async () => {
        setIsSettingUp2fa(true);
        const res = await setup2FAAction();
        if (res.success && res.secret && res.qrUrl) {
            setSetupData({ secret: res.secret, qrUrl: res.qrUrl });
            try {
                const dataUrl = await QRCode.toDataURL(res.qrUrl);
                setQrCodeDataUrl(dataUrl);
            } catch (err) {
                console.error('Failed to generate QR code:', err);
            }
        } else {
            toast({ variant: 'destructive', title: 'Error', description: res.error || 'Failed to initialize 2FA setup' });
        }
        setIsSettingUp2fa(false);
    };

    const handleVerifyAndEnable2FA = async () => {
        setIsVerifying(true);
        const res = await verifyAndEnable2FAAction(verificationCode);
        setIsVerifying(false);
        
        if (res.success) {
            setIs2faEnabled(true);
            setSetupData(null);
            setVerificationCode('');
            toast({ title: '2FA Enabled', description: 'Your account is now protected with Two-Factor Authentication.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: res.error });
        }
    };

    const handleDisable2FA = async () => {
        setIsVerifying(true);
        const res = await disable2FAAction(verificationCode);
        setIsVerifying(false);
        
        if (res.success) {
            setIs2faEnabled(false);
            setVerificationCode('');
            toast({ title: '2FA Disabled', description: 'Two-Factor Authentication has been removed from your account.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: res.error });
        }
    };

    const handleUpgradePlan = async (planType: string) => {
        if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
            toast({ variant: 'destructive', title: 'Error', description: 'Razorpay Key ID is not configured.' });
            return;
        }

        setUpgradingPlan(planType);
        
        try {
            // Map plan display names to IDs
            const planToIdMap: Record<string, string | undefined> = {
                'pro': process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID,
                'max': process.env.NEXT_PUBLIC_RAZORPAY_MAX_PLAN_ID
            };

            const targetPlanId = planToIdMap[planType.toLowerCase()];
            if (!targetPlanId) throw new Error('Invalid plan selected');

            const response = await fetch('/api/subscriptions/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: targetPlanId })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            // Dynamically load Razorpay
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.onload = () => {
                const options = {
                    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                    subscription_id: data.subscriptionId,
                    name: 'Fluxbase Subscription',
                    description: `Upgrade to ${planType} plan`,
                    image: '/logo.png', // Fallback or placeholder
                    theme: { color: '#ef4444' }, // Premium red
                    handler: function (response: any) {
                        toast({ title: "Processing Payment...", description: "Your upgrade is being verified." });
                        window.location.reload();
                    }
                };
                const rzp = new (window as any).Razorpay(options);
                rzp.open();
            };
            document.head.appendChild(script);

        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Checkout Failed', description: err.message });
        } finally {
            setUpgradingPlan(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" />
                            Project Identity
                        </CardTitle>
                        <CardDescription>Essential identification for API and database access.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="project-name">Project Display Name</Label>
                            <Input id="project-name" value={selectedProject?.display_name || ''} disabled className="bg-muted/50" />
                        </div>
                        {selectedProject && (
                            <CopyableField label="Project ID" value={selectedProject.project_id} />
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            Regional Settings
                        </CardTitle>
                        <CardDescription>Configure localization for database operations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="timezone">Database Timezone</Label>
                            <Select value={timezone} onValueChange={setTimezone} disabled={!selectedProject || selectedProject.role !== 'admin'}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a timezone" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {timezones.map(tz => (
                                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">Default timezone for generated timestamps (e.g., NOW()).</p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end border-t bg-muted/50 px-6 py-4">
                        <Button onClick={handleSaveTimezone} disabled={savingTimezone || !selectedProject || selectedProject.role !== 'admin'}>
                            {savingTimezone ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                            Save Timezone
                        </Button>
                    </CardFooter>
                </Card>

                {/* 2FA Section */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5 text-primary" />
                            Account Security
                        </CardTitle>
                        <CardDescription>Secure your account with Two-Factor Authentication (TOTP).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {is2faLoading ? (
                            <Skeleton className="h-20 w-full" />
                        ) : is2faEnabled ? (
                            <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-500/20 rounded-full">
                                        <Shield className="h-5 w-5 text-green-500" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-green-500">2FA is currently active</p>
                                        <p className="text-xs text-muted-foreground">Your account is using TOTP protection.</p>
                                    </div>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="border-red-500/50 text-red-500 hover:bg-red-500/10">Disable</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Enter your 6-digit code to confirm you want to disable 2FA. This will make your account less secure.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div className="py-4">
                                            <Input
                                                type="text"
                                                placeholder="000000"
                                                maxLength={6}
                                                className="text-center text-2xl tracking-[0.5em] font-mono"
                                                value={verificationCode}
                                                onChange={(e) => setVerificationCode(e.target.value)}
                                            />
                                        </div>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setVerificationCode('')}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDisable2FA} disabled={verificationCode.length !== 6 || isVerifying}>
                                                {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Disable"}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {!is2faEnabled && has2faSecret && !setupData && (
                                    <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg mb-4">
                                        <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="font-semibold text-orange-500 text-sm">Setup Incomplete</p>
                                            <p className="text-xs text-muted-foreground mb-3">You generated a 2FA secret but never verified it. Your account is NOT protected yet.</p>
                                            <Button size="sm" variant="outline" className="h-8 border-orange-500/50 text-orange-500 hover:bg-orange-500/10" onClick={handleSetup2FA}>
                                                Complete Setup
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="flex items-start gap-3 p-4 bg-zinc-900/50 border rounded-lg">
                                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-medium text-sm">2FA is not enabled</p>
                                        <p className="text-xs text-muted-foreground">Add an extra layer of security to your organization by requiring a verification code from your mobile device.</p>
                                    </div>
                                </div>
                                
                                {setupData ? (
                                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                                        <div className="space-y-3">
                                            <Label className="text-xs uppercase font-bold text-muted-foreground">Step 1: Scan this QR Code</Label>
                                            
                                            <div className="flex flex-col items-center gap-4 py-2">
                                                {qrCodeDataUrl ? (
                                                    <div className="p-3 bg-white rounded-xl shadow-inner shadow-black/20">
                                                        <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-48 h-48 block" />
                                                    </div>
                                                ) : (
                                                    <div className="w-48 h-48 bg-zinc-800 animate-pulse rounded-xl" />
                                                )}
                                                
                                                <div className="w-full space-y-2">
                                                    <p className="text-[10px] text-muted-foreground text-center px-4">
                                                        Scan with Google Authenticator, Authy, or any TOTP app.
                                                    </p>
                                                    <div className="flex items-center justify-between text-xs p-2 bg-zinc-900 rounded border border-zinc-800">
                                                        <span className="text-muted-foreground truncate mr-2">Secret: <span className="text-foreground font-mono">{setupData.secret}</span></span>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => {
                                                            navigator.clipboard.writeText(setupData.secret);
                                                            toast({ title: "Copied secret" });
                                                        }}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs uppercase font-bold text-muted-foreground">Step 2: Enter Verification Code</Label>
                                            <Input
                                                type="text"
                                                placeholder="000000"
                                                maxLength={6}
                                                className="text-center tracking-[0.5em] font-mono text-xl"
                                                value={verificationCode}
                                                onChange={(e) => setVerificationCode(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button className="flex-1" onClick={handleVerifyAndEnable2FA} disabled={verificationCode.length !== 6 || isVerifying}>
                                                {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Enable"}
                                            </Button>
                                            <Button variant="ghost" onClick={() => setSetupData(null)}>Cancel</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button className="w-full" onClick={handleSetup2FA} disabled={isSettingUp2fa}>
                                        {isSettingUp2fa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                                        Configure Two-Factor Auth
                                    </Button>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Billing & Subscription Section */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-primary" />
                            Billing & Subscription
                        </CardTitle>
                        <CardDescription>Manage your plan and organization resource limits.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isBillingLoading ? (
                            <Skeleton className="h-24 w-full" />
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/10 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/20 rounded-xl">
                                            <Zap className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">Active Plan</p>
                                            <p className="text-xl font-black italic uppercase tracking-tighter text-foreground drop-shadow-sm">
                                                {userPlan.plan} Tier
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold px-3">
                                        Active
                                    </Badge>
                                </div>

                                {userPlan.plan.toLowerCase() === 'free' && (
                                    <div className="grid grid-cols-1 gap-3">
                                        <Button 
                                            variant="secondary" 
                                            className="h-14 rounded-2xl flex items-center justify-between px-6 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 group"
                                            onClick={() => handleUpgradePlan('pro')}
                                            disabled={!!upgradingPlan}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-500/20 rounded-lg group-hover:scale-110 transition-transform">
                                                    <Sparkles className="h-4 w-4" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-bold text-sm leading-none">Upgrade to Pro</p>
                                                    <p className="text-[10px] opacity-70 leading-none mt-1">$19 / Month</p>
                                                </div>
                                            </div>
                                            {upgradingPlan === 'pro' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                        </Button>

                                        <Button 
                                            className="h-14 rounded-2xl flex items-center justify-between px-6 bg-gradient-to-r from-primary to-rose-600 hover:opacity-90 group border-none shadow-lg shadow-primary/20"
                                            onClick={() => handleUpgradePlan('max')}
                                            disabled={!!upgradingPlan}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white/20 rounded-lg group-hover:scale-110 transition-transform">
                                                    <Building2 className="h-4 w-4 text-white" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-bold text-sm leading-none text-white">Upgrade to Max</p>
                                                    <p className="text-[10px] opacity-70 leading-none mt-1 text-white/90">$49 / Month</p>
                                                </div>
                                            </div>
                                            {upgradingPlan === 'max' ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <ChevronRight className="h-4 w-4 text-white" />}
                                        </Button>
                                    </div>
                                )}

                                {userPlan.billing_cycle_end && (
                                    <div className="flex items-center justify-center gap-2 p-2 bg-muted/30 rounded-xl">
                                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                        <p className="text-[10px] text-muted-foreground font-medium">
                                            Next renewal: <span className="text-foreground">{new Date(userPlan.billing_cycle_end).toLocaleDateString()}</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TableIcon className="h-5 w-5 text-primary" />
                        Project Tables
                    </CardTitle>
                    <CardDescription>Quick reference for table names in the current project.</CardDescription>
                </CardHeader>
                <CardContent>
                    {!selectedProject ? (
                        <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                            Please select a project to view its tables.
                        </div>
                    ) : loadingTables ? (
                        <div className="space-y-2">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ) : tables.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                            No tables found in this project.
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {tables.map(table => (
                                <CopyableField key={table.table_id} label={table.table_name} value={table.table_name} />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedProject?.role === 'admin' && (
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="delete-project">Delete this Project</Label>
                                <p className="text-sm text-muted-foreground">
                                    This will permanently delete the '{selectedProject?.display_name || ' selected'}' project, including all its tables and data.
                                </p>
                            </div>
                            <AlertDialog onOpenChange={(open) => !open && setDeleteConfirmation('')}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={!selectedProject}>Delete Project</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-zinc-950 border-zinc-800">
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
                                            className="font-mono bg-zinc-900 border-zinc-700"
                                        />
                                    </div>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700">Cancel</AlertDialogCancel>
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="suspend-org">{userPlan.status === 'suspended' ? 'Resume Organization' : 'Suspend Organization'}</Label>
                                <p className="text-sm text-muted-foreground">
                                    {userPlan.status === 'suspended' 
                                        ? 'Re-enable database access and background webhooks.' 
                                        : 'Temporarily pause all database read/write access and disable webhook operations without deleting data.'}
                                </p>
                            </div>
                            <AlertDialog onOpenChange={(open) => !open && setSuspendConfirmation('')}>
                                <AlertDialogTrigger asChild>
                                    <Button variant={userPlan.status === 'suspended' ? "default" : "destructive"} disabled={isSuspending}>
                                        {userPlan.status === 'suspended' ? 'Resume Organization' : (isSuspending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suspend Organization')}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {userPlan.status === 'suspended' 
                                                ? 'This will immediately re-enable your database and webhooks. You will be able to read and write data again.' 
                                                : <span>This will temporarily halt all queries, APIs, and webhooks for all your projects. To confirm, please type <strong className="text-foreground">suspend my org</strong> in the box below.</span>}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    {userPlan.status !== 'suspended' && (
                                        <div className="py-2">
                                            <Input
                                                value={suspendConfirmation}
                                                onChange={(e) => setSuspendConfirmation(e.target.value)}
                                                placeholder="suspend my org"
                                                className="font-mono bg-zinc-900 border-zinc-700"
                                            />
                                        </div>
                                    )}
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700">Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleToggleSuspension}
                                            disabled={userPlan.status !== 'suspended' && suspendConfirmation !== 'suspend my org'}
                                            className={userPlan.status === 'suspended' ? "bg-primary" : "bg-destructive hover:bg-destructive/90"}
                                        >
                                            Continue
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="clear-org">Clear Organization</Label>
                                <p className="text-sm text-muted-foreground">This will permanently delete all projects and data associated with your account.</p>
                            </div>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" >Clear Organization Data</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This is your final confirmation. This action will permanently delete your entire account, all projects, and all data. This cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleClearOrganization} className="bg-destructive hover:bg-destructive/90">I understand, delete everything</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
