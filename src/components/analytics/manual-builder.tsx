import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LayoutGrid, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createWidgetAction, getProjectTablesAction, getTableColumnsAction } from '@/app/(app)/analytics/actions';

export function ManualBuilder({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [chartType, setChartType] = useState('bar');
    const [saving, setSaving] = useState(false);
    
    // Schema Explorer State
    const [tables, setTables] = useState<any[]>([]);
    const [columns, setColumns] = useState<any[]>([]);
    const [selectedTable, setSelectedTable] = useState<{ id: string, name: string } | null>(null);
    const [xAxis, setXAxis] = useState('');
    const [yAxis, setYAxis] = useState('');
    const [aggregation, setAggregation] = useState('COUNT');
    
    const { toast } = useToast();

    useEffect(() => {
        if (open) {
            getProjectTablesAction(projectId).then(setTables).catch(e => console.error(e));
        }
    }, [open, projectId]);

    const handleTableChange = async (val: string) => {
        const tbl = tables.find(t => t.table_id === val);
        if (tbl) {
            setSelectedTable({ id: tbl.table_id, name: tbl.table_name });
            setXAxis('');
            setYAxis('');
            const cols = await getTableColumnsAction(projectId, tbl.table_id);
            setColumns(cols);
        }
    };

    const handleSave = async () => {
        if (!title || !selectedTable || !xAxis) {
            toast({ title: 'Missing fields', description: 'Please fill out all builder fields.', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            // Auto-generate SQL based on the visual builder mapping
            let finalQuery = '';
            if (aggregation === 'NONE' || !yAxis) {
                finalQuery = `SELECT ${xAxis} as name, 1 as value FROM ${selectedTable.name}`;
            } else if (aggregation === 'COUNT') {
                finalQuery = `SELECT ${xAxis} as name, COUNT(${yAxis === '*' ? '*' : yAxis}) as value FROM ${selectedTable.name} GROUP BY ${xAxis}`;
            } else {
                finalQuery = `SELECT ${xAxis} as name, ${aggregation}(${yAxis}) as value FROM ${selectedTable.name} GROUP BY ${xAxis}`;
            }

            await createWidgetAction(projectId, title, chartType, finalQuery, { xAxisKey: 'name', dataKeys: ['value'] });
            
            toast({ title: 'Success', description: 'Manual widget built and saved.' });
            setOpen(false);
            onSaved();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-white/5 border-white/10 hover:bg-white/10">
                    <LayoutGrid className="w-4 h-4" />
                    Visual Builder
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] border-white/10 bg-background/95 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle>Visual Widget Builder</DialogTitle>
                    <DialogDescription>Map your database schema directly to a chart visually.</DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                        <Label>Widget Title</Label>
                        <Input placeholder="e.g. Total Revenue by Customer" value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    
                    <div className="grid gap-2">
                        <Label>Source Table</Label>
                        <Select value={selectedTable?.id || ''} onValueChange={handleTableChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a table..." />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-white/10">
                                {tables.map(t => <SelectItem key={t.table_id} value={t.table_id}>{t.table_name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-3 gap-4 border-l-2 border-white/10 pl-4">
                        <div className="grid gap-2">
                            <Label className="text-emerald-400">Dimension (X-Axis)</Label>
                            <Select value={xAxis} onValueChange={setXAxis} disabled={!selectedTable}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Group By Column..." />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-white/10">
                                    {columns.map(c => <SelectItem key={c.column_name} value={c.column_name}>{c.column_name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-blue-400">Measure (Y-Axis)</Label>
                            <Select value={yAxis} onValueChange={setYAxis} disabled={!selectedTable}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Aggregate Column..." />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-white/10">
                                    <SelectItem value="*">* (All Rows)</SelectItem>
                                    {columns.map(c => <SelectItem key={c.column_name} value={c.column_name}>{c.column_name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-purple-400">Aggregation</Label>
                            <Select value={aggregation} onValueChange={setAggregation} disabled={!yAxis}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Function..." />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-white/10">
                                    <SelectItem value="COUNT">COUNT (Rows)</SelectItem>
                                    <SelectItem value="SUM">SUM (Total)</SelectItem>
                                    <SelectItem value="AVG">AVG (Average)</SelectItem>
                                    <SelectItem value="MIN">MIN (Minimum)</SelectItem>
                                    <SelectItem value="MAX">MAX (Maximum)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Chart Type</Label>
                        <Select value={chartType} onValueChange={setChartType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-white/10">
                                <SelectItem value="bar">Bar Chart</SelectItem>
                                <SelectItem value="column">Column Chart</SelectItem>
                                <SelectItem value="line">Line Chart</SelectItem>
                                <SelectItem value="area">Area Chart</SelectItem>
                                <SelectItem value="pie">Pie Graph</SelectItem>
                                <SelectItem value="donut">Donut Graph</SelectItem>
                                <SelectItem value="treemap">Treemap</SelectItem>
                                <SelectItem value="scatter">Scatter Plot</SelectItem>
                                <SelectItem value="radar">Radar Chart</SelectItem>
                                <SelectItem value="number">Number (KPI)</SelectItem>
                                <SelectItem value="table">Data Grid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <Button onClick={handleSave} disabled={saving} className="w-full bg-white text-black hover:bg-gray-200">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Saving...</> : <><Save className="w-4 h-4 mr-2"/> Generate & Pin to Dashboard</>}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
