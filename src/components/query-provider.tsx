'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // Data is considered fresh for 2 minutes — prevents refetch spam
                staleTime: 2 * 60 * 1000,
                // Evict from JS heap 5 minutes after all subscribers unmount
                // Key memory lever: keeps heap from growing unboundedly
                gcTime: 5 * 60 * 1000,
                // Don't refetch just because user switches browser tabs
                refetchOnWindowFocus: false,
                // Cap retries to 1 to avoid zombie requests adding to memory pressure
                retry: 1,
                // Don't retry on mount by default — let queries opt-in if needed
                refetchOnMount: true,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
