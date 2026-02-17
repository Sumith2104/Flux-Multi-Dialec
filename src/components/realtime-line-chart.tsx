"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsStats } from '@/hooks/use-realtime-analytics';
import { Activity, Zap, Database, ArrowUpRight } from 'lucide-react';

interface RealtimeLineChartProps {
    currentStats: AnalyticsStats | null;
}

interface DataPoint {
    timestamp: number;
    timeLabel: string;
    requests: number;
    api: number;
    sql: number;
}

export function RealtimeLineChart({ currentStats }: RealtimeLineChartProps) {
    // Load initial data from localStorage
    const [data, setData] = useState<DataPoint[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = localStorage.getItem('flux_realtime_chart_data');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Filter out data older than 1 hour to prevent stale history
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                return parsed.filter((p: DataPoint) => p.timestamp > oneHourAgo);
            }
        } catch (e) {
            console.error("Failed to load chart data", e);
        }
        return [];
    });

    const prevStatsRef = useRef<AnalyticsStats | null>(null);
    const [peakRPS, setPeakRPS] = useState(0);

    // Save data to localStorage whenever it updates
    useEffect(() => {
        if (data.length > 0) {
            localStorage.setItem('flux_realtime_chart_data', JSON.stringify(data));
        }
    }, [data]);

    // Update Peak based on loaded data
    useEffect(() => {
        if (data.length > 0) {
            const max = Math.max(...data.map(d => d.requests));
            setPeakRPS(max);
        }
    }, []); // Run once on mount

    // Use a ref to track the last timestamp we pushed to avoid duplicates
    const lastPushRef = useRef<number>(0);

    // Keep latest stats in ref for the interval to access
    const latestStatsRef = useRef(currentStats);
    useEffect(() => {
        latestStatsRef.current = currentStats;
    }, [currentStats]);

    useEffect(() => {
        // Initialize with empty or realistic seed data if needed. 
        // For "Real-Time", starting empty is fine, it fills up in 60s.

        const interval = setInterval(() => {
            const now = Date.now();

            // Prevent duplicate seconds (debounce to 1s)
            if (now - lastPushRef.current < 1000) return;
            lastPushRef.current = now;

            const date = new Date(now);
            const timeLabel = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

            const stats = latestStatsRef.current;
            const prevStats = prevStatsRef.current;

            let realRequests = 0;
            let realApi = 0;
            let realSql = 0;

            // 1. Calculate Real Deltas
            if (stats && prevStats) {
                realRequests = Math.max(0, stats.total_requests - prevStats.total_requests);
                realApi = Math.max(0, stats.type_api_call - prevStats.type_api_call);
                realSql = Math.max(0, stats.type_sql_execution - prevStats.type_sql_execution);
            }

            // Update prev stats reference to current consumed state
            // Only if we actually have stats.
            if (stats) {
                prevStatsRef.current = { ...stats };
            }

            // 2. Real Data Only
            // User requested to remove mock simulation.

            let displayRequests = realRequests;
            let displayApi = realApi;
            let displaySql = realSql;

            // Update Peak
            setPeakRPS(prev => Math.max(prev, displayRequests));

            const newPoint: DataPoint = {
                timestamp: now,
                timeLabel,
                requests: displayRequests,
                api: displayApi,
                sql: displaySql,
            };

            setData(prev => {
                const newData = [...prev, newPoint];
                // Keep exactly last 60 points
                if (newData.length > 60) {
                    return newData.slice(newData.length - 60);
                }
                return newData;
            });

        }, 60000);

        return () => clearInterval(interval);
    }, []);


    // Averages (Rolling last 60s)
    const averages = useMemo(() => {
        if (data.length === 0) return { requests: 0, api: 0, sql: 0 };
        const sum = data.reduce((acc, curr) => ({
            requests: acc.requests + curr.requests,
            api: acc.api + curr.api,
            sql: acc.sql + curr.sql
        }), { requests: 0, api: 0, sql: 0 });

        return {
            requests: (sum.requests / data.length).toFixed(0),
            api: (sum.api / data.length).toFixed(0),
            sql: (sum.sql / data.length).toFixed(0)
        };
    }, [data]);

    const currentRPS = data.length > 0 ? data[data.length - 1].requests : 0;

    return (
        <Card className="col-span-4 h-full border-zinc-800 bg-zinc-950/40 backdrop-blur-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-white/5">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                        <Activity className="h-5 w-5 text-lime-400 animate-pulse" />
                        Real-Time Activity
                    </CardTitle>
                    <CardDescription className="text-zinc-400 font-medium">Live incoming requests</CardDescription>
                </div>

                {/* KPI Metrics */}
                <div className="flex gap-8">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Current</span>
                        <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${currentRPS > 40 ? 'bg-lime-500 animate-ping' : 'bg-lime-500'}`} />
                            <span className="text-2xl font-bold font-mono text-lime-400 drop-shadow-[0_0_15px_rgba(132,204,22,0.4)]">
                                {currentRPS}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Peak (60s)</span>
                        <span className="text-2xl font-bold font-mono text-zinc-300">
                            {peakRPS}
                        </span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Avg</span>
                        <span className="text-2xl font-bold font-mono text-zinc-500">
                            {averages.requests}
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pl-0 pb-0 pt-6">
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#84cc16" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSql" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            <CartesianGrid strokeDasharray="2 4" stroke="#ffffff10" vertical={false} />
                            <XAxis
                                dataKey="timeLabel"
                                stroke="#525252"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={50}
                                dy={10}
                            />
                            <YAxis
                                stroke="#525252"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                width={45}
                                domain={[0, 'auto']} // Let it scale
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl p-3 shadow-[0_0_20px_rgba(0,0,0,0.5)] min-w-[180px]">
                                                <div className="mb-2 border-b border-zinc-800 pb-2">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
                                                </div>
                                                <div className="space-y-2">
                                                    {payload.map((p: any) => (
                                                        <div key={p.name} className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.stroke }} />
                                                                <span className="text-xs font-medium text-zinc-300">{p.name}</span>
                                                            </div>
                                                            <span className="font-mono text-sm font-bold text-zinc-100">
                                                                {p.value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />

                            <Area
                                type="monotone"
                                dataKey="requests"
                                stroke="#84cc16"
                                strokeWidth={2}
                                fill="url(#colorRequests)"
                                filter="url(#glow)"
                                name="Total Requests"
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="api"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#colorApi)"
                                filter="url(#glow)"
                                name="API Calls"
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="sql"
                                stroke="#a855f7"
                                strokeWidth={2}
                                fill="url(#colorSql)"
                                filter="url(#glow)"
                                name="SQL Executions"
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
