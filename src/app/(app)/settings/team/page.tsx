'use client';

import { useState, useEffect, useCallback, useContext } from 'react';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Plus, Trash2, Loader2, Shield, Terminal, Clock, Filter, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Member {
    userId: string;
    email: string;
    displayName: string;
    role: 'admin' | 'developer' | 'viewer';
    joinedAt: string;
}

interface PendingInvite {
    id: string;
    email: string;
    displayName: string;
    role: string;
    invitedAt: string;
}

interface AuditLog {
    id: string;
    userId: string;
    userEmail?: string;
    action: string;
    statement: string;
    createdAt: string;
    metadata?: any;
}

const roleColors = {
    admin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    developer: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    viewer: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export default function TeamPage() {
    const { project: selectedProject } = useContext(ProjectContext);
    const { toast } = useToast();
    const router = useRouter();
    const projectId = selectedProject?.project_id || '';

    const [members, setMembers] = useState<Member[]>([]);
    const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'developer' | 'viewer'>('developer');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [auditSearch, setAuditSearch] = useState('');
    const [auditLoading, setAuditLoading] = useState(false);

    const loadMembers = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/team?projectId=${projectId}`);
            const data = await res.json();
            setMembers(data.members || []);
            setPendingInvites(data.invites || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [projectId]);

    const loadAudit = useCallback(async () => {
        if (!projectId) return;
        setAuditLoading(true);
        try {
            const res = await fetch(`/api/audit?projectId=${projectId}&search=${encodeURIComponent(auditSearch)}`);
            const data = await res.json();
            setAuditLogs(data.logs || []);
        } catch (e) { console.error(e); }
        finally { setAuditLoading(false); }
    }, [projectId, auditSearch]);

    useEffect(() => { loadMembers(); }, [loadMembers]);
    useEffect(() => { loadAudit(); }, [loadAudit]);

    const handleInvite = async () => {
        if (!inviteEmail) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, email: inviteEmail, role: inviteRole }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            if (data.invited) {
                toast({
                    title: "Invite Sent",
                    description: `Invitation sent to ${inviteEmail}.`
                });
            }

            setShowInvite(false);
            setInviteEmail('');
            loadMembers();
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    };

    const handleRemove = async (userId: string) => {
        await fetch(`/api/team?projectId=${projectId}&userId=${userId}`, { method: 'DELETE' });
        loadMembers();
    };

    const handleRoleChange = async (userId: string, role: string) => {
        await fetch('/api/team/role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, userId, role }),
        });
        loadMembers();
    };

    const actionColors: Record<string, string> = {
        INSERT: 'text-emerald-400',
        SELECT: 'text-blue-400',
        UPDATE: 'text-yellow-400',
        DELETE: 'text-red-400',
        ALTER: 'text-purple-400',
        CREATE: 'text-cyan-400',
        DROP: 'text-red-500',
    };

    const filteredLogs = auditLogs.filter(l =>
        !auditSearch || l.statement?.toLowerCase().includes(auditSearch.toLowerCase()) || l.action?.toLowerCase().includes(auditSearch.toLowerCase())
    );

    if (!selectedProject) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Users className="h-6 w-6 text-blue-400" />
                        Team & Collaboration
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Manage team members and invitations across your projects</p>
                </div>
                
                <Card className="mt-4 border-dashed border-zinc-800 bg-zinc-950/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground text-center">
                        <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800">
                            <Users className="h-10 w-10 opacity-40" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-zinc-200 font-medium">No Project Active</p>
                            <p className="text-sm max-w-xs mx-auto">Select a project from the switcher above to manage its team members. If you've just been invited, check your dashboard for pending requests.</p>
                        </div>
                        <div className="flex gap-3 mt-2">
                             <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/projects')} className="border-zinc-800 hover:bg-zinc-900">
                                Go to Project Selection
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Users className="h-6 w-6 text-blue-400" />
                        Team & Audit Log
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Manage team members and view a full history of all database operations</p>
                </div>
            </div>

            <Tabs defaultValue="members">
                <TabsList className="bg-zinc-900 border border-zinc-800">
                    <TabsTrigger value="members" id="team-members-tab"><Users className="h-3.5 w-3.5 mr-1.5" />Members ({members.length})</TabsTrigger>
                    <TabsTrigger value="audit" id="team-audit-tab"><Terminal className="h-3.5 w-3.5 mr-1.5" />Audit Log</TabsTrigger>
                </TabsList>

                {/* Members Tab */}
                <TabsContent value="members" className="mt-4 space-y-4">
                    {selectedProject.role === 'admin' && (
                        <div className="flex justify-end">
                            <Button onClick={() => setShowInvite(true)} className="bg-orange-600 hover:bg-orange-500" id="invite-member">
                                <Plus className="h-4 w-4 mr-2" />Invite Member
                            </Button>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="space-y-2">
                            {members.map(member => (
                                <Card key={member.userId} className="border-zinc-800">
                                    {/* ... member card content ... */}
                                    <CardContent className="flex items-center gap-4 p-4">
                                        <Avatar className="h-9 w-9 shrink-0">
                                            <AvatarFallback className="bg-zinc-800 text-sm">
                                                {(member.displayName || member.email).charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{member.displayName || member.email}</p>
                                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Select 
                                                value={member.role} 
                                                onValueChange={v => handleRoleChange(member.userId, v)} 
                                                disabled={selectedProject.role !== 'admin' || member.role === 'admin'}
                                            >
                                                <SelectTrigger className={cn('h-7 text-xs w-28 border', roleColors[member.role])} id={`role-${member.userId}`}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                                    <SelectItem value="admin">Admin</SelectItem>
                                                    <SelectItem value="developer">Developer</SelectItem>
                                                    <SelectItem value="viewer">Viewer</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {selectedProject.role === 'admin' && member.role !== 'admin' && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                                    onClick={() => handleRemove(member.userId)} id={`remove-${member.userId}`}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Pending Invites Section */}
                    {!loading && pendingInvites.length > 0 && (
                        <div className="space-y-3 pt-6">
                            <div className="flex items-center gap-2 px-1">
                                <Clock className="h-4 w-4 text-orange-400" />
                                <h3 className="text-sm font-semibold text-zinc-300">Pending Invitations</h3>
                            </div>
                            <div className="space-y-2">
                                {pendingInvites.map(invite => (
                                    <Card key={invite.id} className="border-zinc-800 bg-zinc-900/40">
                                        <CardContent className="flex items-center gap-4 p-4">
                                            <div className="h-9 w-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                                <Clock className="h-4 w-4 text-zinc-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{invite.displayName || invite.email}</p>
                                                <p className="text-xs text-muted-foreground truncate">Invited as {invite.role} • {format(new Date(invite.invitedAt), 'MMM d')}</p>
                                            </div>
                                            {selectedProject.role === 'admin' && (
                                                <Button variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                                    onClick={() => {/* Cancel Invite Logic */}}>
                                                    Cancel Invite
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* Audit Log Tab */}
                <TabsContent value="audit" className="mt-4 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={auditSearch}
                            onChange={e => setAuditSearch(e.target.value)}
                            placeholder="Search SQL statements or actions..."
                            className="pl-9 bg-zinc-900 border-zinc-800 h-9 text-sm"
                            id="audit-search"
                        />
                    </div>

                    {auditLoading ? (
                        <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : filteredLogs.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                                <Terminal className="h-10 w-10 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No audit logs found</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-1.5">
                            {filteredLogs.map(log => {
                                const firstWord = log.statement?.trim().split(/\s+/)[0]?.toUpperCase() || log.action;
                                const color = actionColors[firstWord] || 'text-zinc-400';
                                return (
                                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 group">
                                        <div className="p-1.5 rounded-md bg-zinc-800 shrink-0">
                                            <Terminal className="h-3 w-3 text-zinc-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={cn('text-xs font-mono font-bold', color)}>{firstWord}</span>
                                                {log.userEmail && <span className="text-[10px] text-zinc-500">{log.userEmail}</span>}
                                            </div>
                                            <code className="text-xs text-zinc-300 font-mono block truncate">{log.statement}</code>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 text-[10px] text-zinc-600">
                                            <Clock className="h-3 w-3" />
                                            {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Invite Dialog */}
            <Dialog open={showInvite} onOpenChange={setShowInvite}>
                <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Invite Team Member</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-xs mb-1.5 block">Email Address</Label>
                            <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                                placeholder="colleague@company.com" className="bg-zinc-900 border-zinc-700 h-9 text-sm" id="invite-email" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1.5 block">Role</Label>
                            <Select value={inviteRole} onValueChange={v => setInviteRole(v as any)}>
                                <SelectTrigger className="bg-zinc-900 border-zinc-700 h-9 text-sm" id="invite-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-zinc-800">
                                    <SelectItem value="developer">Developer — Can read, write, run SQL</SelectItem>
                                    <SelectItem value="viewer">Viewer — Read-only access</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button disabled={!inviteEmail || saving} className="bg-orange-600 hover:bg-orange-500 min-w-[100px]" id="invite-submit">
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Send Invite
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-zinc-950 border-zinc-800">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Invitation</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        You are about to invite <span className="text-foreground font-bold">{inviteEmail}</span> as a <span className="text-foreground font-bold">{inviteRole}</span> to this project. They will receive an email to join.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-zinc-800">Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleInvite} className="bg-orange-600 hover:bg-orange-500">
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & Send"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
