'use client';

import { useEffect, useState, useContext } from 'react';
import Image from 'next/image';
import { getProjectsForCurrentUser, Project } from '@/lib/data';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ChevronRight, AlertTriangle, Database, Sparkles, Layers, ArrowRight, Loader2, Bot, Key, Copy, Check, ShieldCheck, GraduationCap, Briefcase, Building2, Send, Cpu, HardDrive, Zap, CreditCard, Activity } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProjectContext } from '@/contexts/project-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createProjectAction } from '@/components/layout/actions';
import { createApiKeyAction } from '@/app/(app)/settings/api-key-actions';
import { getUserPlanAction } from '@/app/(app)/settings/billing-actions';

const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];

type UserRoleOption = 'student' | 'employee' | 'org_owner';
type BillingOption = 'monthly' | 'pay_as_you_go' | 'hybrid';

export default function SelectProjectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPlan, setCurrentPlan] = useState<string>('free');
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
  const [selectedRole, setSelectedRole] = useState<UserRoleOption | null>(null);
  const [billingPreference, setBillingPreference] = useState<BillingOption>('monthly');
  const [companyName, setCompanyName] = useState('');
  const [workDescription, setWorkDescription] = useState('');

  // MCP Key State
  const [mcpApiKey, setMcpApiKey] = useState<string>('');
  const [isGeneratingMcpKey, setIsGeneratingMcpKey] = useState(false);
  const [hasCopiedMcp, setHasCopiedMcp] = useState(false);
  const [mcpEnv, setMcpEnv] = useState<'vercel' | 'local'>('vercel');

  // Subscription Quota Detection
  const isUpgradedAccount = currentPlan === 'employee' || currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max' || currentPlan === 'pro' || currentPlan === 'pay_as_you_go';

  const maxAllowedProjects = 
    (currentPlan === 'max' || currentPlan === 'org_owner' || currentPlan === 'org') ? 999999 :
    (currentPlan === 'employee' || currentPlan === 'pay_as_you_go') ? 10 :
    (currentPlan === 'pro') ? 3 : 1;

  const hasAvailableQuota = isUpgradedAccount && projects.length < maxAllowedProjects;

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

    getUserPlanAction().then(res => {
      if (res?.plan) setCurrentPlan(res.plan.toLowerCase());
    }).catch(() => {});

    // Auto-provision pending paid project if user completed payment
    try {
      const pendingProjectJson = localStorage.getItem('pending_paid_project');
      if (pendingProjectJson) {
        const projData = JSON.parse(pendingProjectJson);
        getUserPlanAction().then(async (planData) => {
          const userPlan = planData.plan;
          if (userPlan && userPlan !== 'free') {
            const formData = new FormData();
            formData.append('projectName', projData.projectName);
            formData.append('dialect', projData.dialect);
            formData.append('timezone', projData.timezone || 'UTC');
            formData.append('userRole', projData.userRole || planData.role || 'employee');
            formData.append('billingPreference', projData.billingPreference || 'monthly');
            formData.append('companyName', projData.companyName || '');
            formData.append('workDescription', projData.workDescription || '');
            formData.append('connectionType', 'internal');

            toast({
              title: 'Finalizing Project Provisioning...',
              description: `Provisioning "${projData.projectName}" now that your ${userPlan.toUpperCase()} plan is confirmed.`
            });

            const result = await createProjectAction(formData);
            localStorage.removeItem('pending_paid_project');
            if (result && !result.error) {
              toast({
                title: 'Project Created!',
                description: `Project "${projData.projectName}" is active and ready.`
              });
              await fetchProjects();
            } else if (result?.error) {
              toast({
                variant: 'destructive',
                title: 'Provisioning Alert',
                description: result.error
              });
            }
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Error auto-provisioning paid project:', e);
    }

    const handleProjectChange = async (e?: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent?.detail;
      if (detail?.action === 'INSERT' && (detail?.record || detail?.project || detail?.data)) {
        const newProj: Project = detail.record || detail.project || detail.data;
        if (newProj && newProj.project_id) {
          setProjects(prev => {
            if (prev.some(p => p.project_id === newProj.project_id)) return prev;
            return [newProj, ...prev];
          });
        }
      } else if (detail?.action === 'DELETE') {
        const delId = detail?.record?.project_id || detail?.projectId || detail?.data?.project_id;
        if (delId) {
          setProjects(prev => prev.filter(p => p.project_id !== delId));
        }
      }
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
          setProjects(data.projects);
        }
      } catch (err) {}
    };

    window.addEventListener('flux:project-change', handleProjectChange);
    return () => {
      window.removeEventListener('flux:project-change', handleProjectChange);
    };
  }, []);

  const handleProjectSelect = (project: Project) => {
    setProject(project);
    router.push('/dashboard');
  };

  const openCreateModal = (dialect: 'postgresql' | 'mysql') => {
    setModalDialect(dialect);
    setProjectName('');
    const defaultRole: UserRoleOption = 
      (currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max') ? 'org_owner' :
      (currentPlan === 'employee' || currentPlan === 'pro') ? 'employee' :
      'student';
    setSelectedRole(hasAvailableQuota ? defaultRole : null);
    setBillingPreference('monthly');
    setCompanyName('');
    setWorkDescription('');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !modalDialect || !selectedRole) return;

    if (!hasAvailableQuota && selectedRole !== 'student') {
      if (!companyName.trim()) {
        toast({
          variant: 'destructive',
          title: 'Organization Name Required',
          description: 'Please provide your company or organization name.',
        });
        return;
      }
      if (!workDescription.trim()) {
        toast({
          variant: 'destructive',
          title: 'Work Description Required',
          description: 'Please describe your workload and team requirements.',
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const isAlreadyCovered = 
        hasAvailableQuota ||
        (selectedRole === 'student') ||
        (selectedRole === 'employee' && (currentPlan === 'employee' || currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max' || currentPlan === 'pro')) ||
        (selectedRole === 'org_owner' && (currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max')) ||
        (billingPreference === 'pay_as_you_go' && (currentPlan === 'pay_as_you_go' || currentPlan === 'employee' || currentPlan === 'org_owner' || currentPlan === 'max'));

      if (!isAlreadyCovered) {
        // For Paid Tiers not yet purchased:
        // 1. Save pending project payload in localStorage so it only provisions AFTER payment
        localStorage.setItem('pending_paid_project', JSON.stringify({
          projectName: projectName.trim(),
          dialect: modalDialect,
          timezone: selectedTimezone,
          userRole: selectedRole,
          billingPreference,
          companyName: companyName.trim(),
          workDescription: workDescription.trim()
        }));

        // 2. Redirect to Order & Plan Review screen
        const isPayg = billingPreference === 'pay_as_you_go';
        const planKey = isPayg ? 'pay_as_you_go' : (selectedRole === 'org_owner' ? 'org_owner' : 'employee');

        setModalDialect(null);
        toast({
          title: isPayg ? 'Refundable Verification Deposit' : 'Order Review',
          description: isPayg 
            ? 'Pay-As-You-Go requires a ₹50 refundable verification fee, credited on your 1st month bill.'
            : `Review your ${selectedRole === 'org_owner' ? 'Org Owner (₹5,000)' : 'Employee (₹500)'} tier details before payment.`,
        });
        router.push(`/checkout?plan=${planKey}`);
        return;
      }

      // User already has the paid tier (or Student)! Direct Instant Creation!
      const formData = new FormData();
      formData.append('projectName', projectName.trim());
      formData.append('dialect', modalDialect);
      formData.append('timezone', selectedTimezone);
      formData.append('userRole', selectedRole);
      formData.append('billingPreference', billingPreference);
      formData.append('companyName', companyName.trim() || 'Organization Workspace');
      formData.append('workDescription', workDescription.trim() || 'Dedicated workspace database');
      formData.append('connectionType', 'internal');

      const result = await createProjectAction(formData);

      if (result.success && result.project) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('flux:project-change', {
            detail: { action: 'INSERT', table: 'projects', record: result.project, project: result.project }
          }));
        }
        setModalDialect(null);
        setProject(result.project);
        toast({
          title: 'Project Created Successfully',
          description: `Created ${result.project.display_name} (${modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'}).`,
        });
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

  const pgProjects = filteredProjects.filter(p => p.dialect?.toLowerCase() !== 'mysql');
  const mysqlProjects = filteredProjects.filter(p => p.dialect?.toLowerCase() === 'mysql');

  const renderProjectCard = (project: Project) => {
    const isPostgres = project.dialect !== 'mysql';
    return (
      <button
        key={project.project_id}
        onClick={() => handleProjectSelect(project)}
        className="w-full text-left group relative outline-none"
      >
        <Card className="relative overflow-hidden flex flex-col h-44 border-border/80 bg-card/40 transition-all duration-200 hover:bg-card/70 hover:-translate-y-0.5">
          {/* Faint Background Logo Outline */}
          <div className="absolute -right-6 -bottom-6 w-36 h-36 pointer-events-none overflow-visible z-0 transition-transform duration-300 group-hover:scale-105">
            {isPostgres ? (
              <Image 
                src="/postgres-bg.png" 
                alt="PostgreSQL Background" 
                width={144} 
                height={144} 
                className="w-full h-full object-contain grayscale opacity-20 transition-all duration-300 group-hover:opacity-85 group-hover:brightness-0 group-hover:invert" 
              />
            ) : (
              <Image 
                src="/mysql-bg.png" 
                alt="MySQL Background" 
                width={144} 
                height={144} 
                className="w-full h-full object-contain grayscale opacity-20 transition-all duration-300 group-hover:opacity-85 group-hover:brightness-0 group-hover:invert" 
              />
            )}
          </div>

          <div className="p-5 flex flex-col h-full z-10 relative">
            {/* Top: Dialect & Role (Left) and Date & Arrow (Right) */}
            <div className="flex justify-between items-center mb-3 gap-2">
              <div className="flex flex-wrap gap-1.5 items-center">
                <Badge variant="secondary" className={cn(
                  "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 font-mono",
                  isPostgres 
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                    : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                )}>
                  {isPostgres ? 'PostgreSQL' : 'MySQL'}
                </Badge>

                {project.creator_role && (
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-mono capitalize border",
                    project.creator_role === 'employee' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    project.creator_role === 'org_owner' && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                    project.creator_role === 'student' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  )}>
                    {project.creator_role.replace('_', ' ')}
                  </Badge>
                )}

                {project.role && (
                  <Badge variant="secondary" className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 border font-mono">
                    {project.role}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono text-muted-foreground/60">
                <span>{new Date(project.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
              </div>
            </div>

            {/* Middle: Project Name */}
            <div className="mt-auto mb-2">
              <h3 className="text-lg font-semibold tracking-tight text-foreground/90 group-hover:text-foreground transition-colors line-clamp-1">
                {project.display_name}
              </h3>
              {project.description && (
                <p className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5">
                  {project.description}
                </p>
              )}
            </div>

            {/* Bottom: Project ID */}
            <div className="flex items-center text-xs text-muted-foreground/60 font-mono mt-1 pt-2 border-t border-border/40">
              <span className="truncate max-w-[200px]">{project.project_id}</span>
            </div>
          </div>
        </Card>
      </button>
    );
  };

  const isFormValid = Boolean(
    projectName.trim() &&
    selectedRole &&
    (hasAvailableQuota || selectedRole === 'student' || (companyName.trim() && workDescription.trim()))
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

        {/* ── 3 Primary Action Option Boxes (Equal Priority, Neutral, Badges have colors) ── */}
        <div>
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Quick Actions & Provisioning
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            
            {/* Box 1: Create PostgreSQL */}
            <Card 
              onClick={() => openCreateModal('postgresql')}
              className="relative overflow-hidden cursor-pointer border-border/80 bg-card/40 hover:bg-card/70 transition-all duration-200 flex flex-col justify-between group"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-secondary border border-border text-foreground">
                    <Database className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border-blue-500/20">
                    PostgreSQL
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">
                  Create PostgreSQL Project
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provision serverless PostgreSQL with full relational schemas, JSONB documents, vector indexes, and custom server tiers.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button variant="outline" className="w-full border-border hover:bg-secondary text-foreground transition-colors">
                  Configure & Create
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>

            {/* Box 2: Create MySQL */}
            <Card 
              onClick={() => openCreateModal('mysql')}
              className="relative overflow-hidden cursor-pointer border-border/80 bg-card/40 hover:bg-card/70 transition-all duration-200 flex flex-col justify-between group"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-secondary border border-border text-foreground">
                    <Database className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-orange-500/10 text-orange-400 border-orange-500/20">
                    MySQL
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">
                  Create MySQL Project
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provision serverless MySQL 8 with high-throughput transactions, primary indexing, foreign keys, and custom server tiers.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button variant="outline" className="w-full border-border hover:bg-secondary text-foreground transition-colors">
                  Configure & Create
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>

            {/* Box 3: Organization MCP Gateway */}
            <Card 
              onClick={() => setIsMcpModalOpen(true)}
              className="relative overflow-hidden cursor-pointer border-border/80 bg-card/40 hover:bg-card/70 transition-all duration-200 flex flex-col justify-between group sm:col-span-2 lg:col-span-1"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-xl bg-secondary border border-border text-foreground">
                    <Bot className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-purple-500/10 text-purple-400 border-purple-500/20">
                    MCP Integration
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">
                  Organization MCP Gateway
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect AI agents (Claude, Cursor, AutoGLM) via Model Context Protocol with URL, API keys, and project automation.
                </p>
              </div>
              <div className="p-6 pt-0">
                <Button variant="outline" className="w-full border-border hover:bg-secondary text-foreground transition-colors">
                  View MCP Credentials
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>

          </div>
        </div>

        {/* ── Error Banner if any ── */}
        {error && (
          <div className="flex flex-col items-center justify-center text-center text-destructive-foreground bg-destructive/20 border border-destructive/50 rounded-lg p-8">
            <AlertTriangle className="h-10 w-10 mb-4" />
            <h3 className="text-lg font-semibold">Something went wrong</h3>
            <p className="text-sm">{error}</p>
            <Button onClick={fetchProjects} variant="destructive" className="mt-6">
              Try Again
            </Button>
          </div>
        )}

        {/* ── Dialect Projects Sections (Top: PostgreSQL, Down: MySQL) ── */}
        {!error && (
          <div className="space-y-12">

            {/* ── TOP SECTION: PostgreSQL Projects ── */}
            <div className="space-y-4">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  PostgreSQL Workspaces
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Serverless relational databases with JSONB, vector extensions, and automated tenant schemas
                </p>
              </div>

              {pgProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-8 text-center bg-card/20">
                  <h3 className="text-sm font-semibold text-foreground">No PostgreSQL projects</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {searchQuery ? `No PostgreSQL project matched "${searchQuery}".` : 'No PostgreSQL projects currently provisioned.'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {pgProjects.map(renderProjectCard)}
                </div>
              )}
            </div>

            {/* ── DOWN SECTION: MySQL Projects ── */}
            <div className="space-y-4 pt-2">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  MySQL Workspaces
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  MySQL 8 relational engines with InnoDB ACID transactions and connection pooling
                </p>
              </div>

              {mysqlProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-8 text-center bg-card/20">
                  <h3 className="text-sm font-semibold text-foreground">No MySQL projects</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {searchQuery ? `No MySQL project matched "${searchQuery}".` : 'No MySQL projects currently provisioned.'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {mysqlProjects.map(renderProjectCard)}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* ── Dialog 1 & 2: Create PostgreSQL or MySQL Project Modal ── */}
      <Dialog open={modalDialect !== null} onOpenChange={(open) => { if (!open) setModalDialect(null); }}>
        <DialogContent className="sm:max-w-xl bg-card/95 backdrop-blur-2xl border-border/80 max-h-[92vh] overflow-y-auto">
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
              Select your role, infrastructure tier, and configure your dedicated database workspace.
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
                placeholder=""
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

            {/* Role & Server Tier Selection */}
            {hasAvailableQuota ? (
              <div className="rounded-xl p-4 bg-primary/5 border border-primary/20 space-y-2.5 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          {currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max'
                            ? 'Organization Owner Tier'
                            : 'Employee Tier'}
                        </span>
                        <Badge variant="secondary" className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          Active Plan
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {maxAllowedProjects >= 999999
                          ? `Unlimited projects included in your plan (${projects.length} provisioned)`
                          : `Project ${projects.length + 1} of ${maxAllowedProjects} included under your active subscription`}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <div>
                    <span className="text-foreground font-medium">Compute: </span>
                    {currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max' ? '8 vCPU Xeon (32GB)' : '2 vCPU Dedicated (4GB)'}
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Storage: </span>
                    {currentPlan === 'org_owner' || currentPlan === 'org' || currentPlan === 'max' ? '100GB NVMe' : '10GB SSD'}
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Cost: </span>
                    <span className="text-emerald-500 font-semibold">₹0 (Included)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Select Your Role & Server Tier</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedRole ? `Selected: ${selectedRole.replace('_', ' ')}` : 'Please choose an option'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  
                  {/* Student */}
                  <button
                    type="button"
                    onClick={() => setSelectedRole('student')}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-lg border text-left transition-all relative overflow-hidden",
                      selectedRole === 'student'
                        ? "border-foreground bg-secondary/80 text-foreground"
                        : "border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-end w-full mb-1">
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">₹0 Free</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">Student</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Shared Micro Sandbox</span>
                  </button>

                  {/* Employee */}
                  <button
                    type="button"
                    onClick={() => setSelectedRole('employee')}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-lg border text-left transition-all relative overflow-hidden",
                      selectedRole === 'employee'
                        ? "border-foreground bg-secondary/80 text-foreground"
                        : "border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-end w-full mb-1">
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">₹500/mo</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">Employee</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">High-Performance (2 vCPU)</span>
                  </button>

                  {/* Org Owner */}
                  <button
                    type="button"
                    onClick={() => setSelectedRole('org_owner')}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-lg border text-left transition-all relative overflow-hidden",
                      selectedRole === 'org_owner'
                        ? "border-foreground bg-secondary/80 text-foreground"
                        : "border-border/80 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-end w-full mb-1">
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">₹5,000/mo</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">Org Owner</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Top-Grade (8 vCPU NVMe)</span>
                  </button>

                </div>
              </div>
            )}

            {/* Server Specifications & Pay-As-You-Go Preview (Only if choosing a plan) */}
            {(!hasAvailableQuota && selectedRole) && (
              <div className="rounded-lg p-3 bg-secondary/40 border border-border/80 space-y-2 animate-in fade-in duration-300">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground border-b border-border/60 pb-1.5">
                  <span>
                    {selectedRole === 'student' && 'Student Sandbox Compute'}
                    {selectedRole === 'employee' && 'High-Performance Dedicated Server (₹500 / mo)'}
                    {selectedRole === 'org_owner' && 'Top-Grade Enterprise Infrastructure (₹5,000 / mo)'}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {selectedRole === 'student' ? 'Community Tier' : 'Pay-As-You-Go Available'}
                  </Badge>
                </div>

                {/* Specs List */}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
                  <div>
                    <span className="text-foreground font-medium">Compute: </span>
                    {selectedRole === 'student' && '0.5 vCPU Shared (512MB RAM)'}
                    {selectedRole === 'employee' && '2 vCPU Dedicated (4GB RAM)'}
                    {selectedRole === 'org_owner' && '8 vCPU Xeon/EPYC (32GB RAM)'}
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Storage: </span>
                    {selectedRole === 'student' && '500 MB Shared Storage'}
                    {selectedRole === 'employee' && '10 GB High-Speed SSD Storage'}
                    {selectedRole === 'org_owner' && '100 GB Gen4 NVMe (10k IOPS)'}
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Connections: </span>
                    {selectedRole === 'student' && '10 Concurrent Connections'}
                    {selectedRole === 'employee' && '100 Concurrent Connections'}
                    {selectedRole === 'org_owner' && '1,000+ Concurrent + Pooler'}
                  </div>
                  <div>
                    <span className="text-foreground font-medium">Pay-As-You-Go: </span>
                    {selectedRole === 'student' && 'None (Free Sandbox Limit)'}
                    {selectedRole === 'employee' && '₹0.50 / 10k queries | ₹5/GB extra'}
                    {selectedRole === 'org_owner' && '₹2.00 / 10k queries | ₹15/GB extra'}
                  </div>
                </div>
              </div>
            )}

            {/* Additional Organization Details for Employee & Org Owner (Only during first-time subscription) */}
            {(!hasAvailableQuota && (selectedRole === 'employee' || selectedRole === 'org_owner')) && (
              <div className="space-y-3 pt-2 p-3.5 rounded-lg bg-secondary/30 border border-border/80 animate-in fade-in duration-300">
                <div className="text-xs font-semibold text-foreground">
                  <span>Dedicated Server Tier & Organization Setup</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  As an {selectedRole === 'org_owner' ? 'Organization Owner' : 'Employee'}, you will be linked directly to our payment gateway to complete payment and instantly activate your dedicated database tier.
                </p>

                {/* Billing Model Selector */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Billing Model Preference</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBillingPreference('monthly')}
                      className={cn(
                        "p-2 rounded border text-left text-xs transition-all",
                        billingPreference === 'monthly' ? "border-foreground bg-secondary font-semibold text-foreground" : "border-border/60 bg-background/50 text-muted-foreground"
                      )}
                    >
                      <div>Fixed Monthly</div>
                      <div className="text-[10px] opacity-75">{selectedRole === 'org_owner' ? '₹5,000/mo' : '₹500/mo'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingPreference('pay_as_you_go')}
                      className={cn(
                        "p-2 rounded border text-left text-xs transition-all",
                        billingPreference === 'pay_as_you_go' ? "border-foreground bg-secondary font-semibold text-foreground" : "border-border/60 bg-background/50 text-muted-foreground"
                      )}
                    >
                      <div>Pay-As-You-Go</div>
                      <div className="text-[10px] opacity-75">₹50 refundable deposit • 28-day cycle</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingPreference('hybrid')}
                      className={cn(
                        "p-2 rounded border text-left text-xs transition-all",
                        billingPreference === 'hybrid' ? "border-foreground bg-secondary font-semibold text-foreground" : "border-border/60 bg-background/50 text-muted-foreground"
                      )}
                    >
                      <div>Hybrid Plan</div>
                      <div className="text-[10px] opacity-75">Base + Overages</div>
                    </button>
                  </div>
                </div>

                {/* Company / Organization Name */}
                <div className="space-y-1">
                  <Label htmlFor="companyName" className="text-xs font-medium">Company or Organization Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder=""
                    className="h-8 text-xs"
                    required
                  />
                </div>

                {/* What they do / Intended Use */}
                <div className="space-y-1">
                  <Label htmlFor="workDescription" className="text-xs font-medium">What do you do / Intended Workload</Label>
                  <Textarea
                    id="workDescription"
                    value={workDescription}
                    onChange={(e) => setWorkDescription(e.target.value)}
                    placeholder=""
                    className="min-h-[65px] text-xs resize-none"
                    required
                  />
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setModalDialect(null)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !isFormValid}
                className={cn(
                  "font-medium",
                  modalDialect === 'postgresql' ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Provisioning Workspace...
                  </>
                ) : hasAvailableQuota ? (
                  `Create ${modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Project (Included)`
                ) : !selectedRole ? (
                  'Select a Role to Continue'
                ) : billingPreference === 'pay_as_you_go' ? (
                  'Proceed to Verification (₹50 Refundable Deposit) & Activate'
                ) : selectedRole !== 'student' ? (
                  `Proceed to Payment (${selectedRole === 'org_owner' ? '₹5,000' : '₹500'}) & Activate`
                ) : (
                  `Create Free ${modalDialect === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Project`
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
                placeholder=""
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
