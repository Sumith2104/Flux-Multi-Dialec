"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface ActiveUpload {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    bucketId: string;
    projectId: string;
    progress: number; // 0 to 100
    status: 'uploading' | 'completed' | 'failed';
    error?: string;
}

interface UploadContextType {
    uploads: ActiveUpload[];
    enqueueUpload: (file: File, bucketId: string, projectId: string) => Promise<void>;
    dismissUpload: (id: string) => void;
}

const UploadContext = createContext<UploadContextType>({
    uploads: [],
    enqueueUpload: async () => {},
    dismissUpload: () => {},
});

export const useUploadManager = () => useContext(UploadContext);

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const [uploads, setUploads] = useState<ActiveUpload[]>([]);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const updateUploadState = (id: string, patch: Partial<ActiveUpload>) => {
        setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
    };

    const enqueueUpload = useCallback(async (file: File, bucketId: string, projectId: string) => {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        const newUpload: ActiveUpload = {
            id: uploadId,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            bucketId,
            projectId,
            progress: 5,
            status: 'uploading'
        };

        setUploads(prev => [newUpload, ...prev]);

        try {
            // Step 1: Get presigned upload URL
            const presignRes = await fetch('/api/storage/upload/presign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || 'application/octet-stream',
                    bucketId,
                    projectId
                })
            });

            const presignData = await presignRes.json();
            if (!presignData.success) {
                throw new Error(typeof presignData.error === 'object' ? presignData.error.message : (presignData.error || 'Failed to get upload URL'));
            }

            const { uploadUrl, s3Key, actualBucketId } = presignData;
            updateUploadState(uploadId, { progress: 30 });

            // Step 2: Direct browser upload to AWS S3
            const s3Res = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type || 'application/octet-stream'
                }
            });

            if (!s3Res.ok) {
                throw new Error(`S3 upload failed with status ${s3Res.status}`);
            }

            updateUploadState(uploadId, { progress: 80 });

            // Step 3: Finalize metadata in DB
            const finalizeRes = await fetch('/api/storage/upload/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || 'application/octet-stream',
                    bucketId: actualBucketId,
                    projectId,
                    s3Key
                })
            });

            const finalizeData = await finalizeRes.json();
            if (!finalizeData.success) {
                throw new Error(typeof finalizeData.error === 'object' ? finalizeData.error.message : (finalizeData.error || 'Failed to record file metadata'));
            }

            updateUploadState(uploadId, { progress: 100, status: 'completed' });
            
            // Invalidate queries so UI updates seamlessly
            queryClient.invalidateQueries({ queryKey: ['storage-files', projectId, bucketId] });
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', projectId] });

            toast({
                title: "Upload Completed",
                description: `Successfully uploaded ${file.name}`
            });

        } catch (error: any) {
            updateUploadState(uploadId, { 
                status: 'failed', 
                error: error.message || 'Upload failed' 
            });
            toast({
                variant: "destructive",
                title: "Upload Failed",
                description: `${file.name}: ${error.message || 'Upload failed'}`
            });
        }
    }, [queryClient, toast]);

    const dismissUpload = useCallback((id: string) => {
        setUploads(prev => prev.filter(u => u.id !== id));
    }, []);

    return (
        <UploadContext.Provider value={{ uploads, enqueueUpload, dismissUpload }}>
            {children}
        </UploadContext.Provider>
    );
}
