'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Settings, Key, Webhook, Bot, Activity } from 'lucide-react';
import { BackButton } from "@/components/back-button";

const sidebarNavItems = [
    {
        title: "General",
        href: "/settings",
        icon: Settings,
    },
    {
        title: "API Keys",
        href: "/settings/api-keys",
        icon: Key,
    },
    {
        title: "Webhooks",
        href: "/settings/webhooks",
        icon: Webhook,
    },
    {
        title: "Limits & Alerts",
        href: "/settings/limits",
        icon: Activity,
    },
    {
        title: "AI Assistant",
        href: "/settings/ai",
        icon: Bot,
    },
    {
        title: "Documentation",
        href: "/settings/docs",
        icon: Activity,
    },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-16">
            <div className="flex items-center gap-4">
                <BackButton />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground">
                        Manage your workspace, API keys, integrations, and preferences.
                    </p>
                </div>
            </div>
            
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <aside className="lg:w-1/4">
                    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 overflow-x-auto pb-2 lg:pb-0 hide-scrollbar">
                        {sidebarNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted hover:text-foreground flex-shrink-0 whitespace-nowrap",
                                        isActive ? "bg-muted text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.title}
                                </Link>
                            )
                        })}
                    </nav>
                </aside>
                <div className="flex-1 lg:max-w-3xl">{children}</div>
            </div>
        </div>
    );
}
