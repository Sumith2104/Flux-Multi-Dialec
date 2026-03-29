'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Activity, Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
const STATUS_COLORS = { success: '#22c55e', failure: '#ef4444' };

export function SystemMetrics({ projectId }: { projectId: string }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/analytics/system?projectId=${projectId}`)
            .then(res => res.json())
            .then(d => {
                setData(d);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [projectId]);

    if (loading) return (
        <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
        </div>
    );

    if (!data) return null;

    const maxCount = Math.max(...data.heatmap.map((h: any) => h.count), 1);
    const getIntensity = (count: number) => {
        const ratio = count / maxCount;
        if (ratio === 0) return 'bg-zinc-900/30';
        if (ratio < 0.25) return 'bg-emerald-900/30';
        if (ratio < 0.5) return 'bg-emerald-700/50';
        if (ratio < 0.75) return 'bg-emerald-500/70';
        return 'bg-emerald-400';
    };

    const statusData = [
        { name: 'Success', value: data.status.find((s: any) => s.success)?.count || 0, color: STATUS_COLORS.success },
        { name: 'Failure', value: data.status.find((s: any) => !s.success)?.count || 0, color: STATUS_COLORS.failure },
    ].filter(d => d.value > 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="border-zinc-800 bg-zinc-950/50">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-400" />
                        Query Activity (Last 30 Days)
                    </CardTitle>
                    <CardDescription className="text-xs">Visual distribution of database usage intensity.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-1.5 min-h-[50px]">
                        {data.heatmap.map((day: any) => (
                            <div 
                                key={day.date}
                                title={`${day.date}: ${day.count} queries`}
                                className={cn("h-4 w-4 rounded-sm transition-transform hover:scale-125 cursor-help", getIntensity(day.count))} 
                            />
                        ))}
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground font-mono">
                        <span>Less</span>
                        <div className="flex gap-1">
                            <div className="h-2 w-2 rounded-sm bg-zinc-900/30" />
                            <div className="h-2 w-2 rounded-sm bg-emerald-900/30" />
                            <div className="h-2 w-2 rounded-sm bg-emerald-700/50" />
                            <div className="h-2 w-2 rounded-sm bg-emerald-500/70" />
                            <div className="h-2 w-2 rounded-sm bg-emerald-400" />
                        </div>
                        <span>More</span>
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-zinc-800 bg-zinc-950/50">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Clock className="h-4 w-4 text-orange-400" />
                            Latency Distribution
                        </CardTitle>
                        <CardDescription className="text-xs">Execution time grouping for the last 7 days.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.latency} layout="vertical" margin={{ left: 40, right: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="range" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} width={100} />
                                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                                    {data.latency.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-zinc-800 bg-zinc-950/50">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-blue-400" />
                            Query Success Rate
                        </CardTitle>
                        <CardDescription className="text-xs">SQL health across all team members.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-0 flex flex-col items-center justify-center relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={statusData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                            <span className="text-2xl font-bold">
                                {statusData.length > 0 
                                    ? ((statusData.find(d => d.name === 'Success')?.value || 0) / (statusData.reduce((a, b) => a + b.value, 0)) * 100).toFixed(1) 
                                    : '100'}%
                            </span>
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Reliability</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
