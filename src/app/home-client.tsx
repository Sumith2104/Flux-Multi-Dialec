'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    Database,
    Zap,
    BrainCircuit,
    Code,
    Table as TableIcon,
    Layout,
    ArrowRight,
    CheckCircle2,
    Github,
    Twitter
} from 'lucide-react';
import { motion } from 'framer-motion';

import Aurora from '@/components/Aurora';
import Navbar from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LoginDialog = dynamic(() => import('@/components/auth/login-dialog').then(mod => mod.LoginDialog), {
    ssr: false,
    loading: () => <Button variant="ghost">Login</Button>
});
const SignupDialog = dynamic(() => import('@/components/auth/signup-dialog').then(mod => mod.SignupDialog), {
    ssr: false,
    loading: () => <Button>Sign Up</Button>
});

export default function Home() {
    const [colors, setColors] = useState(['#111111', '#FF4B29', '#111111']);
    const [loginOpen, setLoginOpen] = useState(false);
    const [signupOpen, setSignupOpen] = useState(false);

    useEffect(() => {
        const getRandomColor = () => {
            const letters = '0123456789ABCDEF';
            let color = '#';
            for (let i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        };

        const randomColors = [getRandomColor(), getRandomColor(), getRandomColor()];
        setColors(randomColors);
    }, []);

    const openSignup = () => {
        setLoginOpen(false);
        setSignupOpen(true);
    }

    const openLogin = () => {
        setSignupOpen(false);
        setLoginOpen(true);
    }

    const fadeIn = {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6 }
    };

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">
            <Navbar>
                <LoginDialog
                    isGhost={true}
                    open={loginOpen}
                    onOpenChange={setLoginOpen}
                    onSwitchToSignup={openSignup}
                />
                <SignupDialog
                    open={signupOpen}
                    onOpenChange={setSignupOpen}
                    onSwitchToLogin={openLogin}
                />
            </Navbar>

            {/* Hero Section */}
            <section className="relative h-screen flex items-center justify-center pt-20 overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <Aurora
                        colorStops={colors}
                        amplitude={0.5}
                        blend={0.5}
                        speed={0.5}
                    />
                </div>
                <div className="relative z-10 text-center space-y-8 max-w-4xl mx-auto px-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4"
                    >
                        <Zap className="h-3 w-3" />
                        <span>v1.0 is now live</span>
                    </motion.div>
                    <motion.h1
                        {...fadeIn}
                        className="text-6xl font-bold tracking-tight sm:text-7xl md:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50"
                    >
                        Data Management <br />
                        <span className="text-primary">Redefined.</span>
                    </motion.h1>
                    <motion.p
                        {...fadeIn}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto"
                    >
                        The modern, AI-powered spreadsheet and data analysis tool. Manage projects, create tables, and unlock insights with natural language queries.
                    </motion.p>
                    <motion.div
                        {...fadeIn}
                        transition={{ delay: 0.4 }}
                        className="flex flex-col sm:flex-row justify-center gap-4 pt-4"
                    >
                        <Button size="lg" className="rounded-full h-12 px-8 text-base group" onClick={() => setSignupOpen(true)}>
                            Get Started Free
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                        <Button variant="outline" size="lg" className="rounded-full h-12 px-8 text-base" onClick={() => setLoginOpen(true)}>
                            Sign In
                        </Button>
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 px-4 bg-background relative z-10">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center space-y-4 mb-16">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Built for Developers</h2>
                        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                            Everything you need to manage complex datasets without the overhead of a traditional database administrator.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[
                            {
                                title: "AI SQL Assistant",
                                description: "Convert natural language into complex SQL queries instantly. No more memorizing syntax.",
                                icon: <BrainCircuit className="h-6 w-6 text-primary" />,
                                delay: 0
                            },
                            {
                                title: "Spreadsheet Interface",
                                description: "Familiar Excel-like grid for lightning fast data entry and bulk editing operations.",
                                icon: <TableIcon className="h-6 w-6 text-primary" />,
                                delay: 0.1
                            },
                            {
                                title: "Instant API Gen",
                                description: "Automatically generate REST endpoints for every table you create. Ready for production.",
                                icon: <Code className="h-6 w-6 text-primary" />,
                                delay: 0.2
                            },
                            {
                                title: "Visual Database",
                                description: "Automatically generated ERD diagrams that update in real-time as your schema evolves.",
                                icon: <Database className="h-6 w-6 text-primary" />,
                                delay: 0.3
                            },
                            {
                                title: "Mock Storage",
                                description: "Manage related files and folders directly alongside your tabular data in one place.",
                                icon: <Layout className="h-6 w-6 text-primary" />,
                                delay: 0.4
                            },
                            {
                                title: "Cloud Native",
                                description: "Built for the modern web with real-time sync and seamless cloud storage.",
                                icon: <Zap className="h-6 w-6 text-primary" />,
                                delay: 0.5
                            }
                        ].map((feature, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: feature.delay }}
                            >
                                <Card className="h-full bg-card/50 border-border/50 hover:border-primary/50 transition-colors group">
                                    <CardHeader>
                                        <div className="p-3 rounded-lg bg-background w-fit mb-4 group-hover:scale-110 transition-transform">
                                            {feature.icon}
                                        </div>
                                        <CardTitle>{feature.title}</CardTitle>
                                        <CardDescription className="text-base pt-2">
                                            {feature.description}
                                        </CardDescription>
                                    </CardHeader>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}


            {/* Footer */}
            <footer className="py-12 border-t border-border/50 px-4">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2">
                        <Database className="h-6 w-6 text-primary" />
                        <span className="font-bold text-xl">Fluxbase</span>
                    </div>
                    <div className="flex gap-8 text-sm text-muted-foreground">
                        <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
                        <Link href="#" className="hover:text-primary transition-colors">Terms</Link>
                        <Link href="#" className="hover:text-primary transition-colors">Documentation</Link>
                        <Link href="#" className="hover:text-primary transition-colors">Contact</Link>
                    </div>
                    <div className="flex gap-4">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <Github className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <Twitter className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
                <div className="text-center text-xs text-muted-foreground mt-12">
                    © {new Date().getFullYear()} Fluxbase Inc. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
