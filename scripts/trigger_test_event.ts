
import 'dotenv/config';
import { Pool } from 'pg';
import { fireWebhooks } from '../src/lib/webhooks';

const projectId = '2f8a8e951c394c13';

async function run() {
    try {
        const pool = new Pool({
            connectionString: process.env.AWS_RDS_POSTGRES_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        // 1. Get a test user ID
        const memberRes = await pool.query('SELECT user_id FROM fluxbase_global.project_members WHERE project_id = $1 LIMIT 1', [projectId]);
        
        if (memberRes.rows.length === 0) {
            console.error('No members found for this project.');
            await pool.end();
            return;
        }
        
        const userId = memberRes.rows[0].user_id;
        await pool.end();

        console.log(`🚀 Triggering test webhook for Project: ${projectId}, User: ${userId}`);
        
        // 2. Fire the webhook manually using the internal engine
        await fireWebhooks(
            projectId,
            userId,
            'test_table',
            'row.inserted',
            { id: 999, name: 'Antigravity Test Row', status: 'verified' },
            undefined
        );

        console.log(`\n✅ Dispatch command sent. Check terminal logs for "[Webhook Engine]" messages.`);

    } catch (err: any) {
        console.error('Trigger error:', err.message);
    }
}

run();
