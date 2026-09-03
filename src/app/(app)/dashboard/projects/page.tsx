'use client';

import { useEffect, useState, useContext } from 'react';
import Image from 'next/image';
import { getProjectsForCurrentUser, Project } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, AlertTriangle, Database, Sparkles, Layers, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function SelectProjectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingQuick, setCreatingQuick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setProject } = useContext(ProjectContext);
  const { toast } = useToast();

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success && data.projects) {
        setProjects(data.projects);
      } else {
        const userProjects = await getProjectsForCurrentUser();
        setProjects(userProjects);
      }
    } catch (e: any) {
      console.error("Failed to fetch projects:", e);
      setError("We couldn't load your projects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleProjectSelect = (project: Project) => {
    setProject(project);
    router.push('/dashboard');
  };

  const handleQuickCreate = async (projectName: string, dialect: 'postgresql' | 'mysql') => {
    setCreatingQuick(dialect);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          dialect,
          description: 'Created via quick starter wizard',
        }),
      });
      const data = await res.json();
      if (data.success && data.project) {
        setProject(data.project);
        toast({
          title: 'Project Created',
          description: `Created ${projectName} (${dialect}). Redirecting to dashboard...`,
        });
        router.push('/dashboard');
      } else {
        throw new Error(data.error || 'Failed to create project');
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Creation Failed',
        description: err.message,
      });
    } finally {
      setCreatingQuick(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full bg-background p-4 animate-in fade-in duration-500">
        <div className="w-full max-w-7xl">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── First-Time User Onboarding Screen (0 Projects) ──
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full bg-background p-4 sm:p-8 animate-in fade-in duration-500">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Get Started with Fluxbase</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Create your first database project
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
              Choose a starter database to instantly provision your serverless backend, create tables, and start building.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
            {/* 1. Instant PostgreSQL */}
            <Card className="relative overflow-hidden border-border bg-card/40 hover:bg-card/70 hover:border-primary/50 transition-all duration-300 flex flex-col justify-between group">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Database className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border-blue-500/20">
                    PostgreSQL
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">Production Postgres</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Full relational power with JSONB, vector search, and sub-50ms serverless schema provisioning.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button 
                  onClick={() => handleQuickCreate('My Postgres App', 'postgresql')} 
                  disabled={creatingQuick !== null}
                  className="w-full font-medium"
                >
                  {creatingQuick === 'postgresql' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    <>
                      Create Postgres Project
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* 2. Instant MySQL */}
            <Card className="relative overflow-hidden border-border bg-card/40 hover:bg-card/70 hover:border-primary/50 transition-all duration-300 flex flex-col justify-between group">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                    <Database className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-orange-500/10 text-orange-400 border-orange-500/20">
                    MySQL
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">High-Speed MySQL</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Fast transaction processing, robust indexed lookups, and native MySQL 8 compatibility.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button 
                  onClick={() => handleQuickCreate('My MySQL App', 'mysql')} 
                  disabled={creatingQuick !== null}
                  variant="secondary"
                  className="w-full font-medium"
                >
                  {creatingQuick === 'mysql' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    <>
                      Create MySQL Project
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* 3. Custom / External Database */}
            <Card className="relative overflow-hidden border-dashed border bg-transparent hover:bg-card/20 transition-all duration-300 flex flex-col justify-between group sm:col-span-2 lg:col-span-1">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-muted/50 border border-border text-muted-foreground">
                    <Layers className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono uppercase">
                    Custom Config
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">Custom & External</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Configure custom instance sizes, timezones, or connect directly to an external AWS RDS database.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button asChild variant="outline" className="w-full font-medium">
                  <Link href="/dashboard/projects/create">
                    Configure Project
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ── Existing Projects View ──
  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-background p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-7xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Select a Project</CardTitle>
            <p className="text-muted-foreground">
              Choose a project to continue or create a new one.
            </p>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="flex flex-col items-center justify-center text-center text-destructive-foreground bg-destructive/20 border border-destructive/50 rounded-lg p-8 col-span-full">
                <AlertTriangle className="h-10 w-10 mb-4" />
                <h3 className="text-lg font-semibold">Something went wrong</h3>
                <p className="text-sm">{error}</p>
                <Button onClick={fetchProjects} variant="destructive" className="mt-6">
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => {
                  const isPostgres = project.dialect !== 'mysql';
                  return (
                    <button
                      key={project.project_id}
                      onClick={() => handleProjectSelect(project)}
                      className="w-full text-left group relative outline-none"
                    >
                      <Card className="relative overflow-hidden flex flex-col h-36 border-border bg-card/30 hover:border-border hover:bg-card/50 transition-all duration-300 hover:-translate-y-0.5">
                        {/* Faint Background Logo Outline */}
                        <div className="absolute -right-6 -bottom-6 w-36 h-36 group-hover:scale-110 transition-all duration-500 pointer-events-none overflow-visible z-0">
                          {isPostgres ? (
                            <Image src="/postgres-bg.png" alt="PostgreSQL Background" width={144} height={144} className="w-full h-full object-contain grayscale opacity-[0.4] group-hover:opacity-[0.7] transition-opacity" />
                          ) : (
                            <Image src="/mysql-bg.png" alt="MySQL Background" width={144} height={144} className="w-full h-full object-contain grayscale opacity-[0.4] group-hover:opacity-[0.7] transition-opacity" />
                          )}
                        </div>

                        <div className="p-6 flex flex-col h-full z-10 relative">
                          {/* Top: Dialect / Infra */}
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex gap-2">
                              <Badge variant="secondary" className={cn(
                                "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 font-mono",
                                isPostgres 
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                                  : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                              )}>
                                {isPostgres ? 'PostgreSQL' : 'MySQL'}
                              </Badge>
                              
                              {project.role && (
                                <Badge variant="secondary" className={cn(
                                  "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 border font-mono",
                                  project.role === 'admin' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                  project.role === 'developer' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                  project.role === 'viewer' && "bg-secondary text-muted-foreground border-border"
                                )}>
                                  {project.role}
                                </Badge>
                              )}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                          </div>

                          {/* Middle: Project Name */}
                          <div className="mt-auto mb-2">
                            <h3 className="text-lg font-semibold tracking-tight text-foreground/90 group-hover:text-foreground transition-colors line-clamp-1">
                              {project.display_name}
                            </h3>
                          </div>

                          {/* Bottom: Date */}
                          <div className="flex items-center text-xs text-muted-foreground/60 font-mono mt-1">
                            <span>Created {new Date(project.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}</span>
                          </div>
                        </div>
                      </Card>
                    </button>
                  );
                })}

                <Link href="/dashboard/projects/create" className="w-full text-left group outline-none">
                  <Card className="flex flex-col h-36 items-center justify-center border-dashed border bg-transparent hover:bg-card/20 transition-all duration-300">
                    <CardContent className="text-center p-6 flex flex-col items-center justify-center h-full w-full">
                      <div className="p-3 rounded-full bg-muted/50 group-hover:bg-primary/10 transition-colors mb-3">
                        <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <p className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Create New Project</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
