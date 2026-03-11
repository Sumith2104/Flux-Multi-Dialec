"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react"

interface EditScraperDialogProps {
    scraper: any | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function EditScraperDialog({ scraper, open, onOpenChange, onSuccess }: EditScraperDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [url, setUrl] = useState("")
    const [tableName, setTableName] = useState("")
    const [fields, setFields] = useState<{ name: string, selector: string }[]>([])
    const [schedule, setSchedule] = useState("manual")

    useEffect(() => {
        if (scraper && open) {
            setUrl(scraper.url || "")
            setTableName(scraper.table_name || "")
            setSchedule(scraper.schedule || "manual")
            if (scraper.selectors && typeof scraper.selectors === 'object') {
                const decodedFields = Object.entries(scraper.selectors)
                    .filter(([k]) => k !== 'item') // Filter out the 'item' selector if it exists from old data
                    .map(([k, v]) => ({ name: k, selector: v as string }));
                setFields(decodedFields.length > 0 ? decodedFields : [{ name: "", selector: "" }]);
            }
            setError(null)
        }
    }, [scraper, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!scraper) return

        setLoading(true)
        setError(null)

        try {
            const payloadSelectors: Record<string, string> = {};
            let hasFields = false;
            for (const f of fields) {
                if (f.name.trim() && f.selector.trim()) {
                    payloadSelectors[f.name.trim()] = f.selector.trim();
                    hasFields = true;
                }
            }

            if (!hasFields) {
                throw new Error("You must add at least one data column to extract.");
            }

            const res = await fetch("/api/scrapers", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: scraper.id,
                    url,
                    tableName,
                    selectors: payloadSelectors,
                    schedule
                }),
            })

            const data = await res.json()
            if (!data.success) throw new Error(data.error || "Failed to update scraper")

            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Edit Web Scraper</DialogTitle>
                    <DialogDescription>
                        Update the extraction configuration for this engine job.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-md text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Target URL</Label>
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Target Table Name</Label>
                        <Input
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            required
                        />
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
                                <SelectItem value="daily">Every Day</SelectItem>
                                <SelectItem value="weekly">Every Week</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-4 border rounded-md p-4 bg-muted/10">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-orange-500 font-bold">Data Columns</Label>
                                <Button type="button" variant="outline" size="sm" onClick={() => setFields([...fields, { name: "", selector: "" }])}>
                                    <Plus className="h-3 w-3 mr-1" /> Add Column
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">Define the elements to extract text from.</p>

                            <div className="space-y-2">
                                {fields.map((field, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input
                                            placeholder="Column Name (e.g. price)"
                                            value={field.name}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].name = e.target.value;
                                                setFields(newFields);
                                            }}
                                            required
                                        />
                                        <Input
                                            placeholder="CSS Selector (e.g. .price)"
                                            value={field.selector}
                                            onChange={(e) => {
                                                const newFields = [...fields];
                                                newFields[index].selector = e.target.value;
                                                setFields(newFields);
                                            }}
                                            required
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:bg-destructive/10 shrink-0"
                                            onClick={() => setFields(fields.filter((_, i) => i !== index))}
                                            disabled={fields.length === 1}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
