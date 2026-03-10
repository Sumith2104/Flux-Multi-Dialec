
'use client';

import * as React from "react"
import { TrendingUp } from "lucide-react"
import { Label, Pie, PieChart, Sector } from "recharts"
import { PieSectorDataItem } from "recharts/types/polar/Pie"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart"
import { AnalyticsStats } from "@/hooks/use-realtime-analytics";

const chartConfig = {
    visitors: {
        label: "Queries",
    },
    select: {
        label: "SELECT",
        color: "#f97316",
    },
    insert: {
        label: "INSERT",
        color: "#fb923c",
    },
    update: {
        label: "UPDATE",
        color: "#fdba74",
    },
    delete: {
        label: "DELETE",
        color: "#78716c",
    },
    alter: {
        label: "ALTER",
        color: "#44403c",
    },
} satisfies ChartConfig

export function QueryTypeChart({ stats }: { stats: AnalyticsStats | null }) {

    const chartData = React.useMemo(() => {
        if (!stats) return [
            { browser: "select", visitors: 0, fill: "#f97316" },
            { browser: "insert", visitors: 0, fill: "#fb923c" },
            { browser: "update", visitors: 0, fill: "#fdba74" },
            { browser: "delete", visitors: 0, fill: "#78716c" },
            { browser: "alter", visitors: 0, fill: "#44403c" },
        ];

        return [
            { browser: "select", visitors: stats.type_sql_select || 0, fill: "#f97316" },
            { browser: "insert", visitors: stats.type_sql_insert || 0, fill: "#fb923c" },
            { browser: "update", visitors: stats.type_sql_update || 0, fill: "#fdba74" },
            { browser: "delete", visitors: stats.type_sql_delete || 0, fill: "#78716c" },
            { browser: "alter", visitors: stats.type_sql_alter || 0, fill: "#44403c" },
        ]
    }, [stats]);

    const totalVisitors = React.useMemo(() => {
        return chartData.reduce((acc, curr) => acc + curr.visitors, 0)
    }, [chartData])

    return (
        <Card className="w-52 h-52 flex flex-col justify-between border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-lg overflow-hidden transition-colors hover:bg-zinc-900/60">
            <CardHeader className="items-center py-2 border-b border-white/5 bg-zinc-900/20">
                <CardTitle className="text-xs font-bold text-zinc-500 flex items-center gap-2 uppercase tracking-wider">
                    Query Type
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 py-1 flex items-center justify-center">
                <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square w-full max-h-[100px]"
                >
                    <PieChart>
                        <ChartTooltip
                            cursor={false}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl p-3 shadow-2xl min-w-[140px]">
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: data.fill }} />
                                                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">{data.browser}</span>
                                                <span className="ml-auto font-mono text-sm font-bold text-zinc-100">{data.visitors}</span>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Pie
                            data={chartData}
                            dataKey="visitors"
                            nameKey="browser"
                            stroke="rgba(24,24,27,0.8)" /* zinc-900 border separating slices */
                            strokeWidth={2}
                            isAnimationActive={true}
                        />
                    </PieChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
