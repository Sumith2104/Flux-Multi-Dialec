
'use client';

import { useEffect, useState, useContext } from 'react';
import { getProjectsForCurrentUser, Project } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { InvitationAlerts } from '@/components/team/invitation-alerts';

export default function SelectProjectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setProject } = useContext(ProjectContext);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const userProjects = await getProjectsForCurrentUser();
      setProjects(userProjects);
    } catch (e: any) {
      console.error("Failed to fetch projects:", e);
      setError("We couldn't load your projects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProjectSelect = (project: Project) => {
    setProject(project);
    router.push('/dashboard');
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
              <>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => {
                    const isPostgres = project.dialect !== 'mysql';
                    return (
                    <button
                      key={project.project_id}
                      onClick={() => handleProjectSelect(project)}
                      className="w-full text-left group relative outline-none"
                    >
                      <Card className="relative overflow-hidden flex flex-col h-36 border-border bg-card/40 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_2rem_-0.5rem_#ffffff15] hover:-translate-y-1">
                        
                        {/* Faint Background Logo Outline */}
                        <div className="absolute -right-6 -bottom-6 w-36 h-36 group-hover:scale-110 transition-all duration-500 pointer-events-none overflow-visible z-0">
                            {isPostgres ? (
                                <img src="/postgres-bg.png" alt="PostgreSQL Background" className="w-full h-full object-contain grayscale opacity-[0.4] group-hover:opacity-[0.7] transition-opacity" loading="lazy" />
                            ) : (
                                <img src="/mysql-bg.png" alt="MySQL Background" className="w-full h-full object-contain grayscale opacity-[0.4] group-hover:opacity-[0.7] transition-opacity" loading="lazy" />
                            )}
                        </div>

                        <div className="p-6 flex flex-col h-full z-10 relative">
                            {/* Top: Dialect / Infra */}
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2">
                                    <Badge variant="secondary" className={cn(
                                        "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 shadow-sm",
                                        isPostgres 
                                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                                          : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                    )}>
                                        {isPostgres ? 'PostgreSQL' : 'MySQL'}
                                    </Badge>
                                    
                                    {project.role && (
                                        <Badge variant="secondary" className={cn(
                                            "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 shadow-sm border",
                                            project.role === 'admin' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                            project.role === 'developer' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                            project.role === 'viewer' && "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                        )}>
                                            {project.role}
                                        </Badge>
                                    )}
                                </div>
                                <ChevronRight className="h-5 w-5 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                            </div>

                            {/* Middle: Project Name */}
                            <div className="mt-auto mb-2">
                                <h3 className="text-xl font-bold tracking-tight text-foreground/90 group-hover:text-foreground transition-colors line-clamp-1">
                                    {project.display_name}
                                </h3>
                            </div>

                            {/* Bottom: Date */}
                            <div className="flex items-center text-xs text-muted-foreground/60 font-medium mt-1">
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
                    <Card className="flex flex-col h-36 items-center justify-center border-dashed border-2 bg-transparent hover:bg-card/30 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_2rem_-0.5rem_#ffffff10] hover:-translate-y-1">
                      <CardContent className="text-center p-6 flex flex-col items-center justify-center h-full w-full">
                        <div className="p-3 rounded-full bg-muted/50 group-hover:bg-primary/10 transition-colors mb-3">
                            <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <p className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Create New Project</p>
                      </CardContent>
                    </Card>
                  </Link>
                </div>

                {projects.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-10">
                    <p>No projects yet.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
