
'use client';

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getCurrentUserId, User } from "@/lib/auth";
import { findUserById } from "@/lib/auth-actions";
import { getProjectsForCurrentUser, Project } from "@/lib/data";
import { ProjectSwitcher } from "@/components/project-switcher";
import { useEffect, useState, useContext } from "react";
import { cn } from "@/lib/utils";
import { logoutAction } from "./actions";
import { LogoutButton } from "@/components/logout-button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectProvider, ProjectContext } from "@/contexts/project-context";
import Dock from "@/components/dock";
import {
    LayoutDashboard,
    BrainCircuit,
    Code,
    Folder,
    Settings as SettingsIcon,
    Table,
    Database
} from "lucide-react";


const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
    { href: "/editor", label: "Table Editor", icon: <Table /> },
    { href: "/database", label: "Database", icon: <Database /> },
    { href: "/query", label: "SQL Editor", icon: <BrainCircuit /> },
    { href: "/api", label: "API Generation", icon: <Code /> },
    { href: "/storage", label: "Storage", icon: <Folder /> },
    { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

function AppLayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [userLoading, setUserLoading] = useState(true);
    const { project: selectedProject, setProject, loading: projectContextLoading } = useContext(ProjectContext);

    useEffect(() => {
        async function fetchData() {
            setUserLoading(true);
            try {
                const id = await getCurrentUserId();
                setUserId(id);

                if (id) {
                    const userData = await findUserById(id);
                    setUser(userData);
                    const projectsData = await getProjectsForCurrentUser();
                    setProjects(projectsData);

                    // Validation: If a project is selected in context/localStorage,
                    // but it doesn't exist in the fetched projects list, clear it.
                    if (selectedProject && !projectsData.some(p => p.project_id === selectedProject.project_id)) {
                        setProject(null);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch layout data:", error);
            } finally {
                setUserLoading(false);
            }
        }
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setProject]);

    // Redirect logic
    useEffect(() => {
        // Wait for both user data and project context to be loaded
        if (userLoading || projectContextLoading) return;

        // If there's no logged-in user, redirect to login (unless already on an auth page)
        if (!userId) {
            if (!pathname.startsWith('/login') && !pathname.startsWith('/signup')) {
                router.push('/');
            }
            return;
        }

        const isProjectSelectionPage = pathname.startsWith('/dashboard/projects');

        // If user is logged-in but no project is selected, redirect to project selection page
        if (!selectedProject && !isProjectSelectionPage) {
            router.push('/dashboard/projects');
        }

    }, [userLoading, projectContextLoading, userId, selectedProject, pathname, router]);

    const isEditorOrDbPage = pathname.startsWith('/editor') || pathname.startsWith('/database');
    const isLoading = userLoading || projectContextLoading;

    const dockItems = navItems.map(item => {
        const isProjectSpecific = ["/editor", "/api", "/storage", "/settings", "/query", "/database"].includes(item.href);
        const isDisabled = isProjectSpecific && !selectedProject?.project_id;
        let finalHref = item.href;

        if (isProjectSpecific && selectedProject?.project_id) {
            // Special case for Settings: Go to Project Settings instead of Global Settings
            if (item.href === "/settings") {
                finalHref = "/dashboard/project-settings";
            } else {
                finalHref = `${item.href}?projectId=${selectedProject.project_id}`;
            }
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


    if (isLoading) {
        return (
            <div className="flex min-h-screen w-full flex-col bg-background">
                <header className="sticky top-0 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6 z-50">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-6 w-40" />
                    <div className="flex-1"></div>
                    <Skeleton className="h-8 w-20" />
                </header>
                <div className="flex flex-1 overflow-hidden">
                    <main className="flex-1 overflow-auto p-4 md:p-8">
                        <div className="flex items-center justify-center h-full">
                            <p>Loading...</p>
                        </div>
                    </main>
                </div>
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
        <div className="flex min-h-screen w-full flex-col bg-background">
            <header className="sticky top-0 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6 z-40">
                <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarFallback>{avatarFallback}</AvatarFallback>
                    </Avatar>
                    <ProjectSwitcher
                        headerTitle={headerTitle}
                        orgName={orgName}
                        projects={projects}
                        selectedProject={selectedProject}
                    />
                    {selectedProject && <Badge variant="outline">Free</Badge>}
                </div>
                <div className="flex-1"></div>
                {userId ? (
                    <div className="flex items-center">
                        <div className="flex items-center">
                            <LogoutButton />
                        </div>
                    </div>
                ) : (
                    <Button asChild variant="outline" size="sm">
                        <Link href="/login">Login</Link>
                    </Button>
                )}
            </header>
            <div className="flex flex-1 overflow-hidden relative">
                <main className={cn("flex-1 overflow-auto pb-24", {
                    "p-0": isEditorOrDbPage,
                    "p-4 md:p-8": !isEditorOrDbPage,
                })}>
                    {children}
                    {shouldShowDock && (
                        <div className="fixed bottom-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
                            <Dock items={dockItems} className="pointer-events-auto" />
                        </div>
                    )}
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
