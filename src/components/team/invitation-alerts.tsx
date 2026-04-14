'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Check, X, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface Invite {
    id: string;
    role: string;
    invitedAt: string;
    projectName: string;
    inviterName: string;
}

export function InvitationAlerts({ initialInvites }: { initialInvites?: Invite[] }) {
    const [invites, setInvites] = useState<Invite[]>(initialInvites || []);
    const [loading, setLoading] = useState(!initialInvites);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    const fetchInvites = useCallback(async () => {
        try {
            const res = await fetch('/api/team?scope=my-invites');
            const data = await res.json();
            setInvites(data.invites || []);
        } catch (e) {
            console.error("Failed to fetch invites:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialInvites) {
            setInvites(initialInvites);
            setLoading(false);
        } else {
            fetchInvites();
        }
        
        // Poll every 60 seconds for new invites
        const interval = setInterval(fetchInvites, 60000);
        return () => clearInterval(interval);
    }, [fetchInvites, initialInvites]);

    const handleAction = async (inviteId: string, status: 'accepted' | 'rejected') => {
        setProcessingId(inviteId);
        try {
            const res = await fetch('/api/team/invites/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId, status }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to process invitation");
            }

            toast({
                title: status === 'accepted' ? "Joined Team!" : "Invitation Declined",
                description: status === 'accepted' 
                    ? `You are now a member of the ${invites.find(i => i.id === inviteId)?.projectName} project.`
                    : "The invitation has been removed."
            });

            setInvites(prev => prev.filter(i => i.id !== inviteId));
            if (status === 'accepted') {
                window.location.reload(); // Reload to update project list in context
            }
        } catch (e: any) {
            toast({
                title: "Error",
                description: e.message,
                variant: "destructive"
            });
        } finally {
            setProcessingId(null);
        }
    };

    if (loading || invites.length === 0) return null;

    return (
        <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
            {invites.map(invite => (
                <Card key={invite.id} 
                    className="border-orange-500/20 bg-orange-500/5 overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                        <div className="flex items-start gap-4">
                            <div className="p-2.5 rounded-full bg-orange-500/10 border border-orange-500/20 shadow-[0_0_15px_rgba(255,130,36,0.1)]">
                                <Users className="h-5 w-5 text-orange-400" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-sm text-zinc-100">Team Invitation</h3>
                                    <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight bg-orange-500/10 text-orange-400 border-orange-500/20 px-1.5 h-4">
                                        {invite.role}
                                    </Badge>
                                </div>
                                <p className="text-xs text-zinc-400 leading-relaxed max-w-md">
                                    <span className="text-zinc-200 font-medium">{invite.inviterName}</span> invited you to collaborate on the project 
                                    <span className="text-orange-400 font-medium ml-1">{invite.projectName}</span>.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2 md:mt-0">
                            <Button 
                                variant="outline" 
                                size="sm"
                                disabled={!!processingId}
                                onClick={() => handleAction(invite.id, 'rejected')}
                                className="h-9 px-3 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-red-400 transition-colors"
                            >
                                <X className="h-4 w-4 mr-2" />
                                Decline
                            </Button>
                            <Button 
                                size="sm"
                                disabled={!!processingId}
                                onClick={() => handleAction(invite.id, 'accepted')}
                                className="h-9 px-4 bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_20px_rgba(255,130,36,0.2)]"
                            >
                                {processingId === invite.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <Check className="h-4 w-4 mr-2" />
                                        Accept Invite
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    );
}
