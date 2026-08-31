import { getPgPool } from '@/lib/pg';
import logger from '@/lib/logger';

export async function logLoginActivity(userId: string, email: string, ip: string, userAgent: string) {
    try {
        const pool = getPgPool();
        await pool.query(
            'INSERT INTO fluxbase_global.login_history (user_id, email, ip, user_agent) VALUES ($1, $2, $3, $4)',
            [userId, email, ip, userAgent]
        );
    } catch (error) {
        logger.error("Failed to log login activity:", error);
    }
}
