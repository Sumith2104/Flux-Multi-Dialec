'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Check, Copy, Smartphone, AlertCircle, QrCode, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';

function CheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const sessionId = searchParams.get('sessionId');

    // Checkout Details States
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState<number | null>(null);
    const [planType, setPlanType] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [status, setStatus] = useState<'pending' | 'completed' | 'expired' | null>(null);
    const [upiMerchantVpa, setUpiMerchantVpa] = useState<string>('sumith0909@axl');

    // Live Flow States
    const [timeLeft, setTimeLeft] = useState<number>(300);
    const [showUtrFallback, setShowUtrFallback] = useState(false);
    const [utr, setUtr] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Load session details
    useEffect(() => {
        if (!sessionId) {
            toast({
                variant: 'destructive',
                title: 'Invalid Checkout Url',
                description: 'Could not load payment session details.'
            });
            setTimeout(() => router.push('/pricing'), 2000);
            return;
        }

        const fetchDetails = async () => {
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
                if (data.upiMerchantVpa) setUpiMerchantVpa(data.upiMerchantVpa);
                setLoading(false);
            } catch (err: any) {
                console.error(err);
                toast({
                    variant: 'destructive',
                    title: 'Error loading session',
                    description: err.message
                });
                setTimeout(() => router.push('/pricing'), 3000);
            }
        };

        fetchDetails();
    }, [sessionId, router, toast]);

    // WebSocket / Polling handlers
    useEffect(() => {
        if (loading || !sessionId || !expiresAt || status !== 'pending') {
            return;
        }

        // 1. Ticking Countdown
        const timer = setInterval(() => {
            const expiry = new Date(expiresAt).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, Math.floor((expiry - now) / 1000));
            setTimeLeft(diff);

            if (diff <= 0) {
                setStatus('expired');
                clearInterval(timer);
            }
        }, 1000);

        // 2. Real-Time WebSockets
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://fluxbase-realtime-2bcf.onrender.com';
        let socket: WebSocket | null = null;

        const connectWS = () => {
            try {
                socket = new WebSocket(wsUrl);

                socket.onopen = () => {
                    console.log('[Fluxpay WS] Connected to live verification channel');
                    socket?.send(JSON.stringify({
                        type: 'subscribe',
                        roomId: `payment_session_${sessionId}`
                    }));
                };

                socket.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'db_event' && msg.payload?.table === 'payment_sessions') {
                            const record = msg.payload.record;
                            if (record.id === parseInt(sessionId, 10) && record.status === 'completed') {
                                console.log('[Fluxpay WS] Payment match event received!');
                                setStatus('completed');
                                clearInterval(timer);
                                clearInterval(fallbackPoll);
                                if (socket) socket.close();

                                toast({
                                    title: 'Upgrade Successful!',
                                    description: 'Payment matches successfully! Redirecting...'
                                });
                                setTimeout(() => router.push('/dashboard'), 2000);
                            }
                        }
                    } catch (e) {
                        console.error('[Fluxpay WS] Parsing error:', e);
                    }
                };

                socket.onerror = (err) => {
                    console.warn('[Fluxpay WS] Encountered error, fallback active.', err);
                };

                socket.onclose = () => {
                    console.log('[Fluxpay WS] Realtime connection closed');
                };

            } catch (err) {
                console.error('[Fluxpay WS] Failed to create socket connection', err);
            }
        };

        connectWS();

        // 3. Fallback DB Polling (every 6 seconds)
        const fallbackPoll = setInterval(async () => {
            try {
                const res = await fetch(`/api/payments/check-session?sessionId=${sessionId}`);
                const data = await res.json();
                if (res.ok && data.success) {
                    if (data.status === 'completed') {
                        setStatus('completed');
                        clearInterval(timer);
                        clearInterval(fallbackPoll);
                        if (socket) {
                            try { socket.close(); } catch {}
                        }
                        toast({
                            title: 'Upgrade Successful!',
                            description: 'Payment verified successfully!'
                        });
                        setTimeout(() => router.push('/dashboard'), 2000);
                    } else if (data.status === 'expired') {
                        setStatus('expired');
                        clearInterval(timer);
                        clearInterval(fallbackPoll);
                        if (socket) {
                            try { socket.close(); } catch {}
                        }
                    }
                }
            } catch (err) {
                console.error('Error in fallback polling loop:', err);
            }
        }, 6000);

        return () => {
            clearInterval(timer);
            clearInterval(fallbackPoll);
            if (socket) {
                try { socket.close(); } catch {}
            }
        };
    }, [loading, sessionId, expiresAt, status, router, toast]);

    const handleCancelSession = async () => {
        if (status === 'completed') {
            router.push('/pricing');
            return;
        }
        const confirmCancel = window.confirm("Are you sure you want to go back? This will cancel your active payment session.");
        if (!confirmCancel) return;

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
        router.push('/pricing');
    };

    const handleManualUtrVerify = async () => {
        if (!utr || utr.length !== 12) return;
        setIsVerifying(true);
        try {
            const res = await fetch('/api/payments/verify-utr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    utr,
                    plan: planType,
                    sessionId
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
            setStatus('completed');
            setTimeout(() => router.push('/dashboard'), 2000);
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copied!',
            description: 'VPA copied to clipboard.'
        });
    };

    if (loading) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-semibold tracking-wide">Loading checkout details...</p>
            </div>
        );
    }

    const upiString = `upi://pay?pa=${upiMerchantVpa}&pn=Fluxbase&am=${amount}&cu=INR&tn=${encodeURIComponent(`${planType?.toUpperCase()} Plan Upgrade`)}`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiString)}`;

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-card/10 to-background px-4 text-foreground relative py-12">
            <div className="absolute top-6 left-6 sm:top-10 sm:left-10">
                <Button 
                    variant="ghost" 
                    onClick={handleCancelSession}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Pricing
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
                            <div className="p-5 rounded-full bg-green-500/10 text-green-500 animate-bounce">
                                <Check className="h-16 w-16" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black tracking-tight text-foreground">Payment Verified!</h3>
                                <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                                    Your account has been upgraded to <strong className="text-primary uppercase">{planType}</strong>. Redirecting you back to the main app dashboard...
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
                                    For security and uniqueness constraints, payment sessions expire in 5 minutes. No worries, click below to try again.
                                </p>
                            </div>
                            <CardFooter className="w-full flex gap-3 px-0 pb-0">
                                <Button
                                    variant="outline"
                                    onClick={() => router.push('/pricing')}
                                    className="w-1/3"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => router.refresh()}
                                    className="w-2/3 bg-primary text-primary-foreground font-bold hover:bg-primary/95"
                                >
                                    Try Again
                                </Button>
                            </CardFooter>
                        </CardContent>
                    )}

                    {status === 'pending' && (
                        <>
                            <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg font-bold">Upgrade to {planType?.toUpperCase()}</CardTitle>
                                    <CardDescription className="text-xs">Pay exactly the amount requested below.</CardDescription>
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
                                    <a
                                        href={upiString}
                                        className="mt-4 px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-black shadow-lg hover:bg-primary/95 transition-all flex items-center gap-1.5 md:hidden"
                                    >
                                        <Smartphone className="h-4 w-4" /> Open in UPI App
                                    </a>
                                </div>

                                {/* Pay details card */}
                                <div className="space-y-3">
                                    <div className="flex flex-col p-3.5 rounded-lg border border-primary/20 bg-primary/5 space-y-1 relative">
                                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Pay Exact Amount:</span>
                                        <span className="text-3xl font-black text-primary">₹{amount}</span>
                                        <p className="text-[10px] text-muted-foreground/80 leading-normal pt-1.5 border-t border-primary/10 mt-1">
                                            The exact unique decimal amount is pre-filled inside the QR code for instant verification.
                                        </p>
                                    </div>
                                </div>

                                {/* Custom Gateway Notice */}
                                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-medium leading-relaxed text-center">
                                    ⚡ This is a custom built payment gateway and some payments take up to 1 min. So if it takes too long, just enter your UTR manually.
                                </div>

                                {/* Manual Verification Fallback accordion */}
                                <div className="border-t border-border/60 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowUtrFallback(!showUtrFallback)}
                                        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 w-full text-center block"
                                    >
                                        {showUtrFallback ? 'Hide manual verification' : 'Having issues? Verify manually using UTR'}
                                    </button>

                                    {showUtrFallback && (
                                        <div className="mt-4 p-3.5 rounded-lg border border-dashed border-border space-y-3.5 bg-muted/5 animate-in slide-in-from-top-2 duration-200">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-foreground block">
                                                    Enter 12-Digit UPI Ref No / UTR:
                                                </label>
                                                <Input
                                                    type="text"
                                                    placeholder="e.g. 612345678901"
                                                    value={utr}
                                                    onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').substring(0, 12))}
                                                    className="bg-background border-border text-foreground focus:ring-primary h-9 text-xs"
                                                />
                                            </div>
                                            <Button
                                                onClick={handleManualUtrVerify}
                                                disabled={isVerifying || utr.length !== 12}
                                                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground text-xs h-9 font-bold flex items-center justify-center gap-1.5"
                                            >
                                                {isVerifying ? 'Verifying...' : 'Verify Manually'}
                                            </Button>
                                        </div>
                                    )}
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
