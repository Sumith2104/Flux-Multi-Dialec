
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface StorageChartProps {
    data: {
        name: string;
        size: number;
    }[];
}

const formatSize = (kb: number) => {
    if (kb > 1023) {
        return `${(kb / 1024).toFixed(2)} MB`;
    }
    return `${kb.toFixed(2)} KB`;
}

const formatAxisLabel = (value: number) => {
    if (value > 1023) {
        return `${(value / 1024).toFixed(0)} MB`;
    }
    return `${value} KB`;
};


const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    const value = payload[0].value as number;
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col space-y-1">
            <span className="text-[0.70rem] uppercase text-muted-foreground">
              Table
            </span>
            <span className="font-bold text-muted-foreground">{label}</span>
          </div>
          <div className="flex flex-col space-y-1">
            <span className="text-[0.70rem] uppercase text-muted-foreground">
              Size
            </span>
            <span className="font-bold">{formatSize(value)}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export function StorageChart({ data }: StorageChartProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Table Storage Usage</CardTitle>
                <CardDescription>Size of each table's CSV file.</CardDescription>
            </CardHeader>
            <CardContent>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart
                            data={data}
                            margin={{
                                top: 5,
                                right: 20,
                                left: -10,
                                bottom: 5,
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatAxisLabel} />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--accent))' }}
                                content={<CustomTooltip />}
                            />
                            <Bar dataKey="size" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
