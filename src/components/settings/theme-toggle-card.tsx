'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggleCard() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Fallback to dark during SSR to avoid hydration layout shift
    const currentTheme = mounted ? (theme || 'dark') : 'dark';
    const isDark = currentTheme === 'dark';

    return (
        <Card className="lg:col-span-1">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        {isDark ? (
                            <Moon className="h-5 w-5 text-orange-400" />
                        ) : (
                            <Sun className="h-5 w-5 text-amber-500" />
                        )}
                        Appearance
                    </CardTitle>
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-[10px] uppercase font-bold tracking-wider font-mono",
                            isDark
                                ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-600"
                        )}
                    >
                        {isDark ? 'Dark Mode' : 'Light Mode'}
                    </Badge>
                </div>
                <CardDescription>
                    Choose between sleek dark charcoal and crisp clean white interface themes.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Instant Switch Row */}
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-secondary/30">
                    <div className="space-y-0.5">
                        <Label htmlFor="theme-switch" className="text-sm font-semibold cursor-pointer">
                            Dark Mode
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {isDark
                                ? "Dark theme active with high-contrast accents"
                                : "Toggle switch to return to dark mode"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Sun className={cn("h-4 w-4 transition-colors", !isDark ? "text-amber-500" : "text-muted-foreground/40")} />
                        <Switch
                            id="theme-switch"
                            checked={isDark}
                            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                            aria-label="Toggle Dark and Light theme"
                        />
                        <Moon className={cn("h-4 w-4 transition-colors", isDark ? "text-orange-400" : "text-muted-foreground/40")} />
                    </div>
                </div>

                {/* Visual Preview Tiles */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Light Mode Tile */}
                    <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={cn(
                            "group relative flex flex-col items-center justify-between p-3 rounded-lg border-2 transition-all text-left gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            !isDark
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border/60 hover:border-border hover:bg-muted/40"
                        )}
                    >
                        {!isDark && (
                            <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </span>
                        )}
                        <div className="w-full h-16 rounded border border-zinc-200 bg-white p-2 flex flex-col justify-between shadow-inner">
                            <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2 rounded-full bg-orange-500" />
                                <div className="h-1.5 w-12 rounded bg-zinc-200" />
                            </div>
                            <div className="space-y-1">
                                <div className="h-1.5 w-full rounded bg-zinc-100" />
                                <div className="h-1.5 w-3/4 rounded bg-zinc-100" />
                            </div>
                        </div>
                        <div className="w-full flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                                <Sun className="h-3.5 w-3.5 text-amber-500" />
                                <span>Light</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">White</span>
                        </div>
                    </button>

                    {/* Dark Mode Tile */}
                    <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={cn(
                            "group relative flex flex-col items-center justify-between p-3 rounded-lg border-2 transition-all text-left gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            isDark
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border/60 hover:border-border hover:bg-muted/40"
                        )}
                    >
                        {isDark && (
                            <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </span>
                        )}
                        <div className="w-full h-16 rounded border border-zinc-800 bg-zinc-950 p-2 flex flex-col justify-between shadow-inner">
                            <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2 rounded-full bg-orange-500" />
                                <div className="h-1.5 w-12 rounded bg-zinc-700" />
                            </div>
                            <div className="space-y-1">
                                <div className="h-1.5 w-full rounded bg-zinc-800" />
                                <div className="h-1.5 w-3/4 rounded bg-zinc-800" />
                            </div>
                        </div>
                        <div className="w-full flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                                <Moon className="h-3.5 w-3.5 text-orange-400" />
                                <span>Dark</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">Charcoal</span>
                        </div>
                    </button>
                </div>
            </CardContent>
        </Card>
    );
}
