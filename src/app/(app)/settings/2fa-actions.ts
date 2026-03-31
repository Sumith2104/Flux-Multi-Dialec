'use server';

import { getCurrentUserId } from '@/lib/auth';
import { getPgPool } from '@/lib/pg';
import { generateSecret, verifyTOTPCode } from '@/lib/2fa';
import { revalidatePath } from 'next/cache';

export async function setup2FAAction() {
    const userId = await getCurrentUserId();
    if (!userId) return { error: 'Unauthorized' };

    try {
        const pool = getPgPool();
        const secret = generateSecret();
        
        // We store the secret but keep it disabled until verified
        await pool.query(
            'UPDATE fluxbase_global.users SET two_factor_secret = $1, two_factor_enabled = FALSE WHERE id = $2::text',
            [secret, userId]
        );

        const { rows } = await pool.query('SELECT email FROM fluxbase_global.users WHERE id = $1::text', [userId]);
        const email = rows[0]?.email;

        const { getQRCodeUrl } = await import('@/lib/2fa');
        const qrUrl = getQRCodeUrl(email, secret);

        return { success: true, secret, qrUrl };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function verifyAndEnable2FAAction(code: string) {
    const userId = await getCurrentUserId();
    if (!userId) return { error: 'Unauthorized' };

    try {
        const pool = getPgPool();
        const { rows } = await pool.query(
            'SELECT two_factor_secret FROM fluxbase_global.users WHERE id = $1::text',
            [userId]
        );

        const secret = rows[0]?.two_factor_secret;
        if (!secret) return { error: '2FA not set up' };

        if (verifyTOTPCode(secret, code)) {
            await pool.query(
                'UPDATE fluxbase_global.users SET two_factor_enabled = TRUE WHERE id = $1::text',
                [userId]
            );
            revalidatePath('/settings');
            return { success: true };
        } else {
            return { error: 'Invalid verification code' };
        }
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function disable2FAAction(code: string) {
    const userId = await getCurrentUserId();
    if (!userId) return { error: 'Unauthorized' };

    try {
        const pool = getPgPool();
        const { rows } = await pool.query(
            'SELECT two_factor_secret FROM fluxbase_global.users WHERE id = $1::text',
            [userId]
        );

        const secret = rows[0]?.two_factor_secret;
        if (!secret) return { error: '2FA not enabled' };

        if (verifyTOTPCode(secret, code)) {
            await pool.query(
                'UPDATE fluxbase_global.users SET two_factor_enabled = FALSE, two_factor_secret = NULL WHERE id = $1::text',
                [userId]
            );
            revalidatePath('/settings');
            return { success: true };
        } else {
            return { error: 'Invalid verification code' };
        }
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function get2FAStatusAction() {
    const userId = await getCurrentUserId();
    if (!userId) return { enabled: false };

    try {
        const pool = getPgPool();
        const { rows } = await pool.query(
            'SELECT two_factor_enabled, two_factor_secret FROM fluxbase_global.users WHERE id = $1::text',
            [userId]
        );
        const user = rows[0];
        return { 
            enabled: user?.two_factor_enabled || false,
            hasSecret: !!user?.two_factor_secret
        };
    } catch (error) {
        return { enabled: false };
    }
}
