
import 'dotenv/config';
import { Pool } from 'pg';

console.log('--- STARTING STANDALONE WEBHOOK TEST ---');

const pool = new Pool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

const projectId = '2f8a8e951c394c13';

async function run() {
    try {
        console.log(`🔍 [STANDALONE DIAGNOSTIC] Project: ${projectId}`);
        
        // 1. Get Webhooks
        console.log('Step 1: Querying webhooks...');
        const whRes = await pool.query('SELECT * FROM fluxbase_global.webhooks WHERE project_id = $1', [projectId]);
        const webhooks = whRes.rows;
        
        if (webhooks.length === 0) {
            console.error('❌ Error: No active webhooks found in DB. Run setup_test_webhook.js first.');
            await pool.end();
            return;
        }

        console.log(`📡 Found ${webhooks.length} webhook(s).`);
        console.table(webhooks.map(w => ({ id: w.webhook_id, name: w.name, url: w.url, active: w.is_active })));

        const activeWebhooks = webhooks.filter(w => w.is_active);
        if (activeWebhooks.length === 0) {
            console.error('❌ Error: All webhooks are inactive.');
            await pool.end();
            return;
        }

        const payload = {
            event_type: 'row.inserted',
            table_id: 'test_table',
            timestamp: new Date().toISOString(),
            data: {
                new: { id: 999, name: 'Antigravity Diagnostic Row' }
            }
        };

        // 2. Mock Dispatch
        for (const webhook of activeWebhooks) {
            console.log(`📤 Dispatching to: ${webhook.url} (Event: ${webhook.event})`);
            
            try {
                const startTime = Date.now();
                const response = await fetch(webhook.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Fluxbase-Diagnostic-Tool/1.0',
                        'X-Fluxbase-Event': 'row.inserted'
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000)
                });

                const duration = Date.now() - startTime;
                if (response.ok) {
                    console.log(`✅ SUCCESS! ${webhook.url} responded with ${response.status} in ${duration}ms`);
                } else {
                    console.error(`⚠️ WARNING: ${webhook.url} returned status ${response.status}`);
                    const text = await response.text();
                    console.error(`Response body: ${text.substring(0, 100)}`);
                }
            } catch (err: any) {
                console.error(`❌ NETWORK ERROR reaching ${webhook.url}:`, err.message);
            }
        }

    } catch (err: any) {
        console.error('💥 CRITICAL ERROR in diagnostic script:');
        console.error(err);
    } finally {
        await pool.end();
        console.log('--- DIAGNOSTIC COMPLETE ---');
    }
}

run().catch(console.error);
