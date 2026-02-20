"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsStats } from '@/hooks/use-realtime-analytics';
import { Activity } from 'lucide-react';

interface RealtimeLineChartProps {
    currentStats: AnalyticsStats | null;
}

interface DataPoint {
    timestamp: number;
    timeLabel: string;
    requests: number;
    api: number;
    sql: number;
    deltaRequests: number;
    deltaApi: number;
    deltaSql: number;
}

const renderCustomDot = (props: any) => {
    const { cx, cy, index, dataKey, payload } = props;
    const isLatest = payload?.isLatest;

    // Only glow the latest point of the main "requests" line
    if (isLatest && dataKey === 'requests') {
        return (
            <g key={`dot-${index}`}>
                <circle cx={cx} cy={cy} r={6} fill="#84cc16" opacity={0.3}>
                    <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={cx} cy={cy} r={4} fill="#84cc16" stroke="#18181b" strokeWidth={2} />
            </g>
        );
    }
    return <g key={`dot-${index}`} />;
};

export function RealtimeLineChart({ currentStats }: RealtimeLineChartProps) {
    const [data, setData] = useState<DataPoint[]>(() => {
        const initialData: DataPoint[] = [];
        const now = Date.now();
        for (let i = 59; i >= 0; i--) {
            const time = now - i * 60000;
            const date = new Date(time);
            initialData.push({
                timestamp: time,
                timeLabel: date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }),
                requests: 0,
                api: 0,
                sql: 0,
                deltaRequests: 0,
                deltaApi: 0,
                deltaSql: 0,
            });
        }
        return initialData;
    });
    const [peakRPS, setPeakRPS] = useState(0);

    const prevStatsRef = useRef<AnalyticsStats | null>(null);
    const lastPushRef = useRef<number>(0);
    const latestStatsRef = useRef(currentStats);

    // Traffic momentum state for realistic mock generation
    const trafficStateRef = useRef({ base: 30, trend: 0 });

    useEffect(() => {
        latestStatsRef.current = currentStats;
    }, [currentStats]);

    useEffect(() => {
        // Run once per minute
        const interval = setInterval(() => {
            const now = Date.now();

            // Prevent duplicate executions
            if (now - lastPushRef.current < 59000) return;
            lastPushRef.current = now;

            const date = new Date(now);
            const timeLabel = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

            const stats = latestStatsRef.current;
            const prevStats = prevStatsRef.current;

            let realRequests = 0;
            let realApi = 0;
            let realSql = 0;

            if (stats && prevStats) {
                realRequests = Math.max(0, stats.total_requests - prevStats.total_requests);
                realApi = Math.max(0, stats.type_api_call - prevStats.type_api_call);
                realSql = Math.max(0, stats.type_sql_execution - prevStats.type_sql_execution);
            }

            if (stats) {
                prevStatsRef.current = { ...stats };
            }

            // Use strictly real data from Firestore DB
            let displayRequests = Math.round(realRequests);
            let displayApi = Math.round(realApi);
            let displaySql = Math.round(realSql);

            setPeakRPS(prev => Math.max(prev, displayRequests));

            setData(prev => {
                const prevPoint = prev.length > 0 ? prev[prev.length - 1] : null;
                const newPoint: DataPoint = {
                    timestamp: now,
                    timeLabel,
                    requests: displayRequests,
                    api: displayApi,
                    sql: displaySql,
                    deltaRequests: prevPoint ? displayRequests - prevPoint.requests : 0,
                    deltaApi: prevPoint ? displayApi - prevPoint.api : 0,
                    deltaSql: prevPoint ? displaySql - prevPoint.sql : 0,
                };

                const newData = [...prev, newPoint];
                // Keep exactly last 60 points
                if (newData.length > 60) {
                    return newData.slice(newData.length - 60);
                }
                return newData;
            });

        }, 60000); // 1 minute interval

        return () => clearInterval(interval);
    }, []);

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

    // Enhance data for chart rendering (adding isLatest flag)
    const chartData = data.map((d, i) => ({
        ...d,
        isLatest: i === data.length - 1
    }));

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
                            <div className={`h-2 w-2 rounded-full ${currentRPS > Math.max(40, Number(averages.requests) * 1.5) ? 'bg-lime-500 animate-ping' : 'bg-lime-500'}`} />
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
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={true} horizontal={true} />
                            <XAxis
                                dataKey="timeLabel"
                                stroke="#525252"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                                dy={10}
                                tick={{ fill: '#71717a' }}
                            />
                            <YAxis
                                stroke="#525252"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                width={50}
                                domain={[0, (dataMax: number) => Math.max(10, dataMax)]}
                                tick={{ fill: '#71717a' }}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl p-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)] min-w-[200px]">
                                                <div className="mb-2 border-b border-zinc-800 pb-2">
                                                    <p className="text-[10px] font-bold tracking-wider text-zinc-400">{label}</p>
                                                </div>
                                                <div className="space-y-2.5">
                                                    {payload.map((p: any) => {
                                                        const deltaKey = p.dataKey === 'requests' ? 'deltaRequests' : p.dataKey === 'api' ? 'deltaApi' : 'deltaSql';
                                                        const delta = p.payload[deltaKey] || 0;
                                                        const isPositive = delta > 0;
                                                        const isNegative = delta < 0;

                                                        return (
                                                            <div key={p.name} className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.stroke }} />
                                                                    <span className="text-xs font-medium text-zinc-300">{p.name}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-[10px] font-medium font-mono ${isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-zinc-500'}`}>
                                                                        {isPositive ? '+' : ''}{delta !== 0 ? delta : ''}
                                                                    </span>
                                                                    <span className="font-mono text-sm font-bold text-zinc-100 min-w-[3ch] text-right">
                                                                        {p.value}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
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
                                dot={renderCustomDot}
                                activeDot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="api"
                                stroke="#3b82f6"
                                strokeWidth={1.5}
                                fill="url(#colorApi)"
                                name="API Calls"
                                isAnimationActive={false}
                                dot={false}
                                activeDot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="sql"
                                stroke="#a855f7"
                                strokeWidth={1.5}
                                fill="url(#colorSql)"
                                name="SQL Executions"
                                isAnimationActive={false}
                                dot={false}
                                activeDot={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
