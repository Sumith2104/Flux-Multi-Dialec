
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
        <Card className="flex flex-col aspect-square justify-between">
            <CardHeader className="items-center pb-0">
                <CardTitle>Query Type Distribution</CardTitle>
                <CardDescription>Breakdown of executed SQL queries</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square max-h-[250px]"
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
                            innerRadius={60}
                            strokeWidth={5}
                        >
                            <Label
                                content={({ viewBox }) => {
                                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                        return (
                                            <text
                                                x={viewBox.cx}
                                                y={viewBox.cy}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                            >
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={viewBox.cy}
                                                    className="fill-foreground text-3xl font-bold"
                                                >
                                                    {totalVisitors.toLocaleString()}
                                                </tspan>
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={(viewBox.cy || 0) + 24}
                                                    className="fill-muted-foreground text-xs"
                                                >
                                                    Total Queries
                                                </tspan>
                                            </text>
                                        )
                                    }
                                }}
                            />
                        </Pie>
                    </PieChart>
                </ChartContainer>
            </CardContent>
            <CardFooter className="flex-col gap-2 text-sm">
                <div className="leading-none text-muted-foreground">
                    Showing total queries for the last 30 days
                </div>
            </CardFooter>
        </Card>
    )
}
