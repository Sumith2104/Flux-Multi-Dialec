"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { Database } from "lucide-react";

/**
 * Navbar Component
 * 
 * A responsive, glassmorphic navigation bar designed to be pinned to the top of the viewport.
 * Features:
 * - Brand logo and name
 * - Navigation links for landing page sections (Features)
 * - External link to documentation
 * - Children slot for dynamic content (like Login/Signup buttons)
 */
export default function Navbar({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl">
            <div className="flex items-center justify-between px-6 py-3 rounded-full backdrop-blur-xl bg-background/40 border border-white/10 shadow-2xl">
                {/* Logo + Brand */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="bg-primary/20 p-1.5 rounded-lg group-hover:bg-primary/30 transition-colors">
                        <Database className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                        Fluxbase
                    </span>
                </Link>

                {/* Nav Links & Actions */}
                <div className="flex items-center gap-6 text-sm font-medium">
                    <div className="hidden sm:flex items-center gap-6">
                        <Link
                            href="/#features"
                            className={`transition-colors ${pathname === "/#features"
                                ? "text-primary"
                                : "text-muted-foreground hover:text-primary"
                                }`}
                        >
                            Features
                        </Link>

                        <Link
                            href="https://github.com"
                            target="_blank"
                            className="text-muted-foreground hover:text-primary transition-colors"
                        >
                            Docs
                        </Link>
                    </div>

                    {/* Vertical Separator */}
                    <div className="hidden sm:block h-6 w-px bg-white/10 mx-2"></div>

                    {/* Authentication Actions / Children */}
                    <div className="flex items-center gap-2">
                        {children}
                    </div>
                </div>
            </div>
        </nav>
    );
}
