import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth';
import { getDashboardWidgets } from '@/lib/dashboards';
import AnalyticsDashboardClient from '@/app/(app)/analytics/client';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/login');

    const searchParamsAwaited = await searchParams;
    const projectId = searchParamsAwaited.projectId;
    if (!projectId) redirect('/dashboard/projects');

    let widgets: any[] = [];
    try {
        widgets = await getDashboardWidgets(projectId, userId);
    } catch (e) {
        console.error('Failed to fetch dashboard widgets:', e);
    }

    return <AnalyticsDashboardClient projectId={projectId} initialWidgets={widgets} />;
}
