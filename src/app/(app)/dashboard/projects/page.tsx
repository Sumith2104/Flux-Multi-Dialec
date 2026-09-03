'use client';

import { useEffect, useState, useContext } from 'react';
import Image from 'next/image';
import { getProjectsForCurrentUser, Project } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ChevronRight, AlertTriangle, Database, Sparkles, Layers, ArrowRight, Loader2, Bot, Key, Copy, Check, ShieldCheck, GraduationCap, Briefcase, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createProjectAction } from '@/components/layout/actions';
import { createApiKeyAction } from '@/app/(app)/settings/api-key-actions';

const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];

type UserRoleOption = 'student' | 'employee' | 'org_owner';

export default function SelectProjectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const { setProject } = useContext(ProjectContext);
  const { toast } = useToast();

  // Dialog States
  const [modalDialect, setModalDialect] = useState<'postgresql' | 'mysql' | null>(null);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Project Creation Form State
  const [projectName, setProjectName] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [selectedRole, setSelectedRole] = useState<UserRoleOption>('employee');

  // MCP Key State
  const [mcpApiKey, setMcpApiKey] = useState<string>('');
  const [isGeneratingMcpKey, setIsGeneratingMcpKey] = useState(false);
  const [hasCopiedMcp, setHasCopiedMcp] = useState(false);
  const [mcpEnv, setMcpEnv] = useState<'vercel' | 'local'>('vercel');

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

  const openCreateModal = (dialect: 'postgresql' | 'mysql') => {
    setModalDialect(dialect);
    setProjectName(dialect === 'postgresql' ? 'My PostgreSQL Project' : 'My MySQL Project');
    setSelectedRole('employee');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !modalDialect) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('projectName', projectName.trim());
      formData.append('dialect', modalDialect);
      formData.append('timezone', selectedTimezone);
      formData.append('userRole', selectedRole);
      formData.append('connectionType', 'internal');

      const result = await createProjectAction(formData);

      if (result.success && result.project) {
        toast({
          title: 'Project Created Successfully',
          description: `Created ${result.project.display_name} (${modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'}) with role "${selectedRole}".`,
        });
        setModalDialect(null);
        setProject(result.project);
        router.push('/dashboard');
      } else {
        throw new Error(result.error || 'Failed to create project.');
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Project Creation Failed',
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateMcpKey = async () => {
    setIsGeneratingMcpKey(true);
    try {
      const res = await createApiKeyAction('Organization MCP Key', undefined, ['read', 'write', 'admin']);
      if (res.success && res.data?.key) {
        setMcpApiKey(res.data.key);
        toast({
          title: 'MCP API Key Generated',
          description: 'Your organization MCP key is ready. Keep it secure.',
        });
      } else {
        throw new Error(res.error || 'Failed to generate MCP key');
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Key Generation Failed',
        description: err.message,
      });
    } finally {
      setIsGeneratingMcpKey(false);
    }
  };

  const vercelMcpUrl = 'https://fluxbase.vercel.app/api/mcp';
  const localMcpUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'http://localhost:3000/api/mcp';
  const mcpServerUrl = mcpEnv === 'vercel' ? vercelMcpUrl : localMcpUrl;

  const mcpSnippet = JSON.stringify({
    mcpServers: {
      fluxbase: {
        url: mcpServerUrl,
        headers: {
          Authorization: `Bearer ${mcpApiKey || 'YOUR_FLUXBASE_API_KEY'}`
        }
      }
    }
  }, null, 2);

  const handleCopyMcpConfig = () => {
    navigator.clipboard.writeText(mcpSnippet);
    setHasCopiedMcp(true);
    toast({
      title: 'MCP Configuration Copied',
      description: 'Copied to clipboard. Paste into your Claude Desktop or Cursor configuration.',
    });
    setTimeout(() => setHasCopiedMcp(false), 2500);
  };

  const filteredProjects = projects.filter(p => 
    p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.dialect?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.creator_role || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="flex flex-col items-center justify-start min-h-full bg-background p-4 sm:p-8 animate-in fade-in duration-500 space-y-8">
      <div className="w-full max-w-7xl space-y-8">
        
        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Projects & Workspaces
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create a new database project, configure your organization MCP agent, or select an existing project.
            </p>
          </div>
          {projects.length > 0 && (
            <div className="w-full md:w-72">
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 bg-secondary/40 text-xs"
              />
            </div>
          )}
        </div>

        {/* ── 3 Primary Action Option Boxes (Equal Priority) ── */}
        <div>
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Quick Actions & Provisioning
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            
            {/* Box 1: Create PostgreSQL */}
            <Card 
              onClick={() => openCreateModal('postgresql')}
              className="relative overflow-hidden cursor-pointer border-border/80 bg-card/40 hover:bg-card/70 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 flex flex-col justify-between group"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 group-hover:scale-105 transition-transform">
                    <Database className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border-blue-500/20">
                    PostgreSQL
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5 group-hover:text-blue-400 transition-colors">
                  Create PostgreSQL Project
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provision serverless PostgreSQL with full relational schemas, JSONB documents, vector indexes, and custom roles.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button variant="outline" className="w-full border-blue-500/30 group-hover:bg-blue-500/10 group-hover:text-blue-400 transition-colors">
                  Configure & Create
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>

            {/* Box 2: Create MySQL (Equal 1st-Class Priority) */}
            <Card 
              onClick={() => openCreateModal('mysql')}
              className="relative overflow-hidden cursor-pointer border-border/80 bg-card/40 hover:bg-card/70 hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 flex flex-col justify-between group"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 group-hover:scale-105 transition-transform">
                    <Database className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-orange-500/10 text-orange-400 border-orange-500/20">
                    MySQL
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5 group-hover:text-orange-400 transition-colors">
                  Create MySQL Project
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provision serverless MySQL 8 with high-throughput transactions, primary indexing, foreign keys, and custom roles.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button variant="outline" className="w-full border-orange-500/30 group-hover:bg-orange-500/10 group-hover:text-orange-400 transition-colors">
                  Configure & Create
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>

            {/* Box 3: Organization MCP Gateway */}
            <Card 
              onClick={() => setIsMcpModalOpen(true)}
              className="relative overflow-hidden cursor-pointer border-border/80 bg-card/40 hover:bg-card/70 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 flex flex-col justify-between group sm:col-span-2 lg:col-span-1"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-105 transition-transform">
                    <Bot className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-purple-500/10 text-purple-400 border-purple-500/20">
                    MCP Integration
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5 group-hover:text-purple-400 transition-colors">
                  Organization MCP Gateway
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect AI agents (Claude, Cursor, AutoGLM) via Model Context Protocol with URL, API keys, and project automation.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button variant="outline" className="w-full border-purple-500/30 group-hover:bg-purple-500/10 group-hover:text-purple-400 transition-colors">
                  View MCP Credentials
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>

          </div>
        </div>

        {/* ── Existing Projects Section ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Existing Projects ({projects.length})
            </h2>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/dashboard/projects/create">
                Advanced Connection Form
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center text-center text-destructive-foreground bg-destructive/20 border border-destructive/50 rounded-lg p-8">
              <AlertTriangle className="h-10 w-10 mb-4" />
              <h3 className="text-lg font-semibold">Something went wrong</h3>
              <p className="text-sm">{error}</p>
              <Button onClick={fetchProjects} variant="destructive" className="mt-6">
                Try Again
              </Button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-card/20">
              <Database className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground">No projects found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {searchQuery ? `No project matched "${searchQuery}".` : 'Select one of the 3 options above to create your first PostgreSQL or MySQL project.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => {
                const isPostgres = project.dialect !== 'mysql';
                return (
                  <button
                    key={project.project_id}
                    onClick={() => handleProjectSelect(project)}
                    className="w-full text-left group relative outline-none"
                  >
                    <Card className="relative overflow-hidden flex flex-col h-40 border-border bg-card/30 hover:border-border hover:bg-card/50 transition-all duration-300 hover:-translate-y-0.5">
                      {/* Faint Background Logo Outline */}
                      <div className="absolute -right-6 -bottom-6 w-36 h-36 group-hover:scale-110 transition-all duration-500 pointer-events-none overflow-visible z-0">
                        {isPostgres ? (
                          <Image src="/postgres-bg.png" alt="PostgreSQL Background" width={144} height={144} className="w-full h-full object-contain grayscale opacity-[0.35] group-hover:opacity-[0.65] transition-opacity" />
                        ) : (
                          <Image src="/mysql-bg.png" alt="MySQL Background" width={144} height={144} className="w-full h-full object-contain grayscale opacity-[0.35] group-hover:opacity-[0.65] transition-opacity" />
                        )}
                      </div>

                      <div className="p-6 flex flex-col h-full z-10 relative">
                        {/* Top: Dialect & Role */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className={cn(
                              "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 font-mono",
                              isPostgres 
                                ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                                : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            )}>
                              {isPostgres ? 'PostgreSQL' : 'MySQL'}
                            </Badge>

                            {project.creator_role && (
                              <Badge variant="outline" className="text-[10px] font-mono capitalize border-border/80 text-foreground/80 bg-secondary/50">
                                {project.creator_role.replace('_', ' ')}
                              </Badge>
                            )}

                            {project.role && (
                              <Badge variant="secondary" className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 border font-mono">
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

                        {/* Bottom: Project ID & Date */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground/60 font-mono mt-1">
                          <span className="truncate max-w-[140px]">{project.project_id}</span>
                          <span>{new Date(project.created_at).toLocaleDateString(undefined, {
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
            </div>
          )}
        </div>

      </div>

      {/* ── Dialog 1 & 2: Create PostgreSQL or MySQL Project Modal ── */}
      <Dialog open={modalDialect !== null} onOpenChange={(open) => { if (!open) setModalDialect(null); }}>
        <DialogContent className="sm:max-w-lg bg-card/95 backdrop-blur-2xl border-border/80">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className={cn(
                "text-xs font-mono uppercase",
                modalDialect === 'postgresql' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"
              )}>
                {modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'}
              </Badge>
            </div>
            <DialogTitle className="text-xl font-bold">
              Create {modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Project
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure your project name, timezone, and your persona role to be stored in the Fluxbase database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProject} className="space-y-4 pt-2">
            
            {/* Project Name */}
            <div className="space-y-1.5">
              <Label htmlFor="projectName" className="text-xs font-semibold">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Production Core DB"
                className="h-9 text-sm"
                required
              />
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label htmlFor="timezone" className="text-xs font-semibold">Project Timezone</Label>
              <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                <SelectTrigger id="timezone" className="h-9 text-xs">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz} className="text-xs font-mono">
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role Selection (Student, Employee, Org Owner) */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold">Your Role in Organization / Project</Label>
              <div className="grid grid-cols-3 gap-2">
                
                {/* Student */}
                <button
                  type="button"
                  onClick={() => setSelectedRole('student')}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all",
                    selectedRole === 'student'
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <GraduationCap className="h-5 w-5 mb-1.5" />
                  <span className="text-xs font-bold">Student</span>
                  <span className="text-[10px] opacity-75 mt-0.5">Learning / Labs</span>
                </button>

                {/* Employee */}
                <button
                  type="button"
                  onClick={() => setSelectedRole('employee')}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all",
                    selectedRole === 'employee'
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Briefcase className="h-5 w-5 mb-1.5" />
                  <span className="text-xs font-bold">Employee</span>
                  <span className="text-[10px] opacity-75 mt-0.5">Workplace / Team</span>
                </button>

                {/* Org Owner */}
                <button
                  type="button"
                  onClick={() => setSelectedRole('org_owner')}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all",
                    selectedRole === 'org_owner'
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Building2 className="h-5 w-5 mb-1.5" />
                  <span className="text-xs font-bold">Org Owner</span>
                  <span className="text-[10px] opacity-75 mt-0.5">Founder / Admin</span>
                </button>

              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Your role selection will be securely saved into your profile and database records.
              </p>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setModalDialect(null)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !projectName.trim()}
                className={cn(
                  "font-medium",
                  modalDialect === 'postgresql' ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Provisioning Tenant...
                  </>
                ) : (
                  `Create ${modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Project`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 3: Organization MCP Gateway Modal ── */}
      <Dialog open={isMcpModalOpen} onOpenChange={setIsMcpModalOpen}>
        <DialogContent className="sm:max-w-xl bg-card/95 backdrop-blur-2xl border-border/80">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs font-mono uppercase bg-purple-500/10 text-purple-400 border-purple-500/20">
                Model Context Protocol
              </Badge>
            </div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-400" />
              Organization MCP Gateway Setup
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Connect Cursor, Claude Desktop, Windsurf, or AutoGLM to inspect schemas, build tables, and manage projects.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            
            {/* 1. MCP Environment Selector & Server URL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">MCP Server Endpoint URL</Label>
                <div className="inline-flex items-center gap-1 p-0.5 bg-secondary/60 rounded-md border border-border/60">
                  <button
                    type="button"
                    onClick={() => setMcpEnv('vercel')}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-mono transition-all",
                      mcpEnv === 'vercel' ? "bg-purple-600 text-white font-bold shadow" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Vercel Production
                  </button>
                  <button
                    type="button"
                    onClick={() => setMcpEnv('local')}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-mono transition-all",
                      mcpEnv === 'local' ? "bg-purple-600 text-white font-bold shadow" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Localhost
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={mcpServerUrl}
                  className="h-9 font-mono text-xs bg-secondary/50"
                />
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(mcpServerUrl);
                    toast({ title: 'URL Copied', description: `Copied ${mcpServerUrl} to clipboard.` });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* 2. MCP API Key Generator */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Organization MCP API Token</Label>
                <button 
                  type="button" 
                  onClick={handleGenerateMcpKey}
                  disabled={isGeneratingMcpKey}
                  className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1"
                >
                  {isGeneratingMcpKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                  {mcpApiKey ? 'Generate New Key' : 'Generate Org Key'}
                </button>
              </div>
              <Input
                readOnly
                value={mcpApiKey || 'Click "Generate Org Key" to generate a live secret token'}
                placeholder="fl_live_..."
                className="h-9 font-mono text-xs bg-secondary/50"
              />
            </div>

            {/* 3. Claude Desktop / Cursor Config Snippet */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Claude Desktop / Cursor JSON Config</Label>
              <pre className="p-3 rounded-lg bg-black/60 border border-border text-[11px] font-mono text-muted-foreground overflow-x-auto">
                {mcpSnippet}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground">
                Compatible with all Model Context Protocol (MCP) clients.
              </p>
              <Button 
                onClick={handleCopyMcpConfig} 
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium"
              >
                {hasCopiedMcp ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy MCP Config
                  </>
                )}
              </Button>
            </div>

          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
