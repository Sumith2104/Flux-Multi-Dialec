'use client';
import { useState } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const [discountCode, setDiscountCode] = useState('');
    const [isDiscountApplied, setIsDiscountApplied] = useState(false);

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

    const handleUpgrade = async (planId: string, planName: string) => {
        setLoadingPlan(planName);
        try {
            // 1. Create the subscription via backend securely
            const res = await fetch('/api/subscriptions/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId })
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
                description: `${planName} Subscription`,
                handler: function (response: any) {
                    toast({
                        title: 'Payment Successful! 🎉',
                        description: `You are now subscribed to the ${planName} plan. Restarting session...`
                    });
                    setTimeout(() => router.push('/dashboard'), 2000);
                },
                theme: { color: '#000000' }
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

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center py-20 px-4">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

            <div className="text-center max-w-3xl mb-16 space-y-4">
                <h1 className="text-5xl font-extrabold tracking-tight lg:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-500">
                    Scale Your Database.
                </h1>
                <p className="text-xl text-gray-400">
                    From hobby projects to enterprise performance, choose the database power you actually need without unpredictable bills.
                </p>
                {process.env.NEXT_PUBLIC_ENABLE_DISCOUNT === 'true' && (
                    <div className="flex justify-center items-center space-x-2 mt-6">
                        <input
                            type="text"
                            placeholder="Have a promo code?"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value)}
                            className="bg-zinc-900 border border-zinc-700 text-white px-4 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 uppercase"
                            disabled={isDiscountApplied}
                        />
                        <Button
                            variant="secondary"
                            onClick={checkDiscount}
                            disabled={isDiscountApplied || !discountCode}
                            className="bg-zinc-800 text-white hover:bg-zinc-700"
                        >
                            {isDiscountApplied ? 'Applied ✓' : 'Apply'}
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
                {/* FREE TIER */}
                <Card className="bg-zinc-950 border-zinc-800 flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-2xl text-white">Free</CardTitle>
                        <CardDescription>Perfect for side projects and learning.</CardDescription>
                        <div className="mt-4">
                            <span className="text-4xl font-bold text-white">₹0</span>
                            <span className="text-zinc-500"> / month</span>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4 text-zinc-300">
                        <FeatureItem text="1 Database Project" />
                        <FeatureItem text="500 MB Storage limit" />
                        <FeatureItem text="50,000 requests / month" />
                        <FeatureItem text="100 Concurrent WebSockets" />
                        <FeatureItem text="Community Support" />
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full text-white border-zinc-700 hover:bg-zinc-800" onClick={() => router.push('/dashboard')}>
                            Get Started
                        </Button>
                    </CardFooter>
                </Card>

                {/* PRO TIER */}
                <Card className="bg-zinc-900 border-zinc-700 relative flex flex-col scale-105 shadow-2xl shadow-white/5">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white text-black px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        Most Popular
                    </div>
                    <CardHeader>
                        <CardTitle className="text-2xl text-white">Pro</CardTitle>
                        <CardDescription>Advanced capacity for production apps.</CardDescription>
                        <div className="mt-4 flex items-end space-x-2">
                            {isDiscountApplied ? (
                                <>
                                    <span className="text-4xl font-bold text-green-400">₹{process.env.NEXT_PUBLIC_DISCOUNT_PRO_PRICE || '299'}</span>
                                    <span className="text-xl text-zinc-600 line-through">₹{process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '499'}</span>
                                </>
                            ) : (
                                <span className="text-4xl font-bold text-white">₹{process.env.NEXT_PUBLIC_RAZORPAY_PRO_PRICE || '499'}</span>
                            )}
                            <span className="text-zinc-400 mb-1"> / month</span>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4 text-zinc-200">
                        <FeatureItem text="Up to 3 Database Projects" />
                        <FeatureItem text="8 GB Storage (₹10/GB overage)" />
                        <FeatureItem text="2,000,000 requests / month" />
                        <FeatureItem text="500 Concurrent WebSockets" />
                        <FeatureItem text="7-day automated backups" />
                        <FeatureItem text="Standard Email Support" />
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full bg-white text-black hover:bg-gray-200 font-semibold"
                            onClick={() => handleUpgrade(process.env.NEXT_PUBLIC_RAZORPAY_PRO_PLAN_ID || '', 'Pro')}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === 'Pro' ? 'Processing...' : 'Upgrade to Pro'}
                        </Button>
                    </CardFooter>
                </Card>

                {/* MAX TIER */}
                <Card className="bg-zinc-950 border-zinc-800 flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-2xl text-white">Max</CardTitle>
                        <CardDescription>Scale limitlessly with dedicated power.</CardDescription>
                        <div className="mt-4 flex items-end space-x-2">
                            {isDiscountApplied ? (
                                <>
                                    <span className="text-4xl font-bold text-green-400">₹{process.env.NEXT_PUBLIC_DISCOUNT_MAX_PRICE || '1499'}</span>
                                    <span className="text-xl text-zinc-600 line-through">₹{process.env.NEXT_PUBLIC_RAZORPAY_MAX_PRICE || '2499'}</span>
                                </>
                            ) : (
                                <span className="text-4xl font-bold text-white">₹{process.env.NEXT_PUBLIC_RAZORPAY_MAX_PRICE || '2,499'}</span>
                            )}
                            <span className="text-zinc-500 mb-1"> / month</span>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4 text-zinc-300">
                        <FeatureItem text="Unlimited Database Projects" />
                        <FeatureItem text="50 GB Storage (₹10/GB overage)" />
                        <FeatureItem text="10,000,000 requests / month" />
                        <FeatureItem text="5,000 Concurrent WebSockets" />
                        <FeatureItem text="Point-in-Time Recovery" />
                        <FeatureItem text="Priority VIP Support" />
                    </CardContent>
                    <CardFooter>
                        <Button
                            variant="outline"
                            className="w-full text-white border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleUpgrade(process.env.NEXT_PUBLIC_RAZORPAY_MAX_PLAN_ID || '', 'Max')}
                            disabled={loadingPlan !== null}
                        >
                            {loadingPlan === 'Max' ? 'Processing...' : 'Upgrade to Max'}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
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
