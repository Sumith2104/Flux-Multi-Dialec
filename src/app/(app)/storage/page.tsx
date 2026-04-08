'use client';

import { useState, useContext, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectContext } from '@/contexts/project-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    Folder, FolderOpen, Upload, Plus, Trash2, Copy, Check, Edit2,
    File, Image, FileText, FileArchive, Loader2, HardDrive, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Bucket { id: string; name: string; is_public: boolean; created_at: string; total_size?: number; }
interface StorageFile {
    id: string; name: string; s3_key: string; size: number;
    mime_type: string; created_at: string;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(mime: string) {
    if (mime.startsWith('image/')) return <Image className="h-4 w-4 text-blue-400" />;
    if (mime === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />;
    if (mime.includes('zip')) return <FileArchive className="h-4 w-4 text-yellow-400" />;
    return <File className="h-4 w-4 text-zinc-400" />;
}

export default function StoragePage() {
    const { project } = useContext(ProjectContext);
    const queryClient = useQueryClient();
    const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [newBucketName, setNewBucketName] = useState('');
    const [creatingBucket, setCreatingBucket] = useState(false);
    const [showNewBucket, setShowNewBucket] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
    const [editBucketName, setEditBucketName] = useState('');
    const [deletingBucketId, setDeletingBucketId] = useState<string | null>(null);
    const [bucketToDelete, setBucketToDelete] = useState<Bucket | null>(null);
    const [fileToDelete, setFileToDelete] = useState<StorageFile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const projectId = project?.project_id;

    // Load buckets (Smart Cached)
    const { data: buckets = [], isLoading: loadingBuckets } = useQuery<Bucket[]>({
        queryKey: ['storage-buckets', projectId],
        queryFn: async () => {
            if (!projectId) return [];
            const res = await fetch(`/api/storage/buckets?projectId=${projectId}`);
            const data = await res.json();
            return data.success ? data.buckets : [];
        },
        enabled: !!projectId,
        staleTime: 60 * 1000,
    });

    const totalProjectSize = buckets.reduce((acc, b) => acc + (Number(b.total_size) || 0), 0);

    // Load files in selected bucket (Smart Cached)
    const { data: files = [], isLoading: loadingFiles } = useQuery<StorageFile[]>({
        queryKey: ['storage-files', projectId, selectedBucket?.id],
        queryFn: async () => {
            if (!projectId || !selectedBucket) return [];
            const res = await fetch(`/api/storage/files?bucketId=${selectedBucket.id}&projectId=${projectId}`);
            const data = await res.json();
            return data.success ? data.files : [];
        },
        enabled: !!projectId && !!selectedBucket,
        staleTime: 60 * 1000,
    });

    // Upload file
    const uploadFile = async (file: File) => {
        if (!projectId || !selectedBucket) return;
        setUploading(true);
        setUploadProgress(`Uploading ${file.name}…`);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('bucketId', selectedBucket.id);
            formData.append('projectId', projectId);
            const res = await fetch('/api/storage/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!data.success) { setError(typeof data.error === 'object' ? data.error.message : (data.error || 'Upload failed')); return; }
            queryClient.invalidateQueries({ queryKey: ['storage-files', projectId, selectedBucket.id] });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
            setUploadProgress(null);
        }
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        for (const file of droppedFiles) {
            await uploadFile(file);
        }
    };

    // Create bucket
    const createBucket = async () => {
        if (!projectId || !newBucketName.trim()) return;
        setCreatingBucket(true);
        setError(null);
        try {
            const res = await fetch('/api/storage/buckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, name: newBucketName.trim().toLowerCase() })
            });
            const data = await res.json();
            if (!data.success) { setError(typeof data.error === 'object' ? data.error.message : (data.error || 'Failed to create bucket')); return; }
            setNewBucketName('');
            setShowNewBucket(false);
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', projectId] });
            setSelectedBucket(data.bucket);
        } finally {
            setCreatingBucket(false);
        }
    };

    // Delete file
    const deleteFile = async (file: StorageFile) => {
        if (!projectId) return;
        setDeletingId(file.id);
        try {
            const res = await fetch('/api/storage/files', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: file.id, s3Key: file.s3_key, projectId })
            });
            const data = await res.json();
            if (data.success) {
                queryClient.setQueryData(['storage-files', projectId, selectedBucket?.id], (old: StorageFile[] | undefined) => 
                    old ? old.filter(f => f.id !== file.id) : []
                );
            }
        } finally {
            setDeletingId(null);
        }
    };

    // Rename bucket
    const updateBucket = async (bucket: Bucket) => {
        if (!projectId || !editBucketName.trim() || editBucketName === bucket.name) {
            setEditingBucketId(null);
            return;
        }
        setError(null);
        try {
            const res = await fetch('/api/storage/buckets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucketId: bucket.id, projectId, name: editBucketName.trim().toLowerCase() })
            });
            const data = await res.json();
            if (!data.success) { setError(typeof data.error === 'object' ? data.error.message : (data.error || 'Failed to rename bucket')); return; }
            setEditingBucketId(null);
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', projectId] });
            if (selectedBucket?.id === bucket.id) setSelectedBucket(data.bucket);
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Delete bucket
    const deleteBucket = async (bucket: Bucket) => {
        if (!projectId) return;
        setDeletingBucketId(bucket.id);
        setError(null);
        try {
            const res = await fetch('/api/storage/buckets', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucketId: bucket.id, projectId })
            });
            const data = await res.json();
            if (!data.success) { setError(typeof data.error === 'object' ? data.error.message : (data.error || 'Failed to delete bucket')); return; }
            if (selectedBucket?.id === bucket.id) setSelectedBucket(null);
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', projectId] });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setDeletingBucketId(null);
        }
    };

    // Copy signed URL
    const copySignedUrl = async (file: StorageFile) => {
        if (!projectId) return;
        try {
            const res = await fetch(`/api/storage/url?s3Key=${encodeURIComponent(file.s3_key)}&projectId=${projectId}`);
            const data = await res.json();
            if (data.url) {
                await navigator.clipboard.writeText(data.url);
                setCopiedId(file.id);
                setTimeout(() => setCopiedId(null), 2000);
            }
        } catch (e) {}
    };

    if (!projectId) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                <HardDrive className="h-12 w-12 opacity-25" />
                <p className="text-lg font-medium">No project selected</p>
                <p className="text-sm">Select a project to manage its storage.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <HardDrive className="h-8 w-8 text-primary" /> Storage
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Secure file storage backed by AWS S3 — private by default, signed URLs on demand.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-mono text-xs px-2.5 py-1">
                            Total Project Usage: {formatBytes(totalProjectSize)}
                        </Badge>
                    </div>
                </div>
                {selectedBucket && (
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Upload File
                    </Button>
                )}
                <input ref={fileInputRef} type="file" className="hidden" multiple onChange={async (e) => { 
                    const selectedFiles = Array.from(e.target.files || []);
                    for (const f of selectedFiles) { await uploadFile(f); }
                    e.target.value = ''; 
                }} />
            </div>

            {error && (
                <div className="flex items-center gap-3 bg-destructive/15 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
                    <X className="h-4 w-4 shrink-0" /> {typeof error === 'object' ? (error as any).message || JSON.stringify(error) : error}
                    <button onClick={() => setError(null)} className="ml-auto"><X className="h-3 w-3" /></button>
                </div>
            )}

            <div className="flex gap-4 min-h-[500px]">
                {/* Bucket Sidebar */}
                <div className="w-[20%] shrink-0">
                    <Card className="h-full relative overflow-hidden group border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-lg transition-colors hover:bg-zinc-900/60">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Buckets</CardTitle>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewBucket(v => !v)}>
                                    <Plus className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-1">
                            {showNewBucket && (
                                <div className="flex gap-2 mb-3">
                                    <Input
                                        value={newBucketName}
                                        onChange={e => setNewBucketName(e.target.value)}
                                        placeholder="bucket-name"
                                        className="h-8 text-xs"
                                        onKeyDown={e => e.key === 'Enter' && createBucket()}
                                        autoFocus
                                    />
                                    <Button size="sm" className="h-8 px-2" onClick={createBucket} disabled={creatingBucket}>
                                        {creatingBucket ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    </Button>
                                </div>
                            )}
                            {loadingBuckets ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            ) : buckets.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Folder className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                    <p className="text-xs">No buckets yet.<br />Click + to create one.</p>
                                </div>
                            ) : buckets.map(bucket => (
                                <div
                                    key={bucket.id}
                                    className={cn(
                                        'w-full flex justify-between items-center group px-3 py-2 rounded-lg text-sm transition-colors text-left cursor-pointer',
                                        selectedBucket?.id === bucket.id
                                            ? 'bg-primary/15 text-primary border border-primary/20'
                                            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                                    )}
                                    onClick={() => {
                                        if (editingBucketId !== bucket.id) setSelectedBucket(bucket);
                                    }}
                                >
                                    {editingBucketId === bucket.id ? (
                                        <div className="flex gap-2 w-full">
                                            <Input
                                                value={editBucketName}
                                                onChange={e => setEditBucketName(e.target.value)}
                                                className="h-7 text-xs flex-1"
                                                autoFocus
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') updateBucket(bucket);
                                                    if (e.key === 'Escape') setEditingBucketId(null);
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            />
                                            <Button size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); updateBucket(bucket); }}>
                                                <Check className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                                                {selectedBucket?.id === bucket.id
                                                    ? <FolderOpen className="h-4 w-4 shrink-0" />
                                                    : <Folder className="h-4 w-4 shrink-0" />}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="truncate font-medium">{bucket.name}</span>
                                                    <span className="text-[10px] opacity-60 font-mono">{formatBytes(Number(bucket.total_size) || 0)}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 hover:bg-zinc-700/50 hover:text-white"
                                                    title="Rename bucket"
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        setEditingBucketId(bucket.id); 
                                                        setEditBucketName(bucket.name); 
                                                    }}
                                                >
                                                    <Edit2 className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400"
                                                    title="Delete bucket"
                                                    disabled={deletingBucketId === bucket.id}
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        setBucketToDelete(bucket);
                                                    }}
                                                >
                                                    {deletingBucketId === bucket.id ? <Loader2 className="h-3 w-3 animate-spin text-red-400" /> : <Trash2 className="h-3 w-3" />}
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* File Browser */}
                <div className="flex-1">
                    <Card className="h-full relative overflow-hidden group border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-lg transition-colors hover:bg-zinc-900/60">
                        <CardHeader className="pb-3 border-b border-zinc-800/50">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">
                                    {selectedBucket ? (
                                        <span className="flex items-center gap-2">
                                            <FolderOpen className="h-4 w-4 text-primary" />
                                            {selectedBucket.name}
                                            <Badge variant="secondary" className="text-xs ml-1">{files.length} files</Badge>
                                        </span>
                                    ) : 'Select a Bucket'}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 h-[calc(100%-65px)]">
                            {!selectedBucket ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                                    <Folder className="h-16 w-16 opacity-15" />
                                    <p className="text-sm">Select or create a bucket to view files.</p>
                                </div>
                            ) : (
                                <div
                                    className={cn(
                                        'h-full flex flex-col transition-colors',
                                        dragOver && 'bg-primary/5 border-2 border-dashed border-primary/40'
                                    )}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={onDrop}
                                >
                                    {uploadProgress && (
                                        <div className="flex items-center gap-3 bg-primary/10 border-b border-primary/20 px-4 py-2.5 text-sm text-primary">
                                            <Loader2 className="h-4 w-4 animate-spin" /> {uploadProgress}
                                        </div>
                                    )}
                                    {loadingFiles ? (
                                        <div className="flex justify-center items-center h-full">
                                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : files.length === 0 ? (
                                        <div
                                            className="flex flex-col items-center justify-center h-full gap-3 cursor-pointer"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Upload className="h-14 w-14 opacity-15" />
                                            <p className="font-medium text-muted-foreground">Drop files here or click Upload</p>
                                            <p className="text-xs text-muted-foreground/60">Images, PDFs, CSVs, JSON, ZIP supported</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wide">
                                                        <th className="px-4 py-3 font-medium">Name</th>
                                                        <th className="px-4 py-3 font-medium">Type</th>
                                                        <th className="px-4 py-3 font-medium">Size</th>
                                                        <th className="px-4 py-3 font-medium">Uploaded</th>
                                                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {files.map(file => (
                                                        <tr key={file.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 group transition-colors">
                                                            <td className="px-4 py-3 font-medium text-zinc-200">
                                                                <div className="flex items-center gap-2.5">
                                                                    {getFileIcon(file.mime_type)}
                                                                    <span className="truncate max-w-[200px]">{file.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-zinc-500 text-xs">{file.mime_type.split('/')[1]?.toUpperCase() || 'FILE'}</td>
                                                            <td className="px-4 py-3 text-zinc-400">{formatBytes(file.size)}</td>
                                                            <td className="px-4 py-3 text-zinc-500 text-xs">
                                                                {new Date(file.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button
                                                                        variant="ghost" size="icon"
                                                                        className="h-7 w-7 hover:bg-zinc-700"
                                                                        title="Copy signed URL (15 min)"
                                                                        onClick={() => copySignedUrl(file)}
                                                                    >
                                                                        {copiedId === file.id
                                                                            ? <Check className="h-3.5 w-3.5 text-green-400" />
                                                                            : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost" size="icon"
                                                                        className="h-7 w-7 hover:bg-red-500/10 hover:text-red-400"
                                                                        title="Delete file"
                                                                        onClick={() => setFileToDelete(file)}
                                                                        disabled={deletingId === file.id}
                                                                    >
                                                                        {deletingId === file.id
                                                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                            : <Trash2 className="h-3.5 w-3.5" />}
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Bucket Delete Dialog */}
            <AlertDialog open={!!bucketToDelete} onOpenChange={() => setBucketToDelete(null)}>
                <AlertDialogContent className="border-zinc-800 bg-zinc-950">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Bucket</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong className="text-white">{bucketToDelete?.name}</strong>? 
                            This cannot be undone. The bucket must be completely empty before it can be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="border-zinc-800 hover:bg-zinc-800 hover:text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={() => {
                                if (bucketToDelete) deleteBucket(bucketToDelete);
                                setBucketToDelete(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* File Delete Dialog */}
            <AlertDialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
                <AlertDialogContent className="border-zinc-800 bg-zinc-950">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete File</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong className="text-white">{fileToDelete?.name}</strong>? 
                            This action cannot be undone and the file will be permanently removed from storage.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="border-zinc-800 hover:bg-zinc-800 hover:text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={() => {
                                if (fileToDelete) deleteFile(fileToDelete);
                                setFileToDelete(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
