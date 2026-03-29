'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Database, Shield, GitBranch } from 'lucide-react';

export default function DatabaseLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('projectId');
    
    const navItems = [
        {
            title: "ER Diagram",
            href: "/database",
            icon: Database,
        },
        {
            title: "Row Level Security",
            href: "/database/rls",
            icon: Shield,
        },
        {
            title: "Migrations",
            href: "/database/migrations",
            icon: GitBranch,
        },
    ];

    return (
        <div className="flex flex-col h-full">
            <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center gap-4 px-4">
                    <nav className="flex items-center gap-6 text-sm font-medium">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            // Exact match check for root /database
                            const isActive = pathname === item.href;
                            const href = projectId ? `${item.href}?projectId=${projectId}` : item.href;

                            return (
                                <Link
                                    key={item.href}
                                    href={href}
                                    className={cn(
                                        "flex items-center gap-2 transition-colors hover:text-foreground/80 relative py-4",
                                        isActive ? "text-foreground" : "text-foreground/60"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.title}
                                    {isActive && (
                                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
                <div className="w-full h-full">
                    {children}
                </div>
            </div>
        </div>
    );
}
