
import { config } from 'dotenv';
import { Pool } from 'pg';
import { fireWebhooks } from '../src/lib/webhooks';
import crypto from 'crypto';

config({ path: '.env.local' });

const projectId = '2f8a8e951c394c13';
const webhookSiteUrl = 'https://webhook.site/13b90c46-d467-42cc-9a76-31cbd5ae85a5';

async function run() {
    console.log('--- LIVE WEBHOOK TEST SETUP V2 ---');
    
    if (!process.env.AWS_RDS_POSTGRES_URL) {
        console.error('❌ Error: AWS_RDS_POSTGRES_URL missed from .env.local');
        return;
    }

    const pool = new Pool({
        connectionString: process.env.AWS_RDS_POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // 1. Get User ID
        const memberRes = await pool.query('SELECT user_id FROM fluxbase_global.project_members WHERE project_id = $1 LIMIT 1', [projectId]);
        
        if (memberRes.rows.length === 0) {
            console.error('❌ Error: No members found for project.');
            return;
        }
        
        const userId = memberRes.rows[0].user_id;

        // 2. Register Webhook
        const webhookId = crypto.randomUUID().replace(/-/g, '').substring(0, 20);
        await pool.query(`
            INSERT INTO fluxbase_global.webhooks (webhook_id, project_id, user_id, name, url, event, table_id, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [webhookId, projectId, userId, 'LIVE TEST: Webhook.site', webhookSiteUrl, '*', '*', true]);

        console.log(`✅ Registered Webhook: ${webhookSiteUrl}`);

        // 3. Trigger immediate event
        console.log('Sending test payload...');
        await fireWebhooks(
            projectId,
            userId,
            'orders',
            'row.inserted',
            { id: 'ORD-777', amount: 125.50, currency: 'USD', status: 'paid' },
            undefined
        );

        console.log('\n🚀 ALL DONE! Open the link in your browser to see the data.');

    } catch (err: any) {
        console.error('💥 Setup error in diagnostic script:');
        console.error(err);
    } finally {
        await pool.end();
    }
}

run().catch(console.error);
