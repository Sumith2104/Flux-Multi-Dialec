
"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

const chartData = [
    { time: "10:00", execution_time_ms: 45 },
    { time: "11:00", execution_time_ms: 60 },
    { time: "12:00", execution_time_ms: 52 },
    { time: "13:00", execution_time_ms: 90 },
    { time: "14:00", execution_time_ms: 40 },
]

export function QueryExecutionChart() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Query Execution Time</CardTitle>
                <CardDescription>Average execution time over the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <LineChart
                            data={chartData}
                            margin={{
                                left: 12,
                                right: 12,
                            }}
                        >
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="time"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                fontSize={12}
                                stroke="hsl(var(--muted-foreground))"
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                fontSize={12}
                                stroke="hsl(var(--muted-foreground))"
                                label={{ value: 'ms', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))' } }}
                            />
                            <Tooltip
                                cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "4 4" }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            Time
                                                        </span>
                                                        <span className="font-bold text-muted-foreground">
                                                            {payload[0].payload.time}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            Execution
                                                        </span>
                                                        <span className="font-bold">
                                                            {payload[0].value} ms
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Line
                                dataKey="execution_time_ms"
                                type="monotone"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                dot={{
                                    fill: "hsl(var(--primary))",
                                }}
                                activeDot={{
                                    r: 6,
                                }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
                <div className="flex gap-2 font-medium leading-none">
                    Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
                </div>
                <div className="leading-none text-muted-foreground">
                    Showing average execution time for the last 5 hours
                </div>
            </CardFooter>
        </Card>
    )
}
