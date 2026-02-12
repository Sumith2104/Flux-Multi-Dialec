
"use client";

import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalyticsStats } from '@/hooks/use-realtime-analytics';

interface RealtimeLineChartProps {
    currentStats: AnalyticsStats | null;
}

interface DataPoint {
    time: string;
    requests: number;
    api: number;
    sql: number;
}

export function RealtimeLineChart({ currentStats }: RealtimeLineChartProps) {
    const [data, setData] = useState<DataPoint[]>([]);

    useEffect(() => {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const newPoint: DataPoint = {
            time: timeLabel,
            requests: currentStats?.total_requests ?? 0,
            api: currentStats?.type_api_call ?? 0,
            sql: currentStats?.type_sql_execution ?? 0,
        };

        setData(prev => {
            const newData = [...prev, newPoint];
            // Keep last 20 points
            if (newData.length > 20) {
                return newData.slice(newData.length - 20);
            }
            return newData;
        });

    }, [currentStats]);
    // Note: Dependent on currentStats changing. If stats don't change, chart won't update. 
    // In a high-volume app, this is fine. For low volume, we might want a timer to push "no change" points,
    // but for "Requests Cumulative", it works to just show the step up.
    // Actually, if it's cumulative, a line chart will just go up. 
    // IF the user wants "Throughput" (Requests per second), we need to calculate delta.
    // The user said "Numbers", so cumulative is likely expected for the counters, but typically line charts show rate.
    // Let's stick to showing the stored cumulative counters for now as it matches the "numbers". 
    // If it looks flat, that's accurate.

    return (
        <Card className="col-span-4 h-full"> {/* Span full width */}
            <CardHeader>
                <CardTitle>Real-Time Activity</CardTitle>
                <CardDescription>Live incoming requests</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                            dataKey="time"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[0.70rem] uppercase text-muted-foreground">Requests</span>
                                                    <span className="font-bold text-muted-foreground">{payload[0].value}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[0.70rem] uppercase text-muted-foreground">API</span>
                                                    <span className="font-bold text-muted-foreground">{payload[1].value}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[0.70rem] uppercase text-muted-foreground">SQL</span>
                                                    <span className="font-bold text-muted-foreground">{payload[2].value}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                                return null
                            }}
                        />
                        <Line type="monotone" dataKey="requests" stroke="#adfa1d" strokeWidth={2} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="api" stroke="#2563eb" strokeWidth={2} />
                        <Line type="monotone" dataKey="sql" stroke="#d946ef" strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
