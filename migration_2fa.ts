import { getPgPool } from './src/lib/pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runMigration() {
    const pool = getPgPool();
    try {
        console.log('Running 2FA Migration...');
        await pool.query(`
            ALTER TABLE fluxbase_global.users 
            ADD COLUMN IF NOT EXISTS two_factor_secret TEXT, 
            ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
        `);
        console.log('Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
