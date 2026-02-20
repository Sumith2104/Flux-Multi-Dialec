
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
        color: "#22c55e",
    },
    insert: {
        label: "INSERT",
        color: "#3b82f6",
    },
    update: {
        label: "UPDATE",
        color: "#a855f7",
    },
    delete: {
        label: "DELETE",
        color: "#ef4444",
    },
    alter: {
        label: "ALTER",
        color: "#f59e0b",
    },
} satisfies ChartConfig

export function QueryTypeChart({ stats }: { stats: AnalyticsStats | null }) {

    const chartData = React.useMemo(() => {
        if (!stats) return [
            { browser: "select", visitors: 0, fill: "#22c55e" },
            { browser: "insert", visitors: 0, fill: "#3b82f6" },
            { browser: "update", visitors: 0, fill: "#a855f7" },
            { browser: "delete", visitors: 0, fill: "#ef4444" },
            { browser: "alter", visitors: 0, fill: "#f59e0b" },
        ];

        return [
            { browser: "select", visitors: stats.type_sql_select || 0, fill: "#22c55e" },
            { browser: "insert", visitors: stats.type_sql_insert || 0, fill: "#3b82f6" },
            { browser: "update", visitors: stats.type_sql_update || 0, fill: "#a855f7" },
            { browser: "delete", visitors: stats.type_sql_delete || 0, fill: "#ef4444" },
            { browser: "alter", visitors: stats.type_sql_alter || 0, fill: "#f59e0b" },
        ]
    }, [stats]);

    const totalVisitors = React.useMemo(() => {
        return chartData.reduce((acc, curr) => acc + curr.visitors, 0)
    }, [chartData])

    return (
        <Card className="flex flex-col aspect-square justify-between border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-lg overflow-hidden transition-colors hover:bg-zinc-900/60">
            <CardHeader className="items-center pb-4 border-b border-white/5 bg-zinc-900/20">
                <CardTitle className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                    Query Type
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pt-6 pb-6 flex items-center justify-center">
                <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square w-full max-h-[250px] drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                >
                    <PieChart>
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent hideLabel />}
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
