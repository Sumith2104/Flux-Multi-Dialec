'use client';

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Clock, Play, Trash2 } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';

export interface HistoryItem {
    id: string;
    query: string;
    timestamp: number;
    success: boolean;
}

interface QueryHistoryProps {
    history: HistoryItem[];
    onSelectQuery: (query: string) => void;
    onClearHistory: () => void;
}

export function QueryHistory({ history, onSelectQuery, onClearHistory }: QueryHistoryProps) {
    if (history.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                <Clock className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No history yet.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-2 border-b">
                <span className="text-xs font-semibold">History ({history.length})</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClearHistory}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <ScrollArea className="flex-grow">
                <div className="divide-y">
                    {history.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onSelectQuery(item.query)}
                            className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex flex-col gap-1 group"
                        >
                            <div className="flex items-start justify-between w-full">
                                <span className={`text-xs font-mono line-clamp-2 break-all ${item.success ? 'text-foreground' : 'text-destructive'}`}>
                                    {item.query}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                    {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                                </span>
                                <Play className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                            </div>
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
