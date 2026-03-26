import React from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, Treemap, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const COLORS = ['#f97316', '#e11d48', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
                <p className="text-white/70 text-xs mb-1 font-medium">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm font-bold text-white">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        {entry.name}: {entry.value}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export function UniversalChartRenderer({ type, data, config }: { type: string, data: any[], config: any }) {
    if (!data || data.length === 0) return <div className="flex h-full items-center justify-center text-muted-foreground text-sm font-medium">No data returned from query</div>;

    const { xAxisKey, dataKeys } = config;
    const primaryDataKey = dataKeys?.[0] || 'value';
    const cleanType = type.toLowerCase().replace('chart', '').trim();

    const renderChartGroup = (ChartComp: any, DataComps: any[], hasXAxis: boolean = true) => (
        <ResponsiveContainer width="100%" height="100%">
            <ChartComp data={data} margin={{ top: 40, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                {hasXAxis && <XAxis dataKey={xAxisKey} stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} dy={10} />}
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#fff', fontWeight: 500 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', top: 5, right: 5 }} verticalAlign="top" align="right" iconType="circle" />
                {
                    dataKeys?.map((key: string, idx: number) => React.createElement(DataComps[idx % DataComps.length], {
                        key: key,
                        type: "monotone",
                        dataKey: key,
                        name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                        fill: COLORS[idx % COLORS.length],
                        stroke: COLORS[idx % COLORS.length],
                        radius: [4, 4, 0, 0],
                        strokeWidth: 3
                    }))
                }
            </ChartComp>
        </ResponsiveContainer>
    );

    switch (cleanType) {
        case 'bar':
        case 'column':
            return renderChartGroup(BarChart, [Bar]);

        case 'line':
            return renderChartGroup(LineChart, [Line]);

        case 'area':
            return renderChartGroup(AreaChart, [Area]);

        case 'pie':
        case 'donut':
            const isDonut = cleanType === 'donut';
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', opacity: 0.8 }} iconType="circle" />
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={isDonut ? "60%" : "0%"}
                            outerRadius="80%"
                            paddingAngle={isDonut ? 5 : 0}
                            dataKey={primaryDataKey}
                            nameKey={xAxisKey}
                            stroke="rgba(0,0,0,0.5)"
                            strokeWidth={2}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            );

        case 'radar':
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={data} outerRadius="70%">
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey={xAxisKey} tick={{fill: "rgba(255,255,255,0.5)", fontSize: 11}} />
                        <PolarRadiusAxis angle={30} domain={['auto', 'auto']} tick={{fill: "rgba(255,255,255,0.3)", fontSize: 10}} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', opacity: 0.8 }} iconType="circle" />
                        {dataKeys.map((key: string, i: number) => (
                            <Radar key={key} name={key} dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />
                        ))}
                    </RadarChart>
                </ResponsiveContainer>
            );

        case 'scatter':
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" dataKey={xAxisKey} name={xAxisKey} stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 11}} axisLine={false} tickLine={false} />
                        <YAxis type="number" dataKey={primaryDataKey} name={primaryDataKey} stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 11}} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{strokeDasharray: '3 3'}} content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', opacity: 0.8 }} iconType="circle" />
                        <Scatter name={primaryDataKey} data={data} fill={COLORS[0]}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            );

        case 'treemap':
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                        data={data}
                        dataKey={primaryDataKey}
                        aspectRatio={4 / 3}
                        stroke="rgba(0,0,0,0.5)"
                        fill={COLORS[0]}
                    >
                        <Tooltip />
                    </Treemap>
                </ResponsiveContainer>
            );

        case 'kpi':
        case 'card':
        case 'number':
            const val = data[0]?.[primaryDataKey];
            const title = xAxisKey || primaryDataKey;
            return (
                <div className="flex flex-col items-center justify-center h-full w-full">
                    <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold mb-2">{title}</p>
                    <h1 className="text-6xl lg:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50">{val?.toLocaleString() || '0'}</h1>
                </div>
            );

        case 'table':
        case 'matrix':
            const columns = Object.keys(data[0] || {});
            return (
                <div className="w-full h-full overflow-auto scrollbar-thin scrollbar-thumb-white/10 relative">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead className="sticky top-0 bg-background/90 backdrop-blur-md z-10 border-b border-white/10">
                            <tr>
                                {columns.map(c => <th key={c} className="p-3 text-white/70 font-medium">{c}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                    {columns.map(c => <td key={c} className="p-3 text-white/90">{typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c])}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );

        default:
            return <div className="flex h-full items-center justify-center text-rose-400 text-sm">Unsupported Chart Type: {type}</div>;
    }
}
