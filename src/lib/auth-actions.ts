'use server';

import { getPgPool } from '@/lib/pg';
import type { User } from '@/lib/auth';

export async function findUserById(userId: string): Promise<User | null> {
    try {
        const pool = getPgPool();
        const result = await pool.query('SELECT * FROM fluxbase_global.users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            id: row.id,
            email: row.email,
            display_name: row.display_name,
            created_at: row.created_at.toISOString(),
        } as User;
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return null;
    }
}

export async function deleteUserAccount(userId: string) {
    const pool = getPgPool();
    // 1. Get all user projects
    const result = await pool.query('SELECT project_id FROM fluxbase_global.projects WHERE user_id = $1', [userId]);

    // 2. Delete each project natively (Drop schema)
    for (const row of result.rows) {
        await pool.query(`DROP SCHEMA IF EXISTS "project_${row.project_id}" CASCADE`);
    }

    // 3. Delete user profile (Also remove projects from metadata table)
    await pool.query('DELETE FROM fluxbase_global.projects WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM fluxbase_global.users WHERE id = $1', [userId]);
}
