"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword } from "firebase/auth";
import { Github } from "lucide-react";

interface SignupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSwitchToLogin: () => void;
}

export function SignupDialog({ open, onOpenChange, onSwitchToLogin }: SignupDialogProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState("");

    async function handleGoogleSignup() {
        setIsLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const idToken = await result.user.getIdToken();

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, type: 'signup' }),
            });

            const data = await response.json();

            if (response.ok) {
                onOpenChange(false);
                router.push('/dashboard/projects');
                router.refresh();
            } else {
                throw new Error(data.error || 'Failed to create session');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Signup Failed',
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleEmailSignup(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsLoading(true);
        const formData = new FormData(event.currentTarget);
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const name = formData.get('name') as string;

        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            const idToken = await result.user.getIdToken();

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, type: 'signup', displayName: name }),
            });

            const data = await response.json();

            if (response.ok) {
                onOpenChange(false);
                router.push('/dashboard/projects');
                router.refresh();
            } else {
                throw new Error(data.error || 'Failed to create session');
            }
        } catch (error: any) {
            let message = error.message;
            if (error.code === 'auth/email-already-in-use') message = 'Email already in use. Please Log In.';

            toast({
                variant: 'destructive',
                title: 'Signup Failed',
                description: message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button>Sign Up</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md backdrop-blur-3xl bg-white/5 border-white/10 shadow-2xl !rounded-[40px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Create an account</DialogTitle>
                    <DialogDescription className="text-muted-foreground/90 text-base">
                        Enter your email below to create your account
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Button variant="outline" onClick={handleGoogleSignup} disabled={isLoading} className="border-white/10 hover:bg-white/5 hover:text-white transition-colors">
                            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.17c-.22-.66-.35-1.36-.35-2.17s.13-1.51.35-2.17V7.01H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.99l3.66-2.82z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.01l3.66 2.82c.87-2.6 3.3-4.45 6.16-4.45z" fill="#EA4335" />
                            </svg>
                            Google
                        </Button>
                        <Button variant="outline" disabled={isLoading} className="border-white/10 hover:bg-white/5 hover:text-white transition-colors">
                            <Github className="mr-2 h-4 w-4" />
                            GitHub
                        </Button>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-transparent px-2 text-muted-foreground/90 font-medium">Or continue with</span>
                        </div>
                    </div>
                    <form onSubmit={handleEmailSignup} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="signup-name" className="text-foreground/90">Name</Label>
                            <Input
                                id="signup-name"
                                name="name"
                                type="text"
                                placeholder="John Doe"
                                required
                                className="border-white/10 bg-black/40 focus-visible:ring-2 focus-visible:ring-orange-500 placeholder:text-muted-foreground/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-email" className="text-foreground/90">Email</Label>
                            <Input
                                id="signup-email"
                                name="email"
                                type="email"
                                placeholder="m@example.com"
                                required
                                className="border-white/10 bg-black/40 focus-visible:ring-2 focus-visible:ring-orange-500 placeholder:text-muted-foreground/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="signup-password" className="text-foreground/90">Password</Label>
                            <PasswordInput
                                id="signup-password"
                                name="password"
                                required
                                className="border-white/10 bg-black/40 focus-visible:ring-2 focus-visible:ring-orange-500"
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <PasswordStrength password={password} />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Creating Account...' : 'Sign Up'}
                        </Button>
                    </form>
                    <div className="text-center text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <span onClick={onSwitchToLogin} className="cursor-pointer text-primary hover:underline">
                            Login
                        </span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
