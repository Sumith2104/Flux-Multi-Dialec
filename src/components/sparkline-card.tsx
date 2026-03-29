"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
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
    const [isHovered, setIsHovered] = useState(false);
    const activeColor = isHovered ? "#ea580c" : "#52525b"; // grey initially, orange on hover

    return (
        <Card 
            className="h-full w-full aspect-square flex flex-col justify-between relative overflow-hidden group border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-lg transition-colors hover:bg-zinc-900/60"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Background Sparkline layer */}
            <div className="absolute inset-0 z-0 opacity-40 hover:opacity-100 transition-opacity duration-700 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                    {type === "line" ? (
                        <LineChart data={data}>
                            <Tooltip
                                cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
                                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", color: "#fff" }}
                                itemStyle={{ color: activeColor }}
                                labelStyle={{ display: "none" }}
                            />
                            <YAxis hide domain={[0, (dataMax: number) => Math.max(10, dataMax)]} />
                            <Line
                                type="monotone"
                                dataKey="val"
                                stroke={activeColor}
                                strokeWidth={3}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    ) : type === "bar" ? (
                        <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: -10 }}>
                            <Tooltip
                                cursor={{ fill: "rgba(255,255,255,0.1)" }}
                                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", color: "#fff" }}
                                itemStyle={{ color: activeColor }}
                                labelStyle={{ display: "none" }}
                            />
                            <YAxis hide domain={[0, (dataMax: number) => Math.max(10, dataMax)]} />
                            <Bar
                                dataKey="val"
                                fill={activeColor}
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={false}
                            />
                        </BarChart>
                    ) : (
                        <AreaChart data={data}>
                            <Tooltip
                                cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
                                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", color: "#fff" }}
                                itemStyle={{ color: activeColor }}
                                labelStyle={{ display: "none" }}
                            />
                            <YAxis hide domain={[0, (dataMax: number) => Math.max(10, dataMax)]} />
                            <defs>
                                <linearGradient id={`color-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={activeColor} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={activeColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="val"
                                stroke={activeColor}
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
            <div className="relative z-10 flex flex-col justify-between h-full p-6 pointer-events-none">
                <CardHeader className="p-0 pb-2">
                    <CardTitle className="text-sm font-bold tracking-wider uppercase text-zinc-500 flex items-center gap-2">
                        {title}
                        {type === "line" && (
                            <div className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="text-4xl font-black tracking-tight text-white">
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
