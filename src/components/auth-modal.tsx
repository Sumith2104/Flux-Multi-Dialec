"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { Github } from "lucide-react";

interface AuthModalProps {
    children: React.ReactNode;
    defaultTab?: "login" | "signup";
}

export function AuthModal({ children, defaultTab = "login" }: AuthModalProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const [showForgotPass, setShowForgotPass] = useState(false);

    async function handleGoogleLogin(type: "login" | "signup" = "login") {
        setIsLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const idToken = await result.user.getIdToken();

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, type }),
            });

            const data = await response.json();

            if (response.ok) {
                setIsOpen(false);
                router.push('/dashboard/projects');
                router.refresh();
            } else {
                throw new Error(data.error || 'Failed to create session');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Authentication Failed',
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleEmailAuth(event: React.FormEvent<HTMLFormElement>, type: "login" | "signup") {
        event.preventDefault();
        setIsLoading(true);
        const formData = new FormData(event.currentTarget);
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const name = formData.get('name') as string; // Only for signup

        try {
            let result;
            if (type === 'signup') {
                result = await createUserWithEmailAndPassword(auth, email, password);
            } else {
                result = await signInWithEmailAndPassword(auth, email, password);
            }

            const idToken = await result.user.getIdToken();
            const body: any = { idToken, type };
            if (type === 'signup' && name) body.displayName = name;

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (response.ok) {
                setIsOpen(false);
                router.push('/dashboard/projects');
                router.refresh();
            } else {
                throw new Error(data.error || 'Failed to create session');
            }
        } catch (error: any) {
            // Firebase errors (e.g. auth/email-already-in-use) need to be caught here too
            let message = error.message;
            if (error.code === 'auth/email-already-in-use') message = 'Email already in use. Please Log In.';
            if (error.code === 'auth/user-not-found') message = 'No account found with this email.';
            if (error.code === 'auth/wrong-password') message = 'Invalid password.';

            toast({
                variant: 'destructive',
                title: type === 'login' ? 'Login Failed' : 'Signup Failed',
                description: message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleForgotPass(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsLoading(true);
        const formData = new FormData(event.currentTarget);
        const email = formData.get('email') as string;

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Reset Link Sent',
                    description: 'Check your email for instructions to reset your password.',
                });
                setShowForgotPass(false);
            } else {
                throw new Error(data.error || 'Failed to send reset link');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Request Failed',
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    // Reset state when modal closes
    const onOpenChangeWrapper = (open: boolean) => {
        setIsOpen(open);
        if (!open) {
            setTimeout(() => setShowForgotPass(false), 300); // Reset after animation
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChangeWrapper}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold tracking-tight">
                        {showForgotPass ? 'Reset Password' : 'Welcome to Fluxbase'}
                    </DialogTitle>
                    <DialogDescription>
                        {showForgotPass
                            ? 'Enter your email to receive a password reset link.'
                            : 'Sign in to manage your projects and queries.'}
                    </DialogDescription>
                </DialogHeader>

                {showForgotPass ? (
                    <div className="space-y-4 pt-4">
                        <form onSubmit={handleForgotPass} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="reset-email">Email</Label>
                                <Input id="reset-email" name="email" type="email" placeholder="m@example.com" required className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
                            </div>
                            <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white" disabled={isLoading}>
                                {isLoading ? 'Sending Link...' : 'Send Reset Link'}
                            </Button>
                            <Button variant="ghost" type="button" onClick={() => setShowForgotPass(false)} className="w-full text-zinc-400 hover:text-white" disabled={isLoading}>
                                Back to Login
                            </Button>
                        </form>
                    </div>
                ) : (
                    <Tabs defaultValue={defaultTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-white/5">
                            <TabsTrigger value="login">Login</TabsTrigger>
                            <TabsTrigger value="signup">Sign Up</TabsTrigger>
                        </TabsList>

                        {/* LOGIN CONTENT */}
                        <TabsContent value="login" className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Button variant="outline" onClick={() => handleGoogleLogin('login')} disabled={isLoading} className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white">
                                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.17c-.22-.66-.35-1.36-.35-2.17s.13-1.51.35-2.17V7.01H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.99l3.66-2.82z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.01l3.66 2.82c.87-2.6 3.3-4.45 6.16-4.45z" fill="#EA4335" />
                                    </svg>
                                    Google
                                </Button>
                                <Button variant="outline" disabled={isLoading} className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white">
                                    <Github className="mr-2 h-4 w-4" />
                                    GitHub
                                </Button>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-white/10" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-black/80 px-2 text-muted-foreground backdrop-blur-xl">Or continue with</span>
                                </div>
                            </div>

                            <form onSubmit={(e) => handleEmailAuth(e, 'login')} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" name="email" type="email" placeholder="m@example.com" required className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="password">Password</Label>
                                        <span onClick={() => setShowForgotPass(true)} className="text-xs text-muted-foreground hover:text-orange-500 cursor-pointer transition-colors">Forgot?</span>
                                    </div>
                                    <Input id="password" name="password" type="password" required className="bg-white/5 border-white/10 text-white" />
                                </div>
                                <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white" disabled={isLoading}>
                                    {isLoading ? 'Logging in...' : 'Login'}
                                </Button>
                            </form>
                        </TabsContent>

                        {/* SIGNUP CONTENT */}
                        <TabsContent value="signup" className="space-y-4 pt-4">
                            <form onSubmit={(e) => handleEmailAuth(e, 'signup')} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input id="name" name="name" type="text" placeholder="John Doe" required className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="signup-email">Email</Label>
                                    <Input id="signup-email" name="email" type="email" placeholder="m@example.com" required className="bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="signup-password">Password</Label>
                                    <Input id="signup-password" name="password" type="password" required className="bg-white/5 border-white/10 text-white" />
                                </div>
                                <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white" disabled={isLoading}>
                                    {isLoading ? 'Creating Account...' : 'Sign Up'}
                                </Button>
                                <Button variant="outline" onClick={() => handleGoogleLogin('signup')} disabled={isLoading} className="w-full bg-white/5 border-white/10 hover:bg-white/10 hover:text-white mt-2">
                                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.17c-.22-.66-.35-1.36-.35-2.17s.13-1.51.35-2.17V7.01H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.99l3.66-2.82z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.01l3.66 2.82c.87-2.6 3.3-4.45 6.16-4.45z" fill="#EA4335" />
                                    </svg>
                                    Sign up with Google
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    );
}
