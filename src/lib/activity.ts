
import { adminDb } from '@/lib/firebase-admin';

export async function logLoginActivity(userId: string, email: string, ip: string, userAgent: string) {
    try {
        await adminDb.collection('users').doc(userId).collection('login_history').add({
            email,
            ip,
            user_agent: userAgent,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Failed to log login activity:", error);
        // Don't throw, as this is non-critical
    }
}
