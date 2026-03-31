"use client"

import { useState, useEffect, useContext } from "react"
import { useSearchParams } from "next/navigation"
import { ProjectContext } from "@/contexts/project-context"
import {
    History,
    Search,
    User as UserIcon,
    Calendar,
    Code,
    Database,
    Tag,
    ChevronRight,
    SearchX,
    Filter,
    ArrowUpDown,
    Eye,
    Globe,
    AlertCircle,
    Info
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription
} from "@/components/ui/dialog"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface AuditLog {
    id: string
    userId: string
    userEmail: string
    action: string
    statement: string
    createdAt: string
    metadata: any
}

export default function ActivityPage() {
    const { project } = useContext(ProjectContext)
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

    useEffect(() => {
        if (!project?.project_id) return

        const fetchLogs = async () => {
            setLoading(true)
            try {
                const response = await fetch(`/api/audit?projectId=${project.project_id}&search=${encodeURIComponent(search)}`)
                const data = await response.json()
                setLogs(data.logs || [])
            } catch (error) {
                console.error("Failed to fetch logs:", error)
            } finally {
                setLoading(false)
            }
        }

        const timer = setTimeout(fetchLogs, 300)
        return () => clearTimeout(timer)
    }, [project?.project_id, search])

    const getActionColor = (action: string) => {
        const a = action.toLowerCase()
        if (a.includes('create') || a.includes('insert')) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
        if (a.includes('update') || a.includes('edit')) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
        if (a.includes('delete') || a.includes('drop')) return "bg-rose-500/10 text-rose-500 border-rose-500/20"
        if (a.includes('sql')) return "bg-amber-500/10 text-amber-500 border-amber-500/20"
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
    }

    const getActionIcon = (action: string) => {
        const a = action.toLowerCase()
        if (a.includes('sql')) return <Code className="h-3 w-3 mr-1.5" />
        if (a.includes('table')) return <Database className="h-3 w-3 mr-1.5" />
        if (a.includes('schema')) return <Globe className="h-3 w-3 mr-1.5" />
        return <Tag className="h-3 w-3 mr-1.5" />
    }

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <History className="h-6 w-6 text-primary" />
                        </div>
                        Recent Activity
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Audit trail for <span className="font-medium text-foreground">{project?.display_name}</span>. Trace all actions and structural changes.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative w-full md:w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search actions or statements..."
                            className="pl-9 bg-white/5 border-white/10"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="border border-white/10 rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-3xl shadow-2xl">
                <Table>
                    <TableHeader className="bg-white/5">
                        <TableRow className="hover:bg-transparent border-white/10">
                            <TableHead className="w-[180px]">Timestamp</TableHead>
                            <TableHead className="w-[150px]">User</TableHead>
                            <TableHead className="w-[150px]">Action</TableHead>
                            <TableHead>Statement / description</TableHead>
                            <TableHead className="text-right">Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i} className="border-white/5">
                                    <TableCell><Skeleton className="h-4 w-24 bg-white/5" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-32 bg-white/5" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-20 rounded-full bg-white/5" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full bg-white/5" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-lg ml-auto bg-white/5" /></TableCell>
                                </TableRow>
                            ))
                        ) : logs.length > 0 ? (
                            logs.map((log) => (
                                <TableRow key={log.id} className="hover:bg-white/5 border-white/5 transition-colors group">
                                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                                        <div className="flex flex-col">
                                            <span className="text-foreground/80 font-medium">
                                                {new Date(log.createdAt).toLocaleDateString()}
                                            </span>
                                            <span>
                                                {new Date(log.createdAt).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                {log.userEmail?.[0].toUpperCase() || 'A'}
                                            </div>
                                            <span className="text-sm truncate max-w-[120px]">{log.userEmail || 'Anonymous'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn("px-2 py-0.5 font-bold uppercase text-[9px] tracking-wider rounded-md", getActionColor(log.action))}>
                                            {getActionIcon(log.action)}
                                            {log.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="max-w-[400px] truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:break-all transition-all duration-300">
                                            <code className="text-[12px] bg-black/40 px-1.5 py-0.5 rounded text-zinc-300 border border-white/5">
                                                {log.statement}
                                            </code>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 hover:bg-primary/20 hover:text-primary transition-all rounded-[12px]" 
                                                    onClick={() => setSelectedLog(log)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[600px] bg-zinc-950 border-white/10 rounded-[40px] shadow-2xl backdrop-blur-3xl !rounded-[40px]">
                                                <DialogHeader>
                                                    <DialogTitle className="flex items-center gap-2">
                                                        <Info className="h-5 w-5 text-primary" />
                                                        Activity Details
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        Full log data and technical metadata.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                
                                                <div className="space-y-6 pt-4">
                                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                                        <div className="space-y-1 p-3 bg-white/5 rounded-2xl border border-white/10">
                                                            <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Action</p>
                                                            <p className="font-medium text-primary uppercase tracking-wide">{log.action}</p>
                                                        </div>
                                                        <div className="space-y-1 p-3 bg-white/5 rounded-2xl border border-white/10">
                                                            <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Time</p>
                                                            <p className="font-medium">{new Date(log.createdAt).toLocaleString()}</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest px-1">Raw Statement</p>
                                                        <div className="p-4 bg-black/60 rounded-[24px] border border-white/10 font-mono text-[13px] text-emerald-400 overflow-x-auto">
                                                            {log.statement}
                                                        </div>
                                                    </div>

                                                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                        <div className="space-y-2">
                                                            <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest px-1">Metadata (JSON)</p>
                                                            <div className="p-4 bg-black/60 rounded-[24px] border border-white/10 font-mono text-[12px] text-blue-400 overflow-x-auto max-h-[300px]">
                                                                <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-[400px] text-center">
                                    <div className="flex flex-col items-center justify-center gap-4 py-12">
                                        <div className="p-4 bg-muted/20 rounded-full">
                                            <SearchX className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xl font-semibold">No activity logs found</p>
                                            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                                                {search ? "No logs match your search. Try a different query." : "As soon as you perform an action in this project, it will appear here."}
                                            </p>
                                        </div>
                                        {search && (
                                            <Button variant="outline" onClick={() => setSearch("")} className="mt-2 border-white/10">
                                                Clear Search
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Footer Tip */}
            <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-[24px]">
                <AlertCircle className="h-5 w-5 text-amber-500/50" />
                <p className="text-[13px] text-muted-foreground">
                    <span className="text-amber-500/80 font-semibold mr-1">Pro Tip:</span>
                    Detailed logs are kept for 30 days. For long-term retention or compliance, consider enabling automated weekly email reports in settings.
                </p>
            </div>
        </div>
    )
}
