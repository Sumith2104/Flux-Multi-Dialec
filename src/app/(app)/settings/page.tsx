'use client';

import { useState, useContext, useEffect } from 'react';
import Image from 'next/image';
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
import { Checkbox } from "@/components/ui/checkbox";
import { deleteProjectAction, clearOrganizationAction, updateProjectSettingsAction, toggleOrganizationSuspensionAction, toggleProjectSuspensionAction } from './actions';
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
    Copy, Check, Shield, Clock, Table as TableIcon,
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
import { WebhooksManager } from '@/components/settings/webhooks-manager';
import { PaymentsBillsManager } from '@/components/settings/payments-bills-manager';
import { PaygMeterCard } from '@/components/billing/payg-meter-card';
import { cn } from "@/lib/utils";

const timezones = Intl.supportedValuesOf('timeZone');

function CopyableField({ label, value }: { label: string, value: string }) {
    const { toast } = useToast();
    const [hasCopied, setHasCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(value).catch(() => {});
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
    const { project: selectedProject, setProject, setIsSuspended } = useContext(ProjectContext);
    const { toast } = useToast();
    const router = useRouter();

    // State
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [deleteAckChecked, setDeleteAckChecked] = useState(false);
    const [isDeletingProject, setIsDeletingProject] = useState(false);

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
    const [suspendOrgAckChecked, setSuspendOrgAckChecked] = useState(false);
    const [isSuspending, setIsSuspending] = useState(false);

    // Project suspension state
    const [suspendProjectAckChecked, setSuspendProjectAckChecked] = useState(false);
    const [isTogglingProjectSuspension, setIsTogglingProjectSuspension] = useState(false);

    // Clear Org State
    const [clearOrgConfirmation, setClearOrgConfirmation] = useState('');
    const [clearOrgAckChecked, setClearOrgAckChecked] = useState(false);
    const [isClearingOrg, setIsClearingOrg] = useState(false);
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
                setIs2faEnabled(res.enabled ?? false);
                setHas2faSecret(res.hasSecret ?? false);
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

        const validMatches = [
            `delete my project ${selectedProject.display_name.toLowerCase()}`,
            `delete ${selectedProject.display_name.toLowerCase()}`,
            selectedProject.display_name.toLowerCase(),
            selectedProject.project_id.toLowerCase()
        ];

        const trimmedInput = deleteConfirmation.trim().toLowerCase();
        if (!validMatches.includes(trimmedInput) && !deleteAckChecked) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please complete the confirmation.' });
            return;
        }

        setIsDeletingProject(true);
        try {
            const result = await deleteProjectAction(selectedProject.project_id);
            if (result.success) {
                toast({ title: 'Project Deleted', description: `Project '${selectedProject.display_name}' has been deleted.` });
                setProject(null);
                setDeleteConfirmation('');
                setDeleteAckChecked(false);
                window.dispatchEvent(new CustomEvent('flux:project-change', { detail: { project: null } }));
                router.push('/dashboard/projects');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete project.' });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Failed to delete project.' });
        } finally {
            setIsDeletingProject(false);
        }
    };

    const handleClearOrganization = async () => {
        setIsClearingOrg(true);
        try {
            const result = await clearOrganizationAction();
            if (result.success) {
                toast({ title: 'Success', description: 'Your organization data has been cleared.' });
                await logoutAction();
                router.push('/');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to clear organization data.' });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Failed to clear organization.' });
        } finally {
            setIsClearingOrg(false);
        }
    };

    const handleToggleSuspension = async () => {
        setIsSuspending(true);
        try {
            const newStatus = userPlan.status === 'suspended' ? 'active' : 'suspended';
            const result = await toggleOrganizationSuspensionAction(newStatus);

            if (result.success) {
                toast({ title: 'Success', description: `Organization has been ${newStatus}.` });
                setUserPlan(prev => ({ ...prev, status: newStatus }));
                setIsSuspended(newStatus === 'suspended');
                setSuspendConfirmation('');
                setSuspendOrgAckChecked(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to ${newStatus} organization.` });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'Failed to update organization status.' });
        } finally {
            setIsSuspending(false);
        }
    };

    const handleToggleProjectSuspension = async (projectId: string, currentStatus: string) => {
        setIsTogglingProjectSuspension(true);
        try {
            const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
            const res = await toggleProjectSuspensionAction(projectId, newStatus as 'active' | 'suspended');
            
            if (res.success) {
                toast({ title: "Status Updated", description: `Project is now ${newStatus}.` });

                if (selectedProject?.project_id === projectId) {
                    setProject({ ...selectedProject, status: newStatus as 'active' | 'suspended' });
                }
                setSuspendProjectAckChecked(false);
            } else {
                toast({ variant: "destructive", title: "Error", description: res.error });
            }
        } catch (err: any) {
            toast({ variant: "destructive", title: "Error", description: err.message || 'Failed to update project status.' });
        } finally {
            setIsTogglingProjectSuspension(false);
        }
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
                toast({ variant: 'destructive', title: 'QR Error', description: 'Could not generate 2FA QR code. Try again.' });
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
                    handler: function () {
                        toast({ title: "Payment Successful", description: "Your subscription has been updated." });
                        getUserPlanAction().then(res => {
                            setUserPlan(res);
                            setIsBillingLoading(false);
                        });
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('flux:projects-refresh'));
                        }
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
                            <Shield className="h-5 w-5 text-muted-foreground" />
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
                            <Clock className="h-5 w-5 text-muted-foreground" />
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
                    <CardFooter className="flex justify-end border-t px-6 py-4">
                        <Button onClick={handleSaveTimezone} disabled={savingTimezone || !selectedProject || selectedProject.role !== 'admin'}>
                            {savingTimezone ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                            Save Timezone
                        </Button>
                    </CardFooter>
                </Card>

                {/* Live Webhooks Section */}
                {selectedProject && (
                    <div className="lg:col-span-2">
                        <WebhooksManager projectId={selectedProject.project_id} tables={tables} />
                    </div>
                )}

                {/* 2FA Section */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5 text-muted-foreground" />
                            Account Security
                        </CardTitle>
                        <CardDescription>Secure your account with Two-Factor Authentication (TOTP).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {is2faLoading ? (
                            <div className="flex items-center justify-between p-4 bg-secondary/30 border border-border/60 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="space-y-1.5">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                </div>
                                <Skeleton className="h-8 w-20 rounded" />
                            </div>
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
                                    <AlertDialogContent className="bg-card border-border">
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

                                <div className="flex items-start gap-3 p-4 bg-secondary/70 border rounded-lg">
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
                                                    <div className="p-3 bg-white rounded-lg shadow-inner shadow-black/20">
                                                        <Image src={qrCodeDataUrl} alt="2FA QR Code" width={192} height={192} className="block" unoptimized />
                                                    </div>
                                                ) : (
                                                    <div className="w-48 h-48 bg-muted animate-pulse rounded-lg" />
                                                )}

                                                <div className="w-full space-y-2">
                                                    <p className="text-[10px] text-muted-foreground text-center px-4">
                                                        Scan with Google Authenticator, Authy, or any TOTP app.
                                                    </p>
                                                    <div className="flex items-center justify-between text-xs p-2 bg-secondary rounded border border-border">
                                                        <span className="text-muted-foreground truncate mr-2">Secret: <span className="text-foreground font-mono">{setupData.secret}</span></span>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => {
                                                            navigator.clipboard.writeText(setupData.secret).catch(() => {});
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

                {/* 28-Day Pay-As-You-Go Resource Meter */}
                {selectedProject && (
                    <div className="lg:col-span-2">
                        <PaygMeterCard projectId={selectedProject.project_id} />
                    </div>
                )}

                {/* Billing & Subscription Section */}
                <div className="lg:col-span-2">
                    <PaymentsBillsManager />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TableIcon className="h-5 w-5 text-muted-foreground" />
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
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <Skeleton key={i} className="h-12 w-full rounded-lg" />
                            ))}
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

            {(!selectedProject?.role || selectedProject?.role === 'admin' || selectedProject?.role === 'owner') && (
                <Card className="border-destructive/50 bg-destructive/5 rounded-none">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* 1. DELETE THIS PROJECT */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-none border border-border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="delete-project" className="font-semibold text-foreground">Delete this Project</Label>
                                <p className="text-sm text-muted-foreground">
                                    This will permanently delete the '{selectedProject?.display_name || 'selected'}' project, including all its tables and data.
                                </p>
                            </div>
                            <AlertDialog onOpenChange={(open) => {
                                if (!open) {
                                    setDeleteConfirmation('');
                                    setDeleteAckChecked(false);
                                }
                            }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={!selectedProject} className="rounded-none shrink-0 font-medium">
                                        Delete Project
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-border rounded-none max-w-lg">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold">
                                            <AlertTriangle className="h-5 w-5" />
                                            Confirm Project Deletion
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs text-muted-foreground">
                                            This action is permanent and immediate. The database schema, all tables, rows, relations, and credentials for{' '}
                                            <strong className="text-foreground">{selectedProject?.display_name}</strong> will be purged.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <div className="space-y-3 py-2">
                                        <div className="p-2.5 rounded-none bg-destructive/10 border border-destructive/25 text-[11px] text-destructive-foreground font-mono space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Project:</span>
                                                <span className="font-bold text-foreground">{selectedProject?.display_name}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Project ID:</span>
                                                <span>{selectedProject?.project_id}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Target Schema:</span>
                                                <span>{(selectedProject as any)?.schema_name || `flux_tenant_${selectedProject?.project_id}`}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-start space-x-2.5 pt-1">
                                            <Checkbox
                                                id="ack-delete-project"
                                                checked={deleteAckChecked}
                                                onCheckedChange={(c) => setDeleteAckChecked(!!c)}
                                                className="mt-0.5 rounded-none"
                                            />
                                            <label htmlFor="ack-delete-project" className="text-xs text-muted-foreground cursor-pointer select-none leading-tight">
                                                I understand that all tables, rows, and schema data will be permanently purged and cannot be recovered.
                                            </label>
                                        </div>

                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">
                                                    Type <strong className="text-foreground font-mono">{selectedProject?.display_name}</strong>:
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDeleteConfirmation(selectedProject?.display_name || '');
                                                        setDeleteAckChecked(true);
                                                    }}
                                                    className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 underline cursor-pointer flex items-center gap-1 font-semibold"
                                                >
                                                    <Sparkles className="h-3 w-3" /> Quick-Fill & Confirm
                                                </button>
                                            </div>
                                            <Input
                                                id="delete-confirm"
                                                value={deleteConfirmation}
                                                onChange={(e) => setDeleteConfirmation(e.target.value)}
                                                placeholder={selectedProject?.display_name}
                                                className="font-mono bg-secondary/70 border-border rounded-none text-xs h-9 focus-visible:ring-destructive/50"
                                            />
                                        </div>
                                    </div>

                                    <AlertDialogFooter className="pt-2">
                                        <AlertDialogCancel disabled={isDeletingProject} className="rounded-none text-xs border-border">Cancel</AlertDialogCancel>
                                        <Button
                                            onClick={handleDeleteProject}
                                            disabled={
                                                !deleteAckChecked ||
                                                isDeletingProject ||
                                                !(
                                                    deleteConfirmation.trim().toLowerCase() === (selectedProject?.display_name || '').toLowerCase() ||
                                                    deleteConfirmation.trim().toLowerCase() === `delete ${(selectedProject?.display_name || '').toLowerCase()}` ||
                                                    deleteConfirmation.trim().toLowerCase() === `delete my project ${(selectedProject?.display_name || '').toLowerCase()}` ||
                                                    deleteConfirmation.trim().toLowerCase() === (selectedProject?.project_id || '').toLowerCase()
                                                )
                                            }
                                            className="rounded-none text-xs bg-destructive hover:bg-destructive/90 text-white font-semibold"
                                        >
                                            {isDeletingProject ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                    Deleting Project...
                                                </>
                                            ) : (
                                                'Delete Project'
                                            )}
                                        </Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                        {/* 2. SUSPEND / RESUME PROJECT */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-none border border-border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="suspend-project" className="font-semibold text-foreground">{selectedProject?.status === 'suspended' ? 'Resume Project' : 'Suspend Project'}</Label>
                                <p className="text-sm text-muted-foreground">
                                    {selectedProject?.status === 'suspended'
                                        ? `Re-enable database access and API operations for '${selectedProject?.display_name}'.`
                                        : `Temporarily pause all database access for the '${selectedProject?.display_name}' project specifically.`}
                                </p>
                            </div>
                            <AlertDialog onOpenChange={(open) => !open && setSuspendProjectAckChecked(false)}>
                                <AlertDialogTrigger asChild>
                                    <Button variant={selectedProject?.status === 'suspended' ? "default" : "destructive"} disabled={!selectedProject || isTogglingProjectSuspension} className="rounded-none shrink-0 font-medium">
                                        {selectedProject?.status === 'suspended' ? 'Resume Project' : 'Suspend Project'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-border rounded-none max-w-lg">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2">
                                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                                            {selectedProject?.status === 'suspended' ? 'Resume Database Access' : 'Suspend Database Access'}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs text-muted-foreground">
                                            {selectedProject?.status === 'suspended'
                                                ? `This will immediately restore queries and API traffic for project '${selectedProject?.display_name}'.`
                                                : `This will reject all incoming queries and API calls for project '${selectedProject?.display_name}'. Data will not be deleted.`}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <div className="space-y-2 py-2">
                                        <div className="flex items-start space-x-2.5">
                                            <Checkbox
                                                id="ack-suspend-project"
                                                checked={suspendProjectAckChecked}
                                                onCheckedChange={(c) => setSuspendProjectAckChecked(!!c)}
                                                className="mt-0.5 rounded-none"
                                            />
                                            <label htmlFor="ack-suspend-project" className="text-xs text-muted-foreground cursor-pointer select-none leading-tight">
                                                I confirm I want to {selectedProject?.status === 'suspended' ? 'resume database operations' : 'suspend query traffic for this project'}.
                                            </label>
                                        </div>
                                    </div>

                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isTogglingProjectSuspension} className="rounded-none text-xs border-border">Cancel</AlertDialogCancel>
                                        <Button
                                            onClick={() => handleToggleProjectSuspension(selectedProject!.project_id, selectedProject!.status || 'active')}
                                            disabled={!suspendProjectAckChecked || isTogglingProjectSuspension}
                                            className={cn("rounded-none text-xs font-semibold", selectedProject?.status === 'suspended' ? "bg-primary" : "bg-destructive hover:bg-destructive/90")}
                                        >
                                            {isTogglingProjectSuspension ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Updating...</> : 'Confirm'}
                                        </Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                        {/* 3. SUSPEND / RESUME ORGANIZATION */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-none border border-border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="suspend-org" className="font-semibold text-foreground">{userPlan.status === 'suspended' ? 'Resume Organization' : 'Suspend Organization'}</Label>
                                <p className="text-sm text-muted-foreground">
                                    {userPlan.status === 'suspended'
                                        ? 'Re-enable database access and background webhooks.'
                                        : 'Temporarily pause all database read/write access and disable webhook operations without deleting data.'}
                                </p>
                            </div>
                            <AlertDialog onOpenChange={(open) => {
                                if (!open) {
                                    setSuspendConfirmation('');
                                    setSuspendOrgAckChecked(false);
                                }
                            }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant={userPlan.status === 'suspended' ? "default" : "destructive"} disabled={isSuspending} className="rounded-none shrink-0 font-medium">
                                        {userPlan.status === 'suspended' ? 'Resume Organization' : 'Suspend Organization'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-border rounded-none max-w-lg">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2">
                                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                                            {userPlan.status === 'suspended' ? 'Resume Entire Organization' : 'Suspend Entire Organization'}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs text-muted-foreground">
                                            {userPlan.status === 'suspended'
                                                ? 'This will immediately re-enable database operations and webhooks across all projects.'
                                                : 'This will pause all database read/write queries and webhooks across all your organization projects.'}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <div className="space-y-3 py-2">
                                        <div className="flex items-start space-x-2.5">
                                            <Checkbox
                                                id="ack-suspend-org"
                                                checked={suspendOrgAckChecked}
                                                onCheckedChange={(c) => setSuspendOrgAckChecked(!!c)}
                                                className="mt-0.5 rounded-none"
                                            />
                                            <label htmlFor="ack-suspend-org" className="text-xs text-muted-foreground cursor-pointer select-none leading-tight">
                                                I understand this halts database access across all projects in my account.
                                            </label>
                                        </div>

                                        {userPlan.status !== 'suspended' && (
                                            <div className="space-y-1.5 pt-1">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Type <strong className="text-foreground font-mono">suspend my org</strong>:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSuspendConfirmation('suspend my org');
                                                            setSuspendOrgAckChecked(true);
                                                        }}
                                                        className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 underline cursor-pointer flex items-center gap-1 font-semibold"
                                                    >
                                                        <Sparkles className="h-3 w-3" /> Quick-Fill & Confirm
                                                    </button>
                                                </div>
                                                <Input
                                                    value={suspendConfirmation}
                                                    onChange={(e) => setSuspendConfirmation(e.target.value)}
                                                    placeholder="suspend my org"
                                                    className="font-mono bg-secondary/70 border-border rounded-none text-xs h-9 focus-visible:ring-destructive/50"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isSuspending} className="rounded-none text-xs border-border">Cancel</AlertDialogCancel>
                                        <Button
                                            onClick={handleToggleSuspension}
                                            disabled={
                                                (userPlan.status !== 'suspended' && (!suspendOrgAckChecked || suspendConfirmation.trim().toLowerCase() !== 'suspend my org')) ||
                                                isSuspending
                                            }
                                            className={cn("rounded-none text-xs font-semibold", userPlan.status === 'suspended' ? "bg-primary" : "bg-destructive hover:bg-destructive/90")}
                                        >
                                            {isSuspending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Updating...</> : 'Confirm'}
                                        </Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                        {/* 4. CLEAR ORGANIZATION */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-none border border-border bg-background p-4 gap-4">
                            <div>
                                <Label htmlFor="clear-org" className="font-semibold text-foreground">Clear Organization</Label>
                                <p className="text-sm text-muted-foreground">This will permanently delete all projects and data associated with your account.</p>
                            </div>
                            <AlertDialog onOpenChange={(open) => {
                                if (!open) {
                                    setClearOrgConfirmation('');
                                    setClearOrgAckChecked(false);
                                }
                            }}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={isClearingOrg} className="rounded-none shrink-0 font-medium">Clear Organization Data</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-border rounded-none max-w-lg">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold">
                                            <AlertTriangle className="h-5 w-5" />
                                            Clear Organization & Account
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs text-muted-foreground">
                                            This is your final confirmation. This action will permanently delete your entire account, all projects, schemas, tables, and settings.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>

                                    <div className="space-y-3 py-2">
                                        <div className="p-2.5 rounded-none bg-destructive/10 border border-destructive/25 text-[11px] text-destructive-foreground font-mono">
                                            WARNING: All databases across all projects will be purged. You will be immediately logged out.
                                        </div>

                                        <div className="flex items-start space-x-2.5">
                                            <Checkbox
                                                id="ack-clear-org"
                                                checked={clearOrgAckChecked}
                                                onCheckedChange={(c) => setClearOrgAckChecked(!!c)}
                                                className="mt-0.5 rounded-none"
                                            />
                                            <label htmlFor="ack-clear-org" className="text-xs text-muted-foreground cursor-pointer select-none leading-tight">
                                                I acknowledge that all my projects, databases, and account credentials will be permanently destroyed.
                                            </label>
                                        </div>

                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Type <strong className="text-foreground font-mono">CLEAR ALL DATA</strong>:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setClearOrgConfirmation('CLEAR ALL DATA');
                                                        setClearOrgAckChecked(true);
                                                    }}
                                                    className="text-[11px] font-mono text-destructive hover:text-destructive/80 underline cursor-pointer flex items-center gap-1 font-semibold"
                                                >
                                                    <Sparkles className="h-3 w-3" /> Quick-Fill & Confirm
                                                </button>
                                            </div>
                                            <Input
                                                value={clearOrgConfirmation}
                                                onChange={(e) => setClearOrgConfirmation(e.target.value)}
                                                placeholder="CLEAR ALL DATA"
                                                className="font-mono bg-secondary/70 border-border rounded-none text-xs h-9 focus-visible:ring-destructive/50"
                                            />
                                        </div>
                                    </div>

                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isClearingOrg} className="rounded-none text-xs border-border">Cancel</AlertDialogCancel>
                                        <Button
                                            onClick={handleClearOrganization}
                                            disabled={
                                                !clearOrgAckChecked ||
                                                isClearingOrg ||
                                                !(
                                                    clearOrgConfirmation.trim().toUpperCase() === 'CLEAR ALL DATA' ||
                                                    clearOrgConfirmation.trim().toLowerCase() === 'clear organization'
                                                )
                                            }
                                            className="rounded-none text-xs bg-destructive hover:bg-destructive/90 text-white font-semibold"
                                        >
                                            {isClearingOrg ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                    Deleting Everything...
                                                </>
                                            ) : (
                                                'I understand, delete everything'
                                            )}
                                        </Button>
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

