'use client';
import { useState, useEffect } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Copy, CreditCard, Smartphone, AlertCircle, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function PricingPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const [discountCode, setDiscountCode] = useState('');
    const [isDiscountApplied, setIsDiscountApplied] = useState(false);

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
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [sessionAmount, setSessionAmount] = useState<number | null>(null);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
    const [sessionLoading, setSessionLoading] = useState(false);
    const [sessionStatus, setSessionStatus] = useState<'pending' | 'completed' | 'expired' | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(300);
    const [showUtrFallback, setShowUtrFallback] = useState(false);

    // Fetch dynamic pricing details from the database on component mount
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
        fetchPricing();
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
                handler: function () {
                    toast({
                        title: 'Payment Successful',
                        description: `You are now subscribed to the ${selectedPlan.name} plan. Restarting session...`
                    });
                    setTimeout(() => router.push('/dashboard'), 2000);
                },
                theme: { color: '#ff7a1a' }
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

    const handleUtrVerification = async () => {
        if (!selectedPlan || !utr) return;
        
        const cleanUtr = utr.trim();
        if (!/^\d{12}$/.test(cleanUtr)) {
            toast({
                variant: 'destructive',
                title: 'Invalid UTR',
                description: 'The UPI Ref No / UTR must be a 12-digit number.'
            });
            return;
        }

        setIsVerifying(true);
        try {
            const res = await fetch('/api/payments/verify-utr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    utr: cleanUtr,
                    plan: selectedPlan.name
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Verification failed');
            }

            toast({
                title: 'Upgrade Successful!',
                description: data.message
            });
            setCheckoutModalOpen(false);
            setTimeout(() => router.push('/dashboard'), 1500);

        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Verification Failed',
                description: err.message
            });
        } finally {
            setIsVerifying(false);
        }
    };

    const startUpiSession = async (planName: 'Pro' | 'Max') => {
        setSessionLoading(true);
        try {
            const res = await fetch('/api/payments/create-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan: planName,
                    isDiscountApplied
                })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to initialize payment session');
            }
            setCheckoutModalOpen(false);
            router.push(`/checkout?sessionId=${data.sessionId}`);
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err.message
            });
        } finally {
            setSessionLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center bg-background px-5 py-14 text-foreground sm:px-4 sm:py-20">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

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

            <div className="grid w-full max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
                {/* FREE TIER */}
                <Card className="flex flex-col border-border bg-card/40">
                    <CardHeader>
                        <CardTitle className="text-2xl text-foreground">Free</CardTitle>
                        <CardDescription>Perfect for side projects and learning.</CardDescription>
                        <div className="mt-4">
                            <span className="text-4xl font-bold text-foreground">Rs.0</span>
                            <span className="text-muted-foreground"> / month</span>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4 text-muted-foreground">
                        <FeatureItem text="1 Database Project" />
                        <FeatureItem text="500 MB Storage limit" />
                        <FeatureItem text="50,000 requests / month" />
                        <FeatureItem text="100 Concurrent WebSockets" />
                        <FeatureItem text="Community Support" />
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard')}>
                            Get Started
                        </Button>
                    </CardFooter>
                </Card>

                {/* PRO TIER */}
                <Card className="relative flex flex-col border-primary/45 bg-card shadow-2xl shadow-primary/10 md:scale-105">
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-md bg-primary px-4 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                        Most Popular
                    </div>
                    <CardHeader>
                        <CardTitle className="text-2xl text-foreground">Pro</CardTitle>
                        <CardDescription>Advanced capacity for production apps.</CardDescription>
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
                              className="w-full bg-primary text-primary-foreground hover:bg-primary/95"
                              onClick={() => handleSelectPlan(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID || '', 'Pro')}
                              disabled={loadingPlan !== null}
                          >
                              {loadingPlan === 'Pro' ? 'Processing...' : 'Upgrade to Pro'}
                          </Button>
                      </CardFooter>
                  </Card>
  
                  {/* MAX TIER */}
                  <Card className="flex flex-col border-border bg-card/40">
                      <CardHeader>
                          <CardTitle className="text-2xl text-foreground">Max</CardTitle>
                          <CardDescription>Unleashed limits for scaling organizations.</CardDescription>
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
                              className="w-full"
                              onClick={() => handleSelectPlan(process.env.NEXT_PUBLIC_RAZORPAY_MAX_PLAN_ID || '', 'Max')}
                              disabled={loadingPlan !== null}
                          >
                              {loadingPlan === 'Max' ? 'Processing...' : 'Upgrade to Max'}
                          </Button>
                      </CardFooter>
                  </Card>
              </div>
  
              {/* CHECKOUT MODAL */}
              <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
                  <DialogContent className="max-w-md bg-card border border-border text-foreground shadow-2xl">
                      {selectedPlan && (
                          <>
                              <DialogHeader>
                                  <DialogTitle className="text-2xl font-bold text-foreground flex items-center justify-between">
                                      <span>Upgrade to {selectedPlan.name}</span>
                                      <span className="text-primary font-extrabold text-xl">₹{selectedPlan.amount}</span>
                                  </DialogTitle>
                                  <DialogDescription className="text-muted-foreground text-sm">
                                      Select your preferred checkout method to securely complete the upgrade.
                                  </DialogDescription>
                              </DialogHeader>
  
                              {checkoutMethod === 'choose' && (
                                  <div className="flex flex-col gap-3 py-4">
                                      <button
                                          onClick={() => startUpiSession(selectedPlan.name)}
                                          disabled={sessionLoading}
                                          className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30 text-left hover:bg-muted/80 transition-all group disabled:opacity-50"
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

