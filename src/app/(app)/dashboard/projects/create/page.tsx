'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CreateProjectRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard/projects');
    }, [router]);

    return (
        <div className="flex h-full w-full min-h-[60vh] flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Redirecting to project creation dashboard...</p>
        </div>
    );
}
