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

    const checkDiscount = () => {
        const validCode = process.env.NEXT_PUBLIC_DISCOUNT_CODE;
        if (discountCode.toUpperCase() === validCode) {
            setIsDiscountApplied(true);
            toast({ title: 'Discount Applied!', description: 'Promotional pricing activated.' });
        } else {
            setIsDiscountApplied(false);
            toast({ variant: 'destructive', title: 'Invalid Code', description: 'The promo code entered is not valid.' });
        }
    };

    const handleSelectPlan = (planId: string, planName: 'Pro' | 'Max') => {
        const standardProPrice = parseFloat(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '0');
        const standardMaxPrice = parseFloat(process.env.NEXT_PUBLIC_RAZORPAY_MAX_PRICE || '0');
        const discountProPrice = parseFloat(process.env.NEXT_PUBLIC_DISCOUNT_PRO_PRICE || '0');
        const discountMaxPrice = parseFloat(process.env.NEXT_PUBLIC_DISCOUNT_MAX_PRICE || '0');

        let amount = planName === 'Pro' ? standardProPrice : standardMaxPrice;
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
        setSessionStatus(null);
        setSessionId(null);
        setSessionAmount(null);
        setShowUtrFallback(false);
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
            setSessionId(data.sessionId);
            setSessionAmount(data.amount);
            setSessionExpiresAt(data.expiresAt);
            setSessionStatus('pending');
            setCheckoutMethod('upi');
            
            // Calculate initial time left in seconds
            const expiry = new Date(data.expiresAt).getTime();
            const now = new Date().getTime();
            setTimeLeft(Math.max(0, Math.floor((expiry - now) / 1000)));

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

    useEffect(() => {
        if (checkoutMethod !== 'upi' || !sessionId || !sessionExpiresAt || sessionStatus !== 'pending') {
            return;
        }

        const timerInterval = setInterval(() => {
            const expiry = new Date(sessionExpiresAt).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, Math.floor((expiry - now) / 1000));
            setTimeLeft(diff);

            if (diff <= 0) {
                setSessionStatus('expired');
                clearInterval(timerInterval);
            }
        }, 1000);

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/payments/check-session?sessionId=${sessionId}`);
                const data = await res.json();
                if (res.ok && data.success) {
                    if (data.status === 'completed') {
                        setSessionStatus('completed');
                        clearInterval(timerInterval);
                        clearInterval(pollInterval);
                        toast({
                            title: 'Upgrade Successful!',
                            description: 'Your payment was matched successfully!'
                        });
                        setTimeout(() => {
                            setCheckoutModalOpen(false);
                            router.push('/dashboard');
                        }, 2000);
                    } else if (data.status === 'expired') {
                        setSessionStatus('expired');
                        clearInterval(timerInterval);
                        clearInterval(pollInterval);
                    }
                }
            } catch (err) {
                console.error('Error polling session status:', err);
            }
        }, 3000);

        return () => {
            clearInterval(timerInterval);
            clearInterval(pollInterval);
        };
    }, [checkoutMethod, sessionId, sessionExpiresAt, sessionStatus, router, toast]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copied!',
            description: 'UPI VPA copied to clipboard.'
        });
    };

    // Construct UPI Deep Link and QR Code URL
    const upiMerchantVpa = process.env.NEXT_PUBLIC_UPI_ID || 'sumithsumith4567890@okaxis';
    
    // NPCI/Bank security rules block pre-filled amounts & notes for Personal VPAs to prevent fraud.
    // If it's a personal VPA, we omit 'am' and 'tn' from the scanned QR to bypass the block.
    const isPersonalVpa = !upiMerchantVpa.includes('.merchant') && 
                          (upiMerchantVpa.endsWith('@okaxis') || 
                           upiMerchantVpa.endsWith('@okicici') || 
                           upiMerchantVpa.endsWith('@ybl') || 
                           upiMerchantVpa.endsWith('@okhdfcbank') || 
                           (upiMerchantVpa.endsWith('@paytm') && !upiMerchantVpa.startsWith('m')));

    const currentAmount = sessionAmount || (selectedPlan ? selectedPlan.amount : 0);

    const upiString = selectedPlan
        ? isPersonalVpa
            ? `upi://pay?pa=${upiMerchantVpa}&pn=Fluxbase`
            : `upi://pay?pa=${upiMerchantVpa}&pn=Fluxbase&am=${currentAmount}&cu=INR&tn=${encodeURIComponent(`${selectedPlan.name} Plan Upgrade`)}`
        : '';
    const qrCodeUrl = selectedPlan
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiString)}`
        : '';

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
                {process.env.NEXT_PUBLIC_ENABLE_DISCOUNT === 'true' && (
                    <div className="mt-6 flex w-full flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
                        <input
                            type="text"
                            placeholder="Have a promo code?"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value)}
                            className="w-full rounded-md border border-border bg-input px-4 py-2 text-foreground shadow-inner shadow-black/10 uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/70 sm:w-auto"
                            disabled={isDiscountApplied}
                        />
                        <Button
                            variant="secondary"
                            onClick={checkDiscount}
                            disabled={isDiscountApplied || !discountCode}
                            className="bg-secondary text-secondary-foreground hover:bg-muted"
                        >
                            {isDiscountApplied ? 'Applied' : 'Apply'}
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
                {/* FREE TIER */}
                <Card className="flex flex-col border-border/70 bg-card/85">
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
                                    <span className="text-4xl font-bold text-green-400">Rs.{process.env.NEXT_PUBLIC_DISCOUNT_PRO_PRICE || '299'}</span>
                                    <span className="text-xl text-muted-foreground line-through">Rs.{process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '499'}</span>
                                  </>
                              ) : (
                                  <span className="text-4xl font-bold text-foreground">Rs.{process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '499'}</span>
                              )}
                              <span className="mb-1 text-muted-foreground"> / month</span>
                          </div>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-4 text-muted-foreground">
                          <FeatureItem text="Up to 3 Database Projects" />
                          <FeatureItem text="8 GB Storage (Rs.10/GB overage)" />
                          <FeatureItem text="2,000,000 requests / month" />
                          <FeatureItem text="500 Concurrent WebSockets" />
                          <FeatureItem text="7-day automated backups" />
                          <FeatureItem text="Standard Email Support" />
                      </CardContent>
                      <CardFooter>
                          <Button
                              className="w-full"
                              onClick={() => handleSelectPlan(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID || '', 'Pro')}
                              disabled={loadingPlan !== null}
                          >
                              {loadingPlan === 'Pro' ? 'Processing...' : 'Upgrade to Pro'}
                          </Button>
                      </CardFooter>
                  </Card>
  
                  {/* MAX TIER */}
                  <Card className="flex flex-col border-border/70 bg-card/85">
                      <CardHeader>
                          <CardTitle className="text-2xl text-foreground">Max</CardTitle>
                          <CardDescription>Scale limitlessly with dedicated power.</CardDescription>
                          <div className="mt-4 flex items-end space-x-2">
                              {isDiscountApplied ? (
                                  <>
                                      <span className="text-4xl font-bold text-green-400">Rs.{process.env.NEXT_PUBLIC_DISCOUNT_MAX_PRICE || '1499'}</span>
                                      <span className="text-xl text-muted-foreground line-through">Rs.{process.env.NEXT_PUBLIC_RAZORPAY_MAX_PRICE || '2499'}</span>
                                  </>
                              ) : (
                                  <span className="text-4xl font-bold text-foreground">Rs.{process.env.NEXT_PUBLIC_RAZORPAY_MAX_PRICE || '2,499'}</span>
                              )}
                              <span className="mb-1 text-muted-foreground"> / month</span>
                          </div>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-4 text-muted-foreground">
                          <FeatureItem text="Unlimited Database Projects" />
                          <FeatureItem text="50 GB Storage (Rs.10/GB overage)" />
                          <FeatureItem text="10,000,000 requests / month" />
                          <FeatureItem text="5,000 Concurrent WebSockets" />
                          <FeatureItem text="Point-in-Time Recovery" />
                          <FeatureItem text="Priority VIP Support" />
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
                                                  {sessionLoading ? 'Initializing UPI...' : 'Direct UPI Transfer'}
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
  
                              {checkoutMethod === 'upi' && (
                                  <div className="flex flex-col gap-4 py-2">
                                      {sessionStatus === 'completed' && (
                                          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                              <div className="p-4 rounded-full bg-green-500/10 text-green-500 animate-bounce">
                                                  <Check className="h-12 w-12" />
                                              </div>
                                              <div className="space-y-2">
                                                  <h3 className="text-xl font-bold text-foreground">Payment Received!</h3>
                                                  <p className="text-sm text-muted-foreground max-w-xs">
                                                      We've automatically verified your UPI transfer. Upgrading your account and redirecting to your dashboard...
                                                  </p>
                                              </div>
                                          </div>
                                      )}

                                      {sessionStatus === 'expired' && (
                                          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                                              <div className="p-4 rounded-full bg-destructive/10 text-destructive">
                                                  <AlertCircle className="h-10 w-10" />
                                              </div>
                                              <div className="space-y-1.5">
                                                  <h3 className="text-lg font-bold text-foreground">Checkout Session Expired</h3>
                                                  <p className="text-xs text-muted-foreground max-w-xs">
                                                      For safety, payment sessions expire after 5 minutes. Please regenerate the QR code to proceed.
                                                  </p>
                                              </div>
                                              <div className="flex gap-2 w-full pt-2">
                                                  <Button
                                                      variant="outline"
                                                      onClick={() => setCheckoutMethod('choose')}
                                                      className="w-1/3"
                                                  >
                                                      Back
                                                  </Button>
                                                  <Button
                                                      onClick={() => startUpiSession(selectedPlan.name)}
                                                      className="w-2/3 bg-primary text-primary-foreground font-bold"
                                                  >
                                                      Regenerate QR Code
                                                  </Button>
                                              </div>
                                          </div>
                                      )}

                                      {sessionStatus === 'pending' && (
                                          <>
                                              {/* Countdown Timer */}
                                              <div className="flex justify-between items-center bg-muted/30 border border-border px-3 py-2 rounded-lg text-xs">
                                                  <span className="text-muted-foreground">Session Expiration:</span>
                                                  <span className={`font-mono font-bold px-2 py-0.5 rounded ${timeLeft < 60 ? 'bg-destructive/10 text-destructive animate-pulse' : 'bg-primary/10 text-primary'}`}>
                                                      {(() => {
                                                          const m = Math.floor(timeLeft / 60);
                                                          const s = timeLeft % 60;
                                                          return `${m}:${s < 10 ? '0' : ''}${s}`;
                                                      })()}
                                                  </span>
                                              </div>

                                              {/* QR Code and Instructions */}
                                              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-muted/20">
                                                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                      <QrCode className="h-4 w-4" /> Scan QR to Pay
                                                  </p>
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img
                                                      src={qrCodeUrl}
                                                      alt="UPI QR Code"
                                                      className="bg-white p-2.5 rounded-md shadow-md border border-border"
                                                  />
                                                  
                                                  {/* Mobile Direct Pay Link */}
                                                  <a
                                                      href={upiString}
                                                      className="mt-3.5 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex items-center gap-1.5 md:hidden"
                                                  >
                                                      <Smartphone className="h-3.5 w-3.5" /> Tap to Pay via UPI App
                                                  </a>
                                              </div>

                                              {/* Payment Details */}
                                              <div className="space-y-2.5 text-sm border-t border-border pt-4">
                                                  <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded border border-border/50">
                                                      <span className="text-xs text-muted-foreground">UPI ID (VPA):</span>
                                                      <div className="flex items-center gap-1.5">
                                                          <code className="text-xs font-bold bg-background px-1.5 py-0.5 rounded border border-border text-foreground">{upiMerchantVpa}</code>
                                                          <button 
                                                              onClick={() => copyToClipboard(upiMerchantVpa)} 
                                                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                          >
                                                              <Copy className="h-3.5 w-3.5" />
                                                          </button>
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="flex flex-col gap-1 bg-primary/5 border border-primary/20 p-3 rounded-lg">
                                                      <div className="flex justify-between items-center text-xs">
                                                          <span className="text-muted-foreground">Amount Payable:</span>
                                                          <span className="text-lg font-extrabold text-primary">₹{sessionAmount}</span>
                                                      </div>
                                                      <p className="text-[10px] text-muted-foreground leading-tight mt-1">
                                                          {isPersonalVpa 
                                                              ? "⚠️ IMPORTANT: Please pay exactly this decimal amount manually in your UPI app to match your session automatically!"
                                                              : "The unique decimal amount will be prefilled automatically."}
                                                      </p>
                                                  </div>
                                              </div>

                                              {/* Action / Back Button */}
                                              <div className="flex gap-2 border-t border-border pt-4">
                                                  <Button
                                                      variant="outline"
                                                      onClick={() => setCheckoutMethod('choose')}
                                                      className="w-full"
                                                  >
                                                      Back
                                                  </Button>
                                              </div>

                                              {/* Collapsible UTR Fallback Verification */}
                                              <div className="border-t border-border pt-3">
                                                  <button
                                                      type="button"
                                                      onClick={() => setShowUtrFallback(!showUtrFallback)}
                                                      className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 w-full text-center"
                                                  >
                                                      {showUtrFallback ? 'Hide manual verification' : 'Having issues? Verify manually using UTR'}
                                                  </button>

                                                  {showUtrFallback && (
                                                      <div className="mt-3 p-3 rounded-lg border border-dashed border-border space-y-3 bg-muted/10 animate-in slide-in-from-top-2 duration-200">
                                                          <div>
                                                              <label className="text-[10px] font-bold text-foreground block mb-1">
                                                                  Enter 12-Digit UPI Ref No / UTR:
                                                              </label>
                                                              <Input
                                                                  type="text"
                                                                  placeholder="e.g. 612345678901"
                                                                  value={utr}
                                                                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').substring(0, 12))}
                                                                  className="bg-input border-border text-foreground focus:ring-primary h-8 text-xs"
                                                              />
                                                          </div>
                                                          <Button
                                                              onClick={handleUtrVerification}
                                                              disabled={isVerifying || utr.length !== 12}
                                                              className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs h-8 font-bold flex items-center justify-center gap-1"
                                                          >
                                                              {isVerifying ? 'Verifying...' : 'Verify Manually'}
                                                          </Button>
                                                      </div>
                                                  )}
                                              </div>
                                          </>
                                      )}
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

