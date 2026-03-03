import { getPgPool } from '@/lib/pg';

export async function logLoginActivity(userId: string, email: string, ip: string, userAgent: string) {
    try {
        const pool = getPgPool();
        await pool.query(
            'INSERT INTO fluxbase_global.login_history (user_id, email, ip, user_agent) VALUES ($1, $2, $3, $4)',
            [userId, email, ip, userAgent]
        );
    } catch (error) {
        console.error("Failed to log login activity:", error);
    }
}
