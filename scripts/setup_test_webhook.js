
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

const projectId = '2f8a8e951c394c13';

async function run() {
    try {
        console.log(`Setting up test webhook for project: ${projectId}`);
        
        // 1. Find a valid user for this project
        const memberRes = await pool.query('SELECT user_id FROM fluxbase_global.project_members WHERE project_id = $1 LIMIT 1', [projectId]);
        if (memberRes.rows.length === 0) {
            throw new Error('No members found for this project.');
        }
        const userId = memberRes.rows[0].user_id;
        console.log(`Using User ID: ${userId}`);

        // 2. Clear existing test webhooks to avoid duplicates
        await pool.query('DELETE FROM fluxbase_global.webhooks WHERE project_id = $1 AND name = $2', [projectId, 'Antigravity Test Webhook']);

        // 3. Create the webhook
        const webhookId = crypto.randomUUID().replace(/-/g, '').substring(0, 20);
        const testUrl = 'https://webhook.site/7f3d3d3d-3d3d-4d4d-8d8d-3d3d3d3d3d3d'; // Placeholder
        
        await pool.query(`
            INSERT INTO fluxbase_global.webhooks (webhook_id, project_id, user_id, name, url, event, table_id, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [webhookId, projectId, userId, 'Antigravity Test Webhook', testUrl, '*', '*', true]);

        console.log(`✅ Webhook created! ID: ${webhookId}`);
        console.log(`URL: ${testUrl}`);
        console.log(`Events: * (All), Tables: * (All)`);

    } catch (err) {
        console.error('Setup error:', err.message);
    } finally {
        await pool.end();
    }
}

run();
