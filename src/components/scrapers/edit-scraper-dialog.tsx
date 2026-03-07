import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Globe, Database, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Mapping {
    column: string;
    selector: string;
}

export function EditScraperDialog({ scraper, onSaved }: { scraper: any; onSaved: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);

    const [url, setUrl] = useState('');
    const [targetTable, setTargetTable] = useState('');
    const [schedule, setSchedule] = useState('manual');
    const [mappings, setMappings] = useState<Mapping[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open && scraper) {
            setUrl(scraper.url);
            setTargetTable(scraper.table_name);
            setSchedule(scraper.schedule);

            let parsedSelectors: Record<string, string> = {};
            try {
                parsedSelectors = typeof scraper.selectors === 'string' ? JSON.parse(scraper.selectors) : scraper.selectors;
            } catch (e) { }

            const initialMappings: Mapping[] = [];
            // Ensure 'item' is always handled first
            if (parsedSelectors['item']) {
                initialMappings.push({ column: 'item', selector: parsedSelectors['item'] });
            } else {
                initialMappings.push({ column: 'item', selector: '' });
            }

            for (const [col, sel] of Object.entries(parsedSelectors)) {
                if (col !== 'item') {
                    initialMappings.push({ column: col, selector: sel as string });
                }
            }

            setMappings(initialMappings);
        }
    }, [open, scraper]);

    const addMapping = () => {
        setMappings([...mappings, { column: '', selector: '' }]);
    };

    const removeMapping = (index: number) => {
        const newMappings = [...mappings];
        newMappings.splice(index, 1);
        setMappings(newMappings);
    };

    const updateMapping = (index: number, field: 'column' | 'selector', value: string) => {
        const newMappings = [...mappings];
        newMappings[index][field] = value;
        setMappings(newMappings);
    };

    const handleSubmit = async () => {
        if (!url || !targetTable) {
            toast({ variant: 'destructive', title: 'Missing Fields', description: 'URL and Target Table are required.' });
            return;
        }

        const validMappings = mappings.filter(m => m.column.trim() !== '' && m.selector.trim() !== '');
        if (!validMappings.find(m => m.column === 'item')) {
            toast({ variant: 'destructive', title: 'Missing Item Selector', description: 'You must provide an "item" selector to group rows.' });
            return;
        }

        const selectorsObj: Record<string, string> = {};
        validMappings.forEach(m => {
            selectorsObj[m.column] = m.selector;
        });

        setIsLoading(true);
        try {
            const res = await fetch('/api/scrapers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scraperId: scraper.scraper_id,
                    url,
                    tableName: targetTable,
                    selectors: selectorsObj,
                    schedule
                })
            });

            const data = await res.json();
            if (data.success) {
                toast({ title: 'Pipeline Updated', description: 'Changes have been saved successfully.' });
                setOpen(false);
                onSaved();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: data.error });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl px-6 py-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>Edit Pipeline</DialogTitle>
                    <DialogDescription>Modify settings for {scraper?.table_name}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Target URL</Label>
                            <Input placeholder="https://example.com/products" value={url} onChange={e => setUrl(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Target DB Table</Label>
                            <Input placeholder="e.g. products_scraped" value={targetTable} onChange={e => setTargetTable(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Schedule</Label>
                        <Select value={schedule} onValueChange={setSchedule}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">Manual Execution Only</SelectItem>
                                <SelectItem value="hourly">Every Hour</SelectItem>
                                <SelectItem value="every 6 hours">Every 6 Hours</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold text-sm">CSS Selectors</h4>
                            </div>
                            <Button size="sm" variant="outline" onClick={addMapping}><Plus className="h-3.5 w-3.5 mr-1" /> Add Field</Button>
                        </div>

                        {mappings.map((mapping, idx) => (
                            <div key={idx} className="flex gap-2 items-center bg-muted/20 p-2 rounded-md border border-white/5">
                                <div className="flex-1">
                                    <Input
                                        placeholder="Column Name"
                                        value={mapping.column}
                                        readOnly={mapping.column === 'item'}
                                        onChange={e => updateMapping(idx, 'column', e.target.value)}
                                        className={mapping.column === 'item' ? 'bg-muted/50 cursor-not-allowed' : ''}
                                    />
                                </div>
                                <div className="flex-1">
                                    <Input
                                        placeholder="CSS Selector (e.g. .product-card)"
                                        value={mapping.selector}
                                        onChange={e => updateMapping(idx, 'selector', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeMapping(idx)}
                                        disabled={mapping.column === 'item'}
                                        className="text-muted-foreground hover:text-red-400"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <DialogFooter className="mt-6 border-t pt-4">
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
