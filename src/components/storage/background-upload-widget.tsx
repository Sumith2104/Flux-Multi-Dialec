"use client";

import { useUploadManager } from '@/contexts/upload-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, XCircle, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function BackgroundUploadWidget() {
    const { uploads, dismissUpload } = useUploadManager();
    const [minimized, setMinimized] = useState(false);

    if (uploads.length === 0) return null;

    const activeCount = uploads.filter(u => u.status === 'uploading').length;

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
            <Card className="border-border bg-card/95 backdrop-blur-md overflow-hidden">
                <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 text-foreground">
                        <Upload size={14} className="text-primary animate-pulse" />
                        {activeCount > 0 ? `Uploading ${activeCount} file${activeCount > 1 ? 's' : ''}...` : 'Background Uploads'}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => setMinimized(!minimized)}
                        >
                            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </Button>
                    </div>
                </CardHeader>

                {!minimized && (
                    <CardContent className="p-3 max-h-64 overflow-y-auto space-y-2.5">
                        {uploads.map(item => (
                            <div key={item.id} className="p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground truncate max-w-[200px]" title={item.fileName}>
                                        {item.fileName}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] text-muted-foreground">{formatBytes(item.fileSize)}</span>
                                        {item.status === 'uploading' && <Loader2 size={12} className="animate-spin text-primary" />}
                                        {item.status === 'completed' && <CheckCircle2 size={14} className="text-emerald-400" />}
                                        {item.status === 'failed' && <XCircle size={14} className="text-red-400" />}
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                            onClick={() => dismissUpload(item.id)}
                                        >
                                            <X size={12} />
                                        </Button>
                                    </div>
                                </div>

                                {item.status === 'uploading' && (
                                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                        <div 
                                            className="bg-primary h-full transition-all duration-300"
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                )}

                                {item.status === 'failed' && (
                                    <p className="text-[10px] text-red-400 truncate">{item.error || 'Upload failed'}</p>
                                )}
                            </div>
                        ))}
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
