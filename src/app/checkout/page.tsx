'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
    Check, 
    Copy, 
    Smartphone, 
    AlertCircle, 
    QrCode, 
    ShieldCheck, 
    ArrowLeft, 
    Loader2, 
    Sparkles, 
    Tag, 
    Database, 
    Server, 
    Cpu, 
    HardDrive, 
    ArrowRight 
} from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PendingProject {
    projectName: string;
    dialect: 'postgresql' | 'mysql';
    timezone?: string;
    userRole: string;
    billingPreference: string;
    companyName?: string;
    workDescription?: string;
}

function CheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();

    const paramSessionId = searchParams.get('sessionId');
    const paramPlan = searchParams.get('plan') || 'employee';

    // Step state: 'review' (Order & Coupon Review) vs 'payment' (Live UPI QR Gateway)
    const [viewStep, setViewStep] = useState<'review' | 'payment'>(paramSessionId ? 'payment' : 'review');
    const [sessionId, setSessionId] = useState<string | null>(paramSessionId);

    // Order & Coupon States
    const [pendingProject, setPendingProject] = useState<PendingProject | null>(null);
    const [selectedPlanKey, setSelectedPlanKey] = useState<string>(paramPlan.toLowerCase());
    const [couponCode, setCouponCode] = useState<string>('');
    const [isDiscountApplied, setIsDiscountApplied] = useState<boolean>(false);
    const [isApplyingCoupon, setIsApplyingCoupon] = useState<boolean>(false);
    const [pricingLoaded, setPricingLoaded] = useState<boolean>(false);

    // Pricing Configs from DB
    const [dbPromoCode, setDbPromoCode] = useState<string>('');
    const [enableDiscount, setEnableDiscount] = useState<boolean>(true);
    const [proPrice, setProPrice] = useState<number>(499);
    const [maxPrice, setMaxPrice] = useState<number>(1499);
    const [discountProPrice, setDiscountProPrice] = useState<number>(399);
    const [discountMaxPrice, setDiscountMaxPrice] = useState<number>(1199);

    // Live Payment Details States
    const [loadingPayment, setLoadingPayment] = useState<boolean>(false);
    const [amount, setAmount] = useState<number | null>(null);
    const [planType, setPlanType] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [status, setStatus] = useState<'pending' | 'completed' | 'expired' | null>(null);
    const [upiMerchantVpa, setUpiMerchantVpa] = useState<string>('918310870493@waaxis');

    // Live Flow States (3-minute timer)
    const [timeLeft, setTimeLeft] = useState<number>(180);
    const [cancelDialogOpen, setCancelDialogOpen] = useState<boolean>(false);
    const [isCancelling, setIsCancelling] = useState<boolean>(false);

    // 1. Read pending project payload from localStorage & load pricing configurations
    useEffect(() => {
        try {
            const raw = localStorage.getItem('pending_paid_project');
            if (raw) {
                const parsed = JSON.parse(raw);
                setPendingProject(parsed);
                if (parsed.billingPreference === 'pay_as_you_go' || paramPlan.toLowerCase() === 'pay_as_you_go') {
                    setSelectedPlanKey('pay_as_you_go');
                } else if (parsed.userRole === 'org_owner') {
                    setSelectedPlanKey('org_owner');
                } else if (parsed.userRole === 'employee') {
                    setSelectedPlanKey('employee');
                }
            } else if (paramPlan) {
                setSelectedPlanKey(paramPlan.toLowerCase());
            }
        } catch (e) {
            console.error('Error reading pending project from storage:', e);
        }

        const fetchPricingConfig = async () => {
            try {
                const res = await fetch('/api/payments/pricing-config');
                const data = await res.json();
                if (res.ok && data.success) {
                    const p = data.pricing;
                    setProPrice(p.proPrice || 499);
                    setMaxPrice(p.maxPrice || 1499);
                    setDiscountProPrice(p.discountProPrice || 399);
                    setDiscountMaxPrice(p.discountMaxPrice || 1199);
                    setDbPromoCode(p.discountCode || 'FLUX20');
                    setEnableDiscount(p.enableDiscount ?? true);
                    if (p.upiId) setUpiMerchantVpa(p.upiId);
                }
            } catch (err) {
                console.error('Failed to load pricing config:', err);
            } finally {
                setPricingLoaded(true);
            }
        };

        fetchPricingConfig();
    }, []);

    // Helper: Finalize payment success, provision pending project if in local storage, and redirect
    const handlePaymentSuccess = async () => {
        setStatus('completed');
        const pendingProjectJson = localStorage.getItem('pending_paid_project');
        if (pendingProjectJson) {
            try {
                const projData = JSON.parse(pendingProjectJson);
                const formData = new FormData();
                formData.append('projectName', projData.projectName);
                formData.append('dialect', projData.dialect);
                formData.append('timezone', projData.timezone || 'UTC');
                formData.append('userRole', projData.userRole);
                formData.append('billingPreference', projData.billingPreference || 'monthly');
                formData.append('companyName', projData.companyName || '');
                formData.append('workDescription', projData.workDescription || '');
                formData.append('connectionType', 'internal');

                const { createProjectAction } = await import('@/components/layout/actions');
                await createProjectAction(formData);
                toast({
                    title: 'Payment Verified & Project Provisioned!',
                    description: `Your ${projData.projectName} project is active and ready.`
                });
            } catch (e) {
                console.error('Error provisioning paid project:', e);
            } finally {
                localStorage.removeItem('pending_paid_project');
            }
        } else {
            toast({
                title: 'Upgrade Successful!',
                description: 'Payment verified successfully! Redirecting...'
            });
        }
        setTimeout(() => router.push('/dashboard/projects'), 1500);
    };

    // 2. Load payment session details if session ID is active
    useEffect(() => {
        if (!sessionId || viewStep !== 'payment') return;

        const fetchSessionDetails = async () => {
            try {
                const res = await fetch(`/api/payments/check-session?sessionId=${sessionId}`);
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to fetch session details');
                }
                setAmount(data.amount);
                setPlanType(data.planType);
                setExpiresAt(data.expiresAt);
                setStatus(data.status);
                if (data.upiId) setUpiMerchantVpa(data.upiId);

                // If already completed (e.g. after page refresh or background webhook), immediately succeed
                if (data.status === 'completed') {
                    handlePaymentSuccess();
                    return;
                }

                const expiry = new Date(data.expiresAt).getTime();
                const now = new Date().getTime();
                const secondsRemaining = Math.max(0, Math.floor((expiry - now) / 1000));
                setTimeLeft(secondsRemaining);
            } catch (err: any) {
                toast({
                    variant: 'destructive',
                    title: 'Session Error',
                    description: err.message
                });
            }
        };

        fetchSessionDetails();
    }, [sessionId, viewStep, toast]);

    // 3. Live countdown & High-Frequency Realtime Polling for Payment Verification
    useEffect(() => {
        if (viewStep !== 'payment' || !sessionId || !expiresAt || status !== 'pending') return;

        // Timer countdown
        const timer = setInterval(() => {
            const expiry = new Date(expiresAt).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, Math.floor((expiry - now) / 1000));
            setTimeLeft(diff);

            if (diff === 0) {
                setStatus('expired');
                clearInterval(timer);
            }
        }, 1000);

        // High-frequency fast polling (every 1.5s) for instant unlock
        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/payments/check-session?sessionId=${sessionId}`);
                const data = await res.json();
                if (res.ok && data.success) {
                    if (data.status === 'completed') {
                        clearInterval(timer);
                        clearInterval(pollInterval);
                        handlePaymentSuccess();
                    } else if (data.status === 'expired') {
                        setStatus('expired');
                        clearInterval(timer);
                        clearInterval(pollInterval);
                    }
                }
            } catch (err) {
                console.error('Error in payment verification poll:', err);
            }
        }, 1500);

        return () => {
            clearInterval(timer);
            clearInterval(pollInterval);
        };
    }, [viewStep, sessionId, expiresAt, status, router, toast]);

    // State for applied coupon directly from fluxbase_global.discounts
    const [appliedCoupon, setAppliedCoupon] = useState<{
        code: string;
        discountType: string;
        discountValue: number;
        discountAmount: number;
        finalPrice: number;
        description: string;
    } | null>(null);

    // Calculate dynamic order pricing
    const getBasePricing = () => {
        const plan = selectedPlanKey;
        if (plan === 'org_owner' || plan === 'org') {
            return { original: 5000, label: 'Org Owner Enterprise' };
        }
        if (plan === 'pay_as_you_go') {
            return { original: 50, label: 'Pay-As-You-Go Verification (Refundable)' };
        }
        if (plan === 'employee') {
            return { original: 500, label: 'Employee Dedicated' };
        }
        if (plan === 'pro' || plan === 'student_pro') {
            return { original: proPrice, label: 'Student Pro' };
        }
        if (plan === 'max' || plan === 'student_max') {
            return { original: maxPrice, label: 'Student Max' };
        }
        return { original: 500, label: 'Dedicated Tier' };
    };

    const pricingDetails = getBasePricing();
    const finalCalculatedPrice = appliedCoupon ? appliedCoupon.finalPrice : pricingDetails.original;
    const totalSavings = appliedCoupon ? appliedCoupon.discountAmount : 0;

    // Apply Coupon Code via API against live fluxbase_global.discounts table
    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) {
            toast({ variant: 'destructive', title: 'Empty Coupon', description: 'Please enter a coupon code.' });
            return;
        }

        setIsApplyingCoupon(true);
        try {
            const res = await fetch('/api/payments/verify-coupon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: couponCode.trim(),
                    planKey: selectedPlanKey,
                    orderAmount: pricingDetails.original
                })
            });

            const data = await res.json();
            if (res.ok && data.success && data.discount) {
                setAppliedCoupon(data.discount);
                setIsDiscountApplied(true);
                toast({
                    title: 'Coupon Applied!',
                    description: `Code ${data.discount.code} applied! You save Rs.${data.discount.discountAmount} (${data.discount.discountValue}${data.discount.discountType === 'percentage' ? '%' : ' Rs'} off).`
                });
            } else {
                setAppliedCoupon(null);
                setIsDiscountApplied(false);
                toast({
                    variant: 'destructive',
                    title: 'Invalid Coupon',
                    description: data.error || 'The coupon code entered is invalid or expired.'
                });
            }
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Coupon Error',
                description: err.message
            });
        } finally {
            setIsApplyingCoupon(false);
        }
    };

    // Proceed from Review to Live Payment Session
    const handleProceedToPayment = async () => {
        setLoadingPayment(true);
        try {
            let projectData: any = null;
            try {
                const raw = localStorage.getItem('pending_paid_project');
                if (raw) projectData = JSON.parse(raw);
            } catch {}

            const res = await fetch('/api/payments/create-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: selectedPlanKey,
                    isDiscountApplied: isDiscountApplied && !!appliedCoupon,
                    couponCode: appliedCoupon?.code,
                    projectData
                })
            });

            const data = await res.json();
            if (!res.ok || !data.sessionId) {
                throw new Error(data.error || 'Failed to initialize payment session');
            }

            setSessionId(data.sessionId.toString());
            setAmount(data.amount);
            setPlanType(selectedPlanKey);
            setViewStep('payment');

            toast({
                title: 'Order Confirmed',
                description: `Payment session generated for Rs.${data.amount.toFixed(2)}.`
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Checkout Error',
                description: err.message
            });
        } finally {
            setLoadingPayment(false);
        }
    };

    // Cancellation Handlers
    const handleCancelSession = () => {
        if (status === 'completed') {
            router.push('/dashboard/projects');
            return;
        }
        setCancelDialogOpen(true);
    };

    const executeCancelSession = async () => {
        setIsCancelling(true);
        localStorage.removeItem('pending_paid_project');
        if (sessionId) {
            try {
                await fetch('/api/payments/cancel-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
            } catch (e) {
                console.error('Error cancelling session:', e);
            }
        }
        setIsCancelling(false);
        setCancelDialogOpen(false);
        router.push('/dashboard/projects');
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // ── STEP 1: ORDER & PLAN REVIEW WITH COUPON APPLICATION ──
    if (viewStep === 'review') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-card/10 to-background px-4 py-12 text-foreground">
                <div className="w-full max-w-xl space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                localStorage.removeItem('pending_paid_project');
                                router.push('/dashboard/projects');
                            }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" /> Back to Projects
                        </Button>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider text-primary border-primary/30 bg-primary/10">
                            Step 1 of 2: Review Order
                        </Badge>
                    </div>

                    <Card className="border border-border bg-card shadow-2xl overflow-hidden backdrop-blur-md">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                                        <ShieldCheck className="h-5 w-5 text-primary" />
                                        Order & Plan Review
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground mt-1">
                                        Verify your database configuration and apply discount coupons before proceeding.
                                    </CardDescription>
                                </div>
                                <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    {pricingDetails.label}
                                </span>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6 pt-5">
                            {/* Project & Server Specs Summary */}
                            <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                                    <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
                                        <Database className="h-3.5 w-3.5 text-primary" /> Database Target
                                    </span>
                                    <span className="text-xs font-bold font-mono text-foreground">
                                        {pendingProject?.projectName || 'Fluxbase High-Performance DB'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <Server className="h-3.5 w-3.5 text-blue-400" />
                                        <span>Engine:</span>
                                        <strong className="text-foreground uppercase font-mono">
                                            {pendingProject?.dialect === 'mysql' ? 'MySQL' : 'PostgreSQL'}
                                        </strong>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                                        <Cpu className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                                        <span className="shrink-0">Compute:</span>
                                        <strong className="text-foreground truncate">
                                            {(pendingProject?.userRole === 'org_owner' || selectedPlanKey === 'org_owner') ? '8 vCPU Xeon (32 GB)' : '2 vCPU (4 GB RAM)'}
                                        </strong>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                                        <HardDrive className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                        <span className="shrink-0">Storage:</span>
                                        <strong className="text-foreground truncate">
                                            {(pendingProject?.userRole === 'org_owner' || selectedPlanKey === 'org_owner') ? '100 GB NVMe Gen4' : '10 GB High-Speed SSD'}
                                        </strong>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                                        <Sparkles className="h-3.5 w-3.5 text-green-400 shrink-0" />
                                        <span className="shrink-0">Billing:</span>
                                        <strong className="text-foreground truncate" title={pendingProject?.billingPreference === 'pay_as_you_go' ? 'Pay-As-You-Go (₹50 Refundable Verification)' : 'Fixed Monthly'}>
                                            {pendingProject?.billingPreference === 'pay_as_you_go' ? 'Pay-As-You-Go' : 'Fixed Monthly'}
                                        </strong>
                                    </div>
                                </div>
                                {pendingProject?.billingPreference === 'pay_as_you_go' && (
                                    <p className="text-[11px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded p-2 text-center">
                                        ✓ The ₹50 verification fee is 100% refundable and will be credited towards your 1st month 28-day usage statement.
                                    </p>
                                )}
                            </div>

                            {/* Coupon / Promo Code Box */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <Tag className="h-3.5 w-3.5 text-primary" /> Apply Coupon / Promo Code
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        placeholder="e.g. FLUX20, PROMO"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                        disabled={isDiscountApplied}
                                        className="bg-background border-border text-foreground font-mono uppercase text-xs h-10"
                                    />
                                    {isDiscountApplied ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setIsDiscountApplied(false);
                                                setAppliedCoupon(null);
                                                setCouponCode('');
                                            }}
                                            className="text-xs font-semibold border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0 h-10 px-4"
                                        >
                                            Remove
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            onClick={handleApplyCoupon}
                                            disabled={isApplyingCoupon || !couponCode.trim()}
                                            className="bg-primary text-primary-foreground text-xs font-bold shrink-0 h-10 px-5"
                                        >
                                            {isApplyingCoupon ? 'Verifying...' : 'Apply Code'}
                                        </Button>
                                    )}
                                </div>
                                {isDiscountApplied && (
                                    <p className="text-xs font-medium text-green-400 flex items-center gap-1.5 mt-1">
                                        <Check className="h-3.5 w-3.5" /> Discount active! You saved Rs.{totalSavings}.
                                    </p>
                                )}
                            </div>

                            {/* Pricing Breakdown */}
                            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Base Plan Rate ({pricingDetails.label})</span>
                                    <span className="font-mono">Rs.{pricingDetails.original}.00</span>
                                </div>
                                {isDiscountApplied && (
                                    <div className="flex justify-between text-green-400 font-medium">
                                        <span>Promotional Coupon Discount</span>
                                        <span className="font-mono">-Rs.{totalSavings}.00</span>
                                    </div>
                                )}
                                <div className="pt-2 border-t border-border/60 flex justify-between items-center text-sm font-bold text-foreground">
                                    <span>Total Due Today</span>
                                    <span className="text-lg font-mono text-primary font-black">
                                        Rs.{finalCalculatedPrice}.00
                                    </span>
                                </div>
                            </div>
                        </CardContent>

                        <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2 pb-6 border-t border-border/50">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    localStorage.removeItem('pending_paid_project');
                                    router.push('/dashboard/projects');
                                }}
                                className="w-full sm:w-1/3 text-xs font-semibold"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleProceedToPayment}
                                disabled={loadingPayment}
                                className="w-full sm:w-2/3 bg-primary text-primary-foreground font-bold hover:bg-primary/95 text-xs flex items-center justify-center gap-2"
                            >
                                {loadingPayment ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating Payment Session...
                                    </>
                                ) : (
                                    <>
                                        Confirm & Proceed to Payment (Rs.{finalCalculatedPrice})
                                        <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        );
    }

    // ── STEP 2: LIVE PAYMENT (UPI QR CODE & AUTOMATED GATEWAY) ──
    const currentPriceAmount = amount || finalCalculatedPrice;
    const upiString = `upi://pay?pa=${upiMerchantVpa}&pn=Fluxbase&am=${currentPriceAmount}&cu=INR&tn=${encodeURIComponent(`${(planType || selectedPlanKey).toUpperCase()} Plan Activation`)}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiString)}`;

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-card/10 to-background px-4 text-foreground relative py-12">
            <div className="absolute top-6 left-6 sm:top-10 sm:left-10">
                <Button
                    variant="ghost"
                    onClick={handleCancelSession}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Projects
                </Button>
            </div>

            <div className="w-full max-w-md space-y-6">
                {/* Branding header */}
                <div className="flex flex-col items-center text-center space-y-1">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                        <span className="text-xl font-black tracking-wider text-foreground">FLUXPAY</span>
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">Gateway</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Secure P2P UPI Transfer Protocol</p>
                </div>

                <Card className="border border-border bg-card shadow-2xl relative overflow-hidden backdrop-blur-md">
                    {/* Glowing effect inside card */}
                    <div className="absolute top-0 right-0 h-40 w-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

                    {status === 'completed' && (
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-5 animate-in fade-in zoom-in-95 duration-500">
                            <div className="p-5 rounded-full bg-green-500/10 text-green-500">
                                <Check className="h-16 w-16" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black tracking-tight text-foreground">Payment Verified!</h3>
                                <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                                    Your high-performance project has been provisioned. Redirecting you to your projects dashboard...
                                </p>
                            </div>
                        </CardContent>
                    )}

                    {status === 'expired' && (
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                            <div className="p-4 rounded-full bg-destructive/10 text-destructive">
                                <AlertCircle className="h-12 w-12" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-foreground">Payment Session Expired</h3>
                                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                    For security and uniqueness constraints, payment sessions expire in 5 minutes. Click below to re-initialize your session.
                                </p>
                            </div>
                            <CardFooter className="w-full flex gap-3 px-0 pb-0">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        localStorage.removeItem('pending_paid_project');
                                        router.push('/dashboard/projects');
                                    }}
                                    className="w-1/3"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => setViewStep('review')}
                                    className="w-2/3 bg-primary text-primary-foreground font-bold hover:bg-primary/95"
                                >
                                    Review & Retry
                                </Button>
                            </CardFooter>
                        </CardContent>
                    )}

                    {status === 'pending' && (
                        <>
                            <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg font-bold">Pay for {(planType || selectedPlanKey).toUpperCase()}</CardTitle>
                                    <CardDescription className="text-xs">Scan using any UPI app to activate immediately.</CardDescription>
                                </div>
                                <div className={`font-mono text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 ${timeLeft < 60 ? 'bg-destructive/10 text-destructive animate-pulse border border-destructive/20' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
                                    {formatTime(timeLeft)}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-6 pt-5">
                                {/* QR Code frame */}
                                <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/80 bg-muted/10 relative group">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
                                        <QrCode className="h-3.5 w-3.5" /> Scan QR inside UPI App
                                    </span>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={qrCodeUrl}
                                        alt="UPI QR Code"
                                        className="bg-white p-3 rounded-lg shadow-xl border border-border max-w-[200px]"
                                    />
                                    <div className="mt-3 flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md border border-border/50">
                                        <span>UPI ID: <strong>{upiMerchantVpa}</strong></span>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(upiMerchantVpa);
                                                toast({ title: 'Copied!', description: 'UPI ID copied to clipboard' });
                                            }}
                                            className="hover:text-foreground text-muted-foreground transition-colors ml-1"
                                            title="Copy UPI ID"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Exact Amount Highlight Box */}
                                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                                        Pay Exact Amount:
                                    </span>
                                    <div className="text-3xl font-black font-mono tracking-tight text-primary">
                                        Rs.{currentPriceAmount?.toFixed(2)}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground pt-1">
                                        Automated decimal verification active (e.g. ₹{currentPriceAmount?.toFixed(2)}). Verification is automatic upon receipt.
                                    </p>
                                </div>

                                {/* Automated Live Detection Indicator */}
                                <div className="border border-border/80 bg-card/60 rounded-xl p-4 text-center space-y-2">
                                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary">
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                                        </span>
                                        Listening for incoming payment...
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Transfer the exact amount using any UPI app. Your screen will verify and activate automatically upon receipt.
                                    </p>
                                </div>
                            </CardContent>
                        </>
                    )}
                </Card>

                {/* Secure checkout branding */}
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Direct P2P Encryption Active. Keep this tab open while paying.
                </div>
            </div>

            {/* Dedicated Custom Cancel Alert Dialog */}
            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <AlertDialogContent className="bg-card border border-border text-foreground shadow-2xl max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-lg font-bold">Cancel Payment Session?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
                            Are you sure you want to cancel this checkout session and return to projects? Your pending session will be terminated and no project or charges will be created.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex gap-2 sm:gap-0 mt-4">
                        <AlertDialogCancel disabled={isCancelling} className="border-border text-xs">
                            Continue Payment
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeCancelSession}
                            disabled={isCancelling}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold"
                        >
                            {isCancelling ? 'Cancelling...' : 'Yes, Cancel & Return'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function CheckoutPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-semibold">Initializing Fluxpay Gateway...</p>
            </div>
        }>
            <CheckoutContent />
        </Suspense>
    );
}
