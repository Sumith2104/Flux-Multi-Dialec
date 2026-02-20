
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

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const formatAxisLabel = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(0)) + ' ' + sizes[i];
};


const formatTableName = (name: string) => {
  return name.split('_').map(word => Math.max(word.length, 0) ? word.charAt(0).toUpperCase() + word.slice(1) : '').join(' ');
};

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    const value = payload[0].value as number;
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl p-4 shadow-[0_4px_30px_rgba(0,0,0,0.8)] min-w-[160px] flex gap-4 justify-between items-center transition-all">
        <div className="flex flex-col space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {formatTableName(String(label))}
          </span>
          <span className="font-mono text-xl font-bold text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">
            {formatSize(value)}
          </span>
        </div>
        <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,1)]" />
      </div>
    );
  }

  return null;
};

const CustomXAxisTick = ({ x, y, payload }: any) => {
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="end"
        fill="#71717a" // zinc-500
        fontSize={11}
        transform="rotate(-45)"
        className="animate-fade-in-up"
        style={{
          animationFillMode: 'both',
          animationDuration: '500ms',
          animationDelay: `${payload.index * 50}ms`
        }}
      >
        {formatTableName(String(payload.value))}
      </text>
    </g>
  );
};

export function StorageChart({ data }: StorageChartProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md shadow-2xl">
      <CardHeader className="border-b border-white/5 pb-4">
        <CardTitle className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          Storage Usage
        </CardTitle>
        <CardDescription className="text-zinc-400 font-medium">Size of each table's documents</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div style={{ width: '100%', height: 350 }}>
          <ResponsiveContainer>
            <BarChart
              data={data}
              margin={{
                top: 5,
                right: 20,
                left: -10,
                bottom: 60,
              }}
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={<CustomXAxisTick />}
                interval={0} // Force show all labels
              />
              <YAxis
                stroke="#525252"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisLabel}
                tick={{ fill: '#71717a' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                content={<CustomTooltip />}
              />
              <Bar
                dataKey="size"
                fill="url(#barGradient)"
                radius={[4, 4, 0, 0]}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
