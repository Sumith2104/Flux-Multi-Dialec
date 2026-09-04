'use client';
import { useState, useEffect, Suspense } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Copy, CreditCard, Smartphone, AlertCircle, QrCode, X, ArrowRight, Sparkles, GraduationCap, Briefcase, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getUserPlanAction } from '@/app/(app)/settings/actions';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

function PricingContent() {
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isOnboarding = searchParams ? searchParams.get('onboarding') === 'true' : false;

    const [currentPlan, setCurrentPlan] = useState<string>('free');
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const [discountCode, setDiscountCode] = useState('');
    const [isDiscountApplied, setIsDiscountApplied] = useState(false);
    const [showOnboardingBanner, setShowOnboardingBanner] = useState(true);

    // Dynamic database-driven pricing states
    const [proPrice, setProPrice] = useState<number>(0);
    const [maxPrice, setMaxPrice] = useState<number>(0);
    const [discountProPrice, setDiscountProPrice] = useState<number>(0);
    const [discountMaxPrice, setDiscountMaxPrice] = useState<number>(0);
    const [enableDiscount, setEnableDiscount] = useState<boolean>(false);
    const [dbDiscountCode, setDbDiscountCode] = useState<string>('');
    const [pricingLoaded, setPricingLoaded] = useState<boolean>(false);

    // Modal / Checkout States
    const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<{ id: string; name: 'Pro' | 'Max'; amount: number } | null>(null);
    const [checkoutMethod, setCheckoutMethod] = useState<'choose' | 'razorpay' | 'upi'>('choose');
    const [utr, setUtr] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Dynamic UPI Payment Session States
    const [sessionLoading, setSessionLoading] = useState(false);

    // Fetch dynamic pricing details and user subscription status from the database on component mount
    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const res = await fetch('/api/payments/pricing-config');
                const data = await res.json();
                if (res.ok && data.success) {
                    const p = data.pricing;
                    setProPrice(p.proPrice);
                    setMaxPrice(p.maxPrice);
                    setDiscountProPrice(p.discountProPrice);
                    setDiscountMaxPrice(p.discountMaxPrice);
                    setEnableDiscount(p.enableDiscount);
                    setDbDiscountCode(p.discountCode);
                    setPricingLoaded(true);
                }
            } catch (err) {
                console.error("Failed to fetch dynamic pricing configurations:", err);
            }
        };

        const fetchUserPlan = async () => {
            try {
                const res = await getUserPlanAction();
                if (res && res.success && res.plan) {
                    setCurrentPlan(res.plan.toLowerCase());
                    setIsLoggedIn(true);
                } else {
                    setCurrentPlan('free');
                    setIsLoggedIn(false);
                }
            } catch (err) {
                console.error("Failed to fetch user plan:", err);
            }
        };

        fetchPricing();
        fetchUserPlan();
    }, []);

    const checkDiscount = () => {
        if (!enableDiscount) {
            toast({ variant: 'destructive', title: 'Discounts Disabled', description: 'Promotional discounts are not active at this time.' });
            return;
        }
        if (discountCode.toUpperCase() === dbDiscountCode.toUpperCase()) {
            setIsDiscountApplied(true);
            toast({ title: 'Discount Applied!', description: 'Promotional pricing activated.' });
        } else {
            setIsDiscountApplied(false);
            toast({ variant: 'destructive', title: 'Invalid Code', description: 'The promo code entered is not valid.' });
        }
    };

    const handleSelectPlan = (planId: string, planName: 'Pro' | 'Max') => {
        let amount = planName === 'Pro' ? proPrice : maxPrice;
        if (isDiscountApplied) {
            amount = planName === 'Pro' ? discountProPrice : discountMaxPrice;
        }

        setSelectedPlan({ id: planId, name: planName, amount });
        setCheckoutMethod('choose');
        setUtr('');
        setCheckoutModalOpen(true);
    };

    const handleRazorpayCheckout = async () => {
        if (!selectedPlan) return;
        setCheckoutModalOpen(false);
        setLoadingPlan(selectedPlan.name);

        try {
            // 1. Create the subscription via backend securely
            const res = await fetch('/api/subscriptions/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: selectedPlan.id })
            });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 401) {
                    router.push('/login?callbackUrl=/pricing');
                    return;
                }
                throw new Error(data.error || 'Failed to initialize checkout');
            }

            // 2. Open Razorpay Checkout Window
            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'mock_key_public',
                subscription_id: data.subscriptionId,
                name: 'Fluxbase',
                description: `${selectedPlan.name} Subscription`,
                handler: function (response: any) {
                    toast({
                        title: 'Payment Successful!',
                        description: 'Your plan has been upgraded successfully.'
                    });
                    router.push('/dashboard/projects');
                },
                prefill: {
                    name: 'Fluxbase Customer',
                },
                theme: {
                    color: '#00F0FF'
                }
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
                toast({
                    variant: 'destructive',
                    title: 'Payment Failed',
                    description: response.error.description
                });
            });
            rzp.open();

        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err.message
            });
        } finally {
            setLoadingPlan(null);
        }
    };

    const startUpiSession = (planName: string) => {
        setCheckoutModalOpen(false);
        router.push(`/checkout?plan=${planName.toLowerCase()}`);
    };

    return (
        <div className="flex min-h-screen flex-col items-center bg-background px-5 py-10 text-foreground sm:px-4 sm:py-16">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

            {/* ── Top Bar: Skip / Continue to Dashboard Button & Close (X) ── */}
            <div className="w-full max-w-5xl flex items-center justify-between mb-8 pb-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                        {isLoggedIn ? `Logged in: ${currentPlan.toUpperCase()} Plan` : 'Fluxbase Pricing & Plans'}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        variant="default"
                        size="sm"
                        onClick={() => router.push('/dashboard/projects')}
                        className="text-xs font-semibold"
                    >
                        Continue with Existing Plan
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.push('/dashboard/projects')}
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        title="Close / Skip to Dashboard"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* ── Onboarding / Welcome Notification Banner ── */}
            {(isOnboarding || showOnboardingBanner) && isLoggedIn && (
                <div className="w-full max-w-5xl mb-8 p-4 rounded-xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/20 text-primary">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Welcome to Fluxbase!</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Your account is ready with the default Free plan. You can continue directly or choose an upgraded tier below.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            size="sm" 
                            onClick={() => router.push('/dashboard/projects')}
                            className="text-xs font-semibold bg-primary text-primary-foreground"
                        >
                            Continue to Projects
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => setShowOnboardingBanner(false)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            <div className="mb-10 max-w-3xl space-y-4 text-center sm:mb-16">
                <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                    Scale Your Database.
                </h1>
                <p className="text-base leading-7 text-muted-foreground sm:text-xl">
                    From hobby projects to enterprise performance, choose the database power you actually need without unpredictable bills.
                </p>
                {enableDiscount && (
                    <div className="mt-6 flex w-full flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
                        <input
                            type="text"
                            placeholder="PROMOCODE"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value)}
                            className="bg-card text-foreground px-4 py-2 border border-border rounded-md text-sm outline-none focus:border-primary uppercase sm:w-64"
                        />
                        <Button onClick={checkDiscount} className="bg-primary text-primary-foreground font-semibold">
                            Apply Code
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Student & Individual Plans ── */}
            <div className="w-full max-w-5xl mb-12">
                <div className="flex items-center gap-2 mb-6">
                    <span className="text-xs font-mono uppercase tracking-widest text-primary font-bold px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                        Student & Individual Plans
                    </span>
                </div>

                <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-3">
                    {/* STUDENT FREE TIER */}
                    <Card className="flex flex-col border-border bg-card/40 hover:border-border/80 transition-all">
                        <CardHeader>
                            <CardTitle className="text-2xl text-foreground">Student Free</CardTitle>
                            <CardDescription>Perfect for coursework, learning, and lab assignments.</CardDescription>
                            <div className="mt-4">
                                <span className="text-4xl font-bold text-foreground">Rs.0</span>
                                <span className="text-muted-foreground"> / month</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 text-muted-foreground">
                            <FeatureItem text="1 Database Project" />
                            <FeatureItem text="500 MB Shared Storage" />
                            <FeatureItem text="50,000 requests / month" />
                            <FeatureItem text="100 Concurrent WebSockets" />
                            <FeatureItem text="Community Discord Support" />
                        </CardContent>
                        <CardFooter>
                            <Button 
                                variant={currentPlan === 'free' ? 'default' : 'outline'} 
                                className="w-full font-semibold" 
                                onClick={() => router.push('/dashboard/projects')}
                            >
                                {isLoggedIn ? (currentPlan === 'free' ? 'Continue with Free Plan' : 'Switch to Free') : 'Get Started for Free'}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* STUDENT PRO TIER */}
                    <Card className="relative flex flex-col border-primary/45 bg-card shadow-2xl shadow-primary/10 md:scale-105">
                        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-md bg-primary px-4 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                            Student Pro
                        </div>
                        <CardHeader>
                            <CardTitle className="text-2xl text-foreground">Student Pro</CardTitle>
                            <CardDescription>Extra capacity for academic thesis and portfolio apps.</CardDescription>
                            <div className="mt-4 flex items-end space-x-2">
                                {isDiscountApplied ? (
                                    <>
                                        <span className="text-4xl font-bold text-green-400">Rs.{discountProPrice}</span>
                                        <span className="text-xl text-muted-foreground line-through">Rs.{proPrice}</span>
                                    </>
                                ) : (
                                    <span className="text-4xl font-bold text-foreground">Rs.{proPrice}</span>
                                )}
                                <span className="mb-1 text-muted-foreground"> / month</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 text-muted-foreground">
                            <FeatureItem text="Up to 3 Database Projects" />
                            <FeatureItem text="8 GB Storage (Rs.10/GB overage)" />
                            <FeatureItem text="2,000,000 requests / month" />
                            <FeatureItem text="500 Concurrent WebSockets" />
                            <FeatureItem text="Email Support (24h SLA)" />
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full bg-primary text-primary-foreground hover:bg-primary/95 font-semibold"
                                onClick={() => handleSelectPlan(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID || '', 'Pro')}
                                disabled={loadingPlan !== null || (isLoggedIn && (currentPlan === 'pro' || currentPlan === 'max'))}
                            >
                                {loadingPlan === 'Pro' 
                                    ? 'Processing...' 
                                    : (isLoggedIn && currentPlan === 'pro') 
                                        ? 'Current Plan' 
                                        : (isLoggedIn && currentPlan === 'max')
                                            ? 'Included in Max'
                                            : 'Upgrade to Student Pro'}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* STUDENT MAX TIER */}
                    <Card className="flex flex-col border-border bg-card/40 hover:border-border/80 transition-all">
                        <CardHeader>
                            <CardTitle className="text-2xl text-foreground">Student Max</CardTitle>
                            <CardDescription>Unleashed limits for capstone projects and student startups.</CardDescription>
                            <div className="mt-4 flex items-end space-x-2">
                                {isDiscountApplied ? (
                                    <>
                                        <span className="text-4xl font-bold text-green-400">Rs.{discountMaxPrice}</span>
                                        <span className="text-xl text-muted-foreground line-through">Rs.{maxPrice}</span>
                                    </>
                                ) : (
                                    <span className="text-4xl font-bold text-foreground">Rs.{maxPrice}</span>
                                )}
                                <span className="mb-1 text-muted-foreground"> / month</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 text-muted-foreground">
                            <FeatureItem text="Unlimited Database Projects" />
                            <FeatureItem text="50 GB Storage (Rs.10/GB overage)" />
                            <FeatureItem text="15,000,000 requests / month" />
                            <FeatureItem text="2,500 Concurrent WebSockets" />
                            <FeatureItem text="Priority 24/7 Slack Support" />
                        </CardContent>
                        <CardFooter>
                            <Button
                                variant="outline"
                                className="w-full font-semibold"
                                onClick={() => handleSelectPlan(process.env.NEXT_PUBLIC_RAZORPAY_MAX_PLAN_ID || '', 'Max')}
                                disabled={loadingPlan !== null || (isLoggedIn && currentPlan === 'max')}
                            >
                                {loadingPlan === 'Max' 
                                    ? 'Processing...' 
                                    : (isLoggedIn && currentPlan === 'max') 
                                        ? 'Current Plan' 
                                        : 'Upgrade to Student Max'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            {/* ── High-Performance Business & Enterprise Plans ── */}
            <div className="w-full max-w-5xl mb-12">
                <div className="flex items-center gap-2 mb-6">
                    <span className="text-xs font-mono uppercase tracking-widest text-blue-400 font-bold px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                        High-Performance Business & Enterprise Plans
                    </span>
                </div>

                <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
                    {/* EMPLOYEE TIER */}
                    <Card className="flex flex-col border-blue-500/30 bg-card/50 hover:border-blue-500/60 transition-all">
                        <CardHeader>
                            <div className="flex justify-between items-center mb-1">
                                <CardTitle className="text-2xl text-foreground">Employee Dedicated</CardTitle>
                                <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">High-Performance</span>
                            </div>
                            <CardDescription>Dedicated infrastructure for team workloads and production APIs.</CardDescription>
                            <div className="mt-4">
                                <span className="text-4xl font-bold text-foreground">Rs.500</span>
                                <span className="text-muted-foreground"> / month + Pay-As-You-Go</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 text-muted-foreground">
                            <FeatureItem text="2 vCPU Dedicated Server (4 GB RAM)" />
                            <FeatureItem text="10 GB High-Speed SSD Storage" />
                            <FeatureItem text="100 Concurrent Connections" />
                            <FeatureItem text="Pay-As-You-Go: Rs.0.50 / 10,000 queries" />
                            <FeatureItem text="Pay-As-You-Go: Rs.5 / additional GB storage" />
                            <FeatureItem text="Daily Automated Backups" />
                        </CardContent>
                        <CardFooter>
                            <Button 
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium" 
                                onClick={() => startUpiSession('employee')}
                                disabled={sessionLoading}
                            >
                                {sessionLoading ? 'Initializing Checkout...' : 'Subscribe to Employee (Rs.500)'}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* ORG OWNER TIER */}
                    <Card className="flex flex-col border-purple-500/30 bg-card/50 hover:border-purple-500/60 transition-all">
                        <CardHeader>
                            <div className="flex justify-between items-center mb-1">
                                <CardTitle className="text-2xl text-foreground">Org Owner Enterprise</CardTitle>
                                <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">Top-Grade NVMe</span>
                            </div>
                            <CardDescription>Dedicated Xeon/EPYC clusters with 99.99% SLA and high-IOPS storage.</CardDescription>
                            <div className="mt-4">
                                <span className="text-4xl font-bold text-foreground">Rs.5,000</span>
                                <span className="text-muted-foreground"> / month + Pay-As-You-Go</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 text-muted-foreground">
                            <FeatureItem text="8 vCPU Dedicated Xeon/EPYC (32 GB RAM)" />
                            <FeatureItem text="100 GB Gen4 NVMe Storage (10,000 IOPS)" />
                            <FeatureItem text="1,000+ Concurrent Connections + Built-in Pooler" />
                            <FeatureItem text="Pay-As-You-Go: Rs.2.00 / 10,000 queries" />
                            <FeatureItem text="Pay-As-You-Go: Rs.15 / additional GB NVMe" />
                            <FeatureItem text="99.99% High-Availability SLA + Continuous PITR" />
                        </CardContent>
                        <CardFooter>
                            <Button 
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium" 
                                onClick={() => startUpiSession('org_owner')}
                                disabled={sessionLoading}
                            >
                                {sessionLoading ? 'Initializing Checkout...' : 'Subscribe to Org Owner (Rs.5,000)'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            {/* CHECKOUT MODAL */}
            <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
                <DialogContent className="max-w-md bg-card border border-border text-foreground shadow-2xl">
                    {selectedPlan && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                    Choose Payment Method
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground">
                                    Select how you want to pay for {selectedPlan.name} (Rs.{selectedPlan.amount}/mo).
                                </DialogDescription>
                            </DialogHeader>

                            {checkoutMethod === 'choose' && (
                                <div className="grid gap-3 pt-3">
                                    <button
                                        onClick={() => startUpiSession(selectedPlan.name)}
                                        disabled={sessionLoading}
                                        className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30 text-left hover:bg-muted/80 transition-all group"
                                    >
                                        <div className="p-2.5 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                                            <Smartphone className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground">
                                                {sessionLoading ? 'Initializing...' : 'Direct UPI Transfer'}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Pay using a unique amount with fully automated verification
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleRazorpayCheckout}
                                        className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30 text-left hover:bg-muted/80 transition-all group"
                                    >
                                        <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                                            <CreditCard className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground">Card / Netbanking / Wallets</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">Process payment securely via Razorpay payment gateway</p>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function FeatureItem({ text }: { text: string }) {
    return (
        <div className="flex items-center space-x-3">
            <Check className="h-5 w-5 text-green-500 shrink-0" />
            <span>{text}</span>
        </div>
    );
}

export default function PricingPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-xs text-muted-foreground font-mono">Loading pricing plans...</p>
            </div>
        }>
            <PricingContent />
        </Suspense>
    );
}
