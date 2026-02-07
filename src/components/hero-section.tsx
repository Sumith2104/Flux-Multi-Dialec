"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
    return (
        <section className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-black pt-20">
            {/* Background Gradients */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/40 via-background to-background pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-purple-600/10 blur-[100px] rounded-[100%] pointer-events-none" />

            {/* Content */}
            <div className="relative z-10 container px-4 md:px-6 flex flex-col items-center text-center space-y-8">

                {/* Badge */}
                <div className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-500 backdrop-blur-sm">
                    <Sparkles className="mr-1 h-3 w-3" />
                    <span>v1.0 is now live</span>
                </div>

                {/* Headline */}
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-white max-w-4xl">
                    Data Management{" "}
                    <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                        Redefined.
                    </span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                    The modern, AI-powered spreadsheet and data analysis tool. Manage projects, create tables, and unlock insights with natural language queries.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                    <Button asChild size="lg" className="h-12 rounded-full px-8 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:from-orange-400 hover:to-orange-500 transition-all">
                        <Link href="/dashboard">
                            Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="h-12 rounded-full px-8 border-zinc-800 bg-black/50 text-zinc-300 hover:bg-zinc-900 hover:text-white backdrop-blur-sm">
                        <Link href="/login">
                            Sign In
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}
