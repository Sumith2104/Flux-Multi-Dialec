import { useQuery } from '@tanstack/react-query';
import { getProjectHistoryAction } from '@/app/(app)/dashboard/analytics-actions';

export interface ProjectHistory {
    daily?: Record<string, number>;
    monthly?: Record<string, number>;
    yearly?: Record<string, number>;
    requests: { val: number }[];
    apiCalls: { val: number }[];
    sessions: { val: number }[];
}

const FALLBACK: ProjectHistory = {
    requests: Array(24).fill({ val: 0 }),
    apiCalls: Array(24).fill({ val: 0 }),
    sessions: Array(24).fill({ val: 0 }),
};

export function useProjectHistory(projectId: string | undefined): ProjectHistory {
    // Phase 4: Migrated from raw setInterval to useQuery.
    // Old: standalone timer ran outside TanStack lifecycle — data was NEVER garbage-collected.
    // New: gcTime ensures eviction 10 min after dashboard unmounts.
    const { data } = useQuery({
        queryKey: ['project-history', projectId],
        queryFn: () => getProjectHistoryAction(projectId!),
        enabled: !!projectId,
        staleTime: 5 * 60 * 1000,    // Fresh for 5 minutes
        gcTime: 10 * 60 * 1000,       // Evict 10 min after unmount
        refetchInterval: 5 * 60 * 1000,
        select: (raw) => ({
            ...raw,
            requests: raw?.requests || FALLBACK.requests,
            apiCalls: raw?.apiCalls || FALLBACK.apiCalls,
            sessions: raw?.sessions || FALLBACK.sessions,
        }),
    });

    return data ?? FALLBACK;
}
