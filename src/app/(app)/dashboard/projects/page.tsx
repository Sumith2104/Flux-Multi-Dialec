
'use client';

import { useEffect, useState, useContext } from 'react';
import { getProjectsForCurrentUser, Project } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';

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
        <div className="w-full max-w-4xl">
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
      <div className="w-full max-w-4xl">
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
                  {projects.map((project) => (
                    <button
                      key={project.project_id}
                      onClick={() => handleProjectSelect(project)}
                      className="w-full text-left group"
                    >
                      <Card className="flex flex-col h-full hover:border-primary transition-colors">
                        <CardHeader className="flex-row items-center justify-between pb-2">
                          <CardTitle className="text-base font-medium">
                            {project.display_name}
                          </CardTitle>
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            Created: {new Date(project.created_at).toLocaleDateString()}
                          </p>
                        </CardContent>
                      </Card>
                    </button>
                  ))}

                  <Link href="/dashboard/projects/create" className="w-full text-left group">
                    <Card className="flex flex-col h-full items-center justify-center border-dashed hover:border-primary transition-colors">
                      <CardContent className="text-center">
                        <Plus className="h-8 w-8 mx-auto text-muted-foreground group-hover:text-primary" />
                        <p className="mt-2 font-medium">New Project</p>
                      </CardContent>
                    </Card>
                  </Link>
                </div>

                {projects.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-10">
                    <p>No projects yet.</p>
                    <Button variant="link" asChild>
                      <Link href="/dashboard/projects/create">
                        Create your first project
                      </Link>
                    </Button>
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
