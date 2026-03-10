"use client";

import { useEffect, useState, useRef, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsStats, useRealtimeAnalytics } from '@/hooks/use-realtime-analytics';
import { useRealtimeHistory } from '@/hooks/use-realtime-history';
import { Activity } from 'lucide-react';

interface RealtimeLineChartProps {
    projectId: string;
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

    // Only show a subtle dot at the latest point
    if (isLatest && dataKey === 'requests') {
        return (
            <g key={`dot-${index}`}>
                <circle cx={cx} cy={cy} r={3} fill="#94a3b8" stroke="#18181b" strokeWidth={2} />
            </g>
        );
    }
    return <g key={`dot-${index}`} />;
};

export function RealtimeLineChart({ projectId }: RealtimeLineChartProps) {
    const stats = useRealtimeAnalytics(projectId);
    const prevStatsRef = useRef<AnalyticsStats | null>(null);

    const [data, setData] = useState<DataPoint[]>(() => {
        const initialData: DataPoint[] = [];
        const now = Date.now();
        for (let i = 59; i >= 0; i--) {
            const time = now - i * 2500;
            const date = new Date(time);
            initialData.push({
                timestamp: time,
                timeLabel: date.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
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

    // Keep track of the absolute stats independently
    const currentStatsRef = useRef<AnalyticsStats | null>(null);
    const prevTickStatsRef = useRef<AnalyticsStats | null>(null);

    // Update our ref whenever SSE pushes new data
    useEffect(() => {
        if (stats) {
            currentStatsRef.current = stats;
        }
    }, [stats]);

    // Independent smooth visual ticking interval
    useEffect(() => {
        const tickInterval = setInterval(() => {
            const current = currentStatsRef.current;
            const prev = prevTickStatsRef.current;

            // If we have an older baseline, calculate the delta
            let deltaReq = 0, deltaA = 0, deltaS = 0;

            if (current && prev) {
                deltaReq = Math.max(0, current.total_requests - prev.total_requests);
                deltaA = Math.max(0, current.type_api_call - prev.type_api_call);
                deltaS = Math.max(0, current.type_sql_execution - prev.type_sql_execution);
            }

            // Always tick the previous ref up so we don't double-count on the next interval
            if (current) {
                prevTickStatsRef.current = current;
            }

            const now = Date.now();
            const date = new Date(now);

            setData(currentData => {
                const newData = [...currentData];
                // Smoothly shift left
                newData.shift();
                newData.push({
                    timestamp: now,
                    timeLabel: date.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
                    requests: deltaReq,
                    api: deltaA,
                    sql: deltaS,
                    deltaRequests: deltaReq,
                    deltaApi: deltaA,
                    deltaSql: deltaS
                });
                return newData;
            });

            setPeakRPS(prevPeak => Math.max(prevPeak, deltaReq));
        }, 2000); // 2-second reliable local tick

        return () => clearInterval(tickInterval);
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
        <Card className="col-span-4 flex flex-col h-full min-h-[400px] border-zinc-800 bg-zinc-950/40 backdrop-blur-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-white/5">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                        <Activity className="h-5 w-5 text-zinc-500" />
                        Real-Time Activity
                    </CardTitle>
                    <CardDescription className="text-zinc-400 font-medium">Live incoming requests</CardDescription>
                </div>

                {/* KPI Metrics */}
                <div className="flex gap-8">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Current</span>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-orange-500/70" />
                            <span className="text-2xl font-bold font-mono text-orange-400">
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
            <CardContent className="pl-0 pb-0 pt-6 flex-1 flex flex-col">
                <div className="flex-1 w-full min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSql" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#78716c" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#78716c" stopOpacity={0} />
                                </linearGradient>
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
                                stroke="#f97316"
                                strokeWidth={1.5}
                                fill="url(#colorRequests)"
                                name="Total Requests"
                                isAnimationActive={false}
                                dot={renderCustomDot}
                                activeDot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="api"
                                stroke="#ea580c"
                                strokeWidth={1}
                                strokeOpacity={0.7}
                                fill="url(#colorApi)"
                                name="API Calls"
                                isAnimationActive={false}
                                dot={false}
                                activeDot={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="sql"
                                stroke="#78716c"
                                strokeWidth={1}
                                strokeOpacity={0.7}
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
