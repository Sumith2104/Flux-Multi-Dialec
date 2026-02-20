
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type AnalyticsType = 'api_call' | 'sql_execution' | 'storage_read' | 'storage_write';

export async function trackApiRequest(projectId: string, type: AnalyticsType) {
    if (!projectId) return;

    try {
        const statsRef = adminDb
            .collection('projects')
            .doc(projectId)
            .collection('stats')
            .doc('general');

        await statsRef.set({
            total_requests: FieldValue.increment(1),
            [`type_${type}`]: FieldValue.increment(1),
            last_updated: FieldValue.serverTimestamp()
        }, { merge: true });

        // Add time-bucketed history
        const now = new Date();
        const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const hourString = String(now.getUTCHours()).padStart(2, '0'); // 00-23

        const historyRef = adminDb
            .collection('projects')
            .doc(projectId)
            .collection('stats_history')
            .doc(dateString);

        await historyRef.set({
            [`${hourString}_total_requests`]: FieldValue.increment(1),
            [`${hourString}_type_${type}`]: FieldValue.increment(1),
        }, { merge: true });

    } catch (error) {
        console.error(`Failed to track analytics for project ${projectId}:`, error);
        // We don't want to fail the request just because analytics failed
    }
}
