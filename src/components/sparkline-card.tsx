"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SparklineCardProps {
    title: string;
    value: React.ReactNode;
    subtitle: React.ReactNode;
    type: "line" | "bar" | "area";
    color: string;
    data: { val: number }[]; // Receives authenticated 24-hour historical data from DB
}

export function SparklineCard({ title, value, subtitle, type, color, data }: SparklineCardProps) {
    return (
        <Card className="aspect-square flex flex-col justify-between relative overflow-hidden group border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-lg transition-colors hover:bg-zinc-900/60">
            {/* Background Sparkline layer */}
            <div className="absolute inset-0 z-0 opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none pb-4">
                <ResponsiveContainer width="100%" height="100%">
                    {type === "line" ? (
                        <LineChart data={data}>
                            <Line
                                type="monotone"
                                dataKey="val"
                                stroke={color}
                                strokeWidth={3}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    ) : type === "bar" ? (
                        <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: -10 }}>
                            <Bar
                                dataKey="val"
                                fill={color}
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={false}
                            />
                        </BarChart>
                    ) : (
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id={`color-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="val"
                                stroke={color}
                                fillOpacity={1}
                                fill={`url(#color-${title.replace(/\s+/g, '')})`}
                                isAnimationActive={false}
                                strokeWidth={2}
                            />
                        </AreaChart>
                    )}
                </ResponsiveContainer>
            </div>

            {/* Foreground Content */}
            <div className="relative z-10 flex flex-col justify-between h-full p-6">
                <CardHeader className="p-0 pb-2">
                    <CardTitle className="text-sm font-bold tracking-wider uppercase text-zinc-500 flex items-center gap-2">
                        {title}
                        {type === "line" && (
                            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500 shadow-[0_0_12px_#22c55e]" />
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="text-4xl font-black tracking-tight" style={{ color: type === "line" ? "#fff" : color }}>
                        {value}
                    </div>
                    <p className="text-xs text-zinc-400 font-medium mt-1 truncate">
                        {subtitle}
                    </p>
                </CardContent>
            </div>
        </Card>
    );
}
