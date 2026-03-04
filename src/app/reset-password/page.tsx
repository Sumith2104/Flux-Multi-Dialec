"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPasswordAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    // Read secure token from email URL parameters
    const token = searchParams?.get("token");
    const email = searchParams?.get("email");

    const [isLoading, setIsLoading] = useState(false);

    if (!token || !email) {
        return (
            <div className="text-center space-y-4">
                <p className="text-red-400 font-medium">Invalid or missing reset token.</p>
                <Button onClick={() => router.push('/')} variant="outline" className="border-white/10 hover:bg-white/5 text-white">
                    Return to Login
                </Button>
            </div>
        );
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsLoading(true);
        const formData = new FormData(event.currentTarget);
        formData.append("token", token!);
        formData.append("email", email!);

        const password = formData.get("password") as string;
        const confirmResult = formData.get("confirmPassword") as string;

        if (password !== confirmResult) {
            toast({
                variant: 'destructive',
                title: 'Passwords do not match',
                description: 'Please ensure both passwords are identically typed.',
            });
            setIsLoading(false);
            return;
        }

        try {
            const result = await resetPasswordAction(formData);

            if (result.success) {
                toast({
                    title: 'Password Reset Successful',
                    description: 'Your password has been securely updated. You are now logged in!',
                });
                router.push('/dashboard/projects');
                router.refresh(); // Refresh context for auth
            } else {
                throw new Error(result.error || 'Failed to reset password');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Secure Reset Failed',
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 w-full max-w-sm mx-auto text-left">
            <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground/90 ml-1">New Password</Label>
                <PasswordInput
                    id="password"
                    name="password"
                    required
                    className="border-white/10 bg-black/40 focus-visible:ring-2 focus-visible:ring-orange-500 py-6"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground/90 ml-1">Confirm Password</Label>
                <PasswordInput
                    id="confirmPassword"
                    name="confirmPassword"
                    required
                    className="border-white/10 bg-black/40 focus-visible:ring-2 focus-visible:ring-orange-500 py-6"
                />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 mt-4" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Encrypting & Resetting...' : 'Update Password'}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-6">
                Back to <span onClick={() => router.push('/')} className="text-primary hover:underline cursor-pointer">Login</span>
            </p>
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md p-8 sm:p-10 backdrop-blur-3xl bg-white/5 border border-white/10 shadow-2xl rounded-[40px] text-center">
                <h1 className="text-3xl font-bold mb-3 text-white">Reset Password</h1>
                <p className="text-muted-foreground mb-8 text-sm">Choose a new, secure password for your Fluxbase account.</p>
                <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />}>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </div>
    );
}
