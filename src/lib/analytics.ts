
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type AnalyticsType = 'api_call' | 'sql_execution' | 'storage_read' | 'storage_write' | 'sql_select' | 'sql_insert' | 'sql_update' | 'sql_delete' | 'sql_alter';

export async function trackApiRequest(projectId: string, type: AnalyticsType) {
    if (!projectId) return;

    try {
        const statsRef = adminDb
            .collection('projects')
            .doc(projectId)
            .collection('stats')
            .doc('general');

        const now = new Date();
        const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const hourString = String(now.getUTCHours()).padStart(2, '0'); // 00-23
        const minuteString = String(now.getUTCMinutes()).padStart(2, '0');

        const isMasterRequest = ['api_call', 'storage_read', 'storage_write'].includes(type);

        const generalUpdate: Record<string, any> = {
            [`type_${type}`]: FieldValue.increment(1),
            last_updated: FieldValue.serverTimestamp()
        };

        const historyUpdate: Record<string, any> = {
            [`${hourString}_type_${type}`]: FieldValue.increment(1),
        };

        const realtimeUpdate: Record<string, any> = {
            [`${hourString}:${minuteString}_type_${type}`]: FieldValue.increment(1),
        };

        if (isMasterRequest) {
            generalUpdate['total_requests'] = FieldValue.increment(1);
            historyUpdate[`${hourString}_total_requests`] = FieldValue.increment(1);
            realtimeUpdate[`${hourString}:${minuteString}_total_requests`] = FieldValue.increment(1);
        }

        await statsRef.set(generalUpdate, { merge: true });

        const historyRef = adminDb
            .collection('projects')
            .doc(projectId)
            .collection('stats_history')
            .doc(dateString);

        await historyRef.set(historyUpdate, { merge: true });

        const realtimeRef = adminDb
            .collection('projects')
            .doc(projectId)
            .collection('stats_realtime')
            .doc(dateString); // Store minutes under the current day document

        await realtimeRef.set(realtimeUpdate, { merge: true });

    } catch (error) {
        console.error(`Failed to track analytics for project ${projectId}:`, error);
        // We don't want to fail the request just because analytics failed
    }
}
