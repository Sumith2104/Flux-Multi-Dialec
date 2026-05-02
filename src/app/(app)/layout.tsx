
'use client';

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User } from "@/lib/auth";
import { Project } from "@/lib/data";
import { ProjectSwitcher } from "@/components/project-switcher";
import { useEffect, useState, useContext } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { getAppLayoutBootstrapData } from "./actions";
import { LogoutButton } from "@/components/logout-button";
import { ProjectProvider, ProjectContext } from "@/contexts/project-context";
import { TimezoneSelector } from "@/components/timezone-selector";
import Dock from "@/components/dock";
// Phase 5+6: Lazy-load heavy components — they are NOT needed on initial page render.
// FluxAiAssistant: 555 lines, speech synthesis, complex state.
// CommandPalette: opened only on Ctrl+K.
const FluxAiAssistant = dynamic(
    () => import('@/components/flux-ai-assistant').then(m => m.FluxAiAssistant),
    { ssr: false }
);
const CommandPalette = dynamic(
    () => import('@/components/command-palette').then(m => m.CommandPalette),
    { ssr: false }
);
const InvitationAlerts = dynamic(
    () => import('@/components/team/invitation-alerts').then(m => m.InvitationAlerts),
    { ssr: false }
);
import { FeedbackWidget } from "@/components/feedback-widget";
import { ChangelogPopover } from "@/components/changelog-popover";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { StatusIndicator } from "@/components/status-indicator";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { PremiumLoader } from "@/components/ui/premium-loader";
import {
    LayoutDashboard,
    BrainCircuit,
    Folder,
    Settings as SettingsIcon,
    Table,
    Database,
    Globe,
    ServerCrash,
    BarChart3,
    AlertTriangle,
    Sparkles
} from "lucide-react";


const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
    { href: "/editor", label: "Table Editor", icon: <Table /> },
    { href: "/database", label: "Database", icon: <Database /> },
    { href: "/query", label: "SQL Editor", icon: <BrainCircuit /> },
    { href: "/analytics", label: "Analytics", icon: <BarChart3 /> },
    { href: "/scraper", label: "Scraper", icon: <Globe /> },
    { href: "/storage", label: "Storage", icon: <Folder /> },
    { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

function AppLayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [planType, setPlanType] = useState<string>('Free');
    const [isOffline, setIsOffline] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [invitations, setInvitations] = useState<any[]>([]);
    const [userLoading, setUserLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const { project: selectedProject, setProject, loading: projectContextLoading, isSuspended, setIsSuspended } = useContext(ProjectContext);
    const [isAiOpen, setIsAiOpen] = useState(false);

    useEffect(() => {
        async function fetchData() {
            setUserLoading(true);
            setLoadingProgress(10); // Initialization started
            try {
                // SINGLE ROUND TRIP Consolidating:
                // checkDatabaseHealth, getCurrentUserId, findUserById, getUserPlan, getProjects
                const data = await getAppLayoutBootstrapData();
                setLoadingProgress(70); // Server processing complete

                if ('error' in data) {
                    console.error("Bootstrap error:", data.error);
                    setLoadingProgress(100);
                    return;
                }

                if (data.isOffline) {
                    setIsOffline(true);
                    setUserLoading(false);
                    return;
                }

                setUserId(data.userId || null);

                if (data.userId) {
                    setUser(data.user || null);

                    if (data.plan) {
                        setPlanType(data.plan.type === 'max' ? 'Max' : (data.plan.type === 'pro' ? 'Pro' : 'Free'));
                        setIsSuspended(data.plan.status === 'suspended');
                    }

                    setProjects(data.projects || []);
                    setInvitations(data.invitations || []);

                    if (selectedProject && !data.projects?.some(p => p.project_id === selectedProject.project_id)) {
                        setProject(null);
                    }
                }

                setLoadingProgress(100);
            } catch (error) {
                console.error("Failed to fetch layout data:", error);
                setLoadingProgress(100);
            } finally {
                setUserLoading(false);
            }
        }
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Real-time Session Tracking
    useEffect(() => {
        if (userId && selectedProject?.project_id) {
            import('@/lib/track-session').then(({ trackSession }) => {
                trackSession(selectedProject.project_id, userId);
            });
        }
    }, [userId, selectedProject?.project_id, pathname]); // Re-track on page shifts too

    // Redirect logic
    useEffect(() => {
        // [STABILITY FIX]: If the app is in Offline Mode (DB Down), do not redirect to login.
        // This prevents an infinite loop where DB failure -> assumes logged out -> redirects to home -> home redirects to app.
        if (isOffline) return;

        // [STABILITY FIX]: Removed client-side redirect to root.
        // Middleware handles this before page load. Removing this prevents the infinite "ping-pong" redirect loop
        // that occurs when the client state is briefly null during hydration.
        if (!userId && !isOffline) {
            // We just wait for auth to resolve or for middleware to catch us.
            return;
        }

        const isProjectSelectionPage = pathname.startsWith('/dashboard/projects');
        const isSettingsPage = pathname.startsWith('/settings');

        // If user is logged-in but no project is selected, redirect to project selection page
        // [Requirement 4] Allow settings page access even without a project
        if (!selectedProject && !isProjectSelectionPage && !isSettingsPage) {
            router.push('/dashboard/projects');
        }

    }, [userLoading, projectContextLoading, userId, selectedProject, pathname, router, isOffline]);

    const isEditorOrDbPage = pathname.startsWith('/editor') || pathname.startsWith('/database');
    const isLoading = userLoading || projectContextLoading;

    const dockItems = navItems.map(item => {
        // Reduced list of project-specific pages
        const isProjectSpecific = ["/editor", "/storage", "/query", "/database", "/analytics", "/scraper"].includes(item.href);
        const isDisabled = isProjectSpecific && !selectedProject?.project_id;
        let finalHref = item.href;

        if (isProjectSpecific && selectedProject?.project_id) {
            finalHref = `${item.href}?projectId=${selectedProject.project_id}`;
        }

        return {
            ...item,
            onClick: () => {
                if (!isDisabled) {
                    router.push(finalHref);
                }
            },
        };
    });

    // Global Keyboard Shortcuts
    useKeyboardShortcuts([
        {
            combination: 'g d',
            handler: () => router.push('/dashboard'),
            description: 'Go to Dashboard'
        },
        {
            combination: 'g e',
            handler: () => selectedProject?.project_id ? router.push(`/editor?projectId=${selectedProject.project_id}`) : router.push('/dashboard/projects'),
            description: 'Go to Table Editor'
        },
        {
            combination: 'g b',
            handler: () => selectedProject?.project_id ? router.push(`/database?projectId=${selectedProject.project_id}`) : router.push('/dashboard/projects'),
            description: 'Go to Database'
        },
        {
            combination: 'g q',
            handler: () => selectedProject?.project_id ? router.push(`/query?projectId=${selectedProject.project_id}`) : router.push('/dashboard/projects'),
            description: 'Go to SQL Editor'
        },
        {
            combination: 'g a',
            handler: () => selectedProject?.project_id ? router.push(`/analytics?projectId=${selectedProject.project_id}`) : router.push('/dashboard/projects'),
            description: 'Go to Analytics'
        },
        {
            combination: 'g s',
            handler: () => selectedProject?.project_id ? router.push(`/settings?projectId=${selectedProject.project_id}`) : router.push('/dashboard/projects'),
            description: 'Go to Settings'
        },
        {
            combination: 'g w',
            handler: () => selectedProject?.project_id ? router.push(`/scraper?projectId=${selectedProject.project_id}`) : router.push('/dashboard/projects'),
            description: 'Go to Scraper'
        },
    ], !!userId);


    if (isLoading) {
        return <PremiumLoader text="Initializing Fluxbase..." progress={loadingProgress} />;
    }

    if (isOffline) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center px-4">
                <div className="bg-destructive/10 p-6 rounded-full mb-6">
                    <ServerCrash className="h-12 w-12 text-destructive" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">We'll be right back</h1>
                <p className="text-muted-foreground text-lg max-w-md mx-auto mb-8">
                    Fluxbase is currently undergoing scheduled maintenance or the database is temporarily offline. Please check back shortly.
                </p>
                <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
        );
    }

    if (!isLoading && !userId && !pathname.startsWith('/login') && !pathname.startsWith('/signup')) {
        return <div className="flex items-center justify-center h-screen">Redirecting to login...</div>;
    }

    // Use display_name if available, otherwise email prefix.
    const displayName = (user as any)?.display_name || (user?.email?.split('@')[0]) || 'User';
    const orgName = user ? `${displayName}'s Org` : "My Org";
    const avatarFallback = displayName.charAt(0).toUpperCase();
    const headerTitle = selectedProject
        ? `${orgName} / ${selectedProject.display_name}`
        : orgName;

    const shouldShowDock = userId && (selectedProject || pathname.startsWith('/dashboard/projects'));

    return (
        <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-background text-foreground">
            {isSuspended ? (
                <div className="bg-destructive text-destructive-foreground text-center py-1.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 z-50">
                    <AlertTriangle className="h-4 w-4" />
                    Your organization is currently suspended. Database access and webhooks are disabled.
                    <Link href="/settings" className="underline underline-offset-2 ml-1 opacity-90 hover:opacity-100">Resume in Settings</Link>
                </div>
            ) : selectedProject?.status === 'suspended' ? (
                <div className="bg-amber-600 text-white text-center py-1.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 z-50">
                    <AlertTriangle className="h-4 w-4" />
                    This project is currently suspended. API and SQL access are disabled.
                    <Link href="/settings" className="underline underline-offset-2 ml-1 opacity-90 hover:opacity-100">Manage in Settings</Link>
                </div>
            ) : null}
            <header className="sticky top-0 z-40 flex h-14 max-w-full items-center gap-2 border-b border-border/70 bg-background/95 px-2 shadow-sm shadow-black/10 backdrop-blur-md sm:gap-4 sm:px-4 md:px-6">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                    <Avatar className="hidden h-8 w-8 shrink-0 sm:block">
                        {(user as any)?.photo_url && <AvatarImage src={(user as any).photo_url} referrerPolicy="no-referrer" />}
                        <AvatarFallback>{avatarFallback}</AvatarFallback>
                    </Avatar>
                    <ProjectSwitcher
                        headerTitle={headerTitle}
                        orgName={orgName}
                        projects={projects}
                        selectedProject={selectedProject}
                    />
                    {selectedProject && (
                        <div className="flex items-center gap-1.5">
                            <Badge
                                variant="secondary"
                                className={cn(
                                    "hidden sm:inline-flex transition-colors shadow-none text-[9px] uppercase font-bold tracking-wider rounded-md border",
                                    selectedProject.role === 'admin' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                    selectedProject.role === 'developer' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                    selectedProject.role === 'viewer' && "bg-secondary text-muted-foreground border-border"
                                )}
                            >
                                {selectedProject.role}
                            </Badge>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "hidden sm:inline-flex transition-colors shadow-none text-[9px] uppercase font-bold tracking-wider rounded-md",
                                    planType === 'Max' ? "border-amber-500/50 bg-amber-500/10 text-amber-500" :
                                        planType === 'Pro' ? "border-blue-500/50 bg-blue-500/10 text-blue-500" :
                                            "border-muted-foreground/30 bg-muted/10 text-muted-foreground"
                                )}
                            >
                                {planType}
                            </Badge>
                        </div>
                    )}
                    <div className="hidden md:block">
                        <TimezoneSelector />
                    </div>
                </div>
                <div className="hidden sm:flex sm:flex-1"></div>
                {userId ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <div className="hidden sm:block">
                            <CommandPalette />
                        </div>
                        <div className="w-px h-5 bg-border mx-1 hidden md:block" />
                        <StatusIndicator />
                        <div className="hidden sm:block">
                            <ChangelogPopover />
                        </div>
                        <div className="hidden sm:block">
                            <FeedbackWidget />
                        </div>
                        <div className="hidden sm:block">
                            <KeyboardShortcuts />
                        </div>
                        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
                        {userId && (
                            <button
                                onClick={() => setIsAiOpen(true)}
                                className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all text-xs font-medium group"
                                title="Open Flux AI Assistant"
                            >
                                <span className="relative">
                                    <Sparkles className="h-4 w-4 text-orange-400 group-hover:text-orange-300 transition-colors" />
                                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 bg-orange-500 rounded-full animate-pulse" />
                                </span>
                                <span className="hidden md:block">Flux AI</span>
                            </button>
                        )}
                        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
                        <LogoutButton />
                    </div>
                ) : (
                    <Button asChild variant="outline" size="sm">
                        <Link href="/login">Login</Link>
                    </Button>
                )}
            </header>
            <div className="relative flex min-w-0 flex-1 overflow-hidden">
                <main className={cn("flex-1 overflow-auto bg-background pb-24", {
                    "p-0": isEditorOrDbPage,
                    "p-3 sm:p-4 md:p-6": !isEditorOrDbPage,
                })}>
                    {userId && <InvitationAlerts initialInvites={invitations} />}
                    {children}
                    {shouldShowDock && (
                        <div className="pointer-events-none fixed bottom-3 left-0 right-0 z-50 flex justify-center px-2 sm:bottom-4">
                            <Dock items={dockItems} className="pointer-events-auto" />
                        </div>
                    )}
                    {userId && <FluxAiAssistant key={userId} userId={userId} isOpen={isAiOpen} onOpenChange={setIsAiOpen} />}
                </main>
            </div>
        </div>
    );
}

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
    return (
        <ProjectProvider>
            <AppLayoutContent>{children}</AppLayoutContent>
        </ProjectProvider>
    );
}
