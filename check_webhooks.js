
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

const projectId = '2f8a8e951c394c13';

async function check() {
    try {
        console.log(`Checking Webhooks and Logs for Project: ${projectId}`);
        
        const webhooks = await pool.query('SELECT * FROM fluxbase_global.webhooks WHERE project_id = $1', [projectId]);
        console.log('\n--- Active Webhooks ---');
        console.table(webhooks.rows.map(w => ({
            id: w.webhook_id,
            name: w.name,
            url: w.url,
            event: w.event,
            table: w.table_id,
            active: w.is_active
        })));

        // Try to check for delivery logs
        const tableSchema = await pool.query(`
            SELECT EXISTS (
               SELECT FROM information_schema.tables 
               WHERE  table_schema = 'fluxbase_global'
               AND    table_name   = 'webhook_delivery_logs'
            );
        `);

        if (tableSchema.rows[0].exists) {
            const logs = await pool.query(`
                SELECT * FROM fluxbase_global.webhook_delivery_logs 
                WHERE project_id = $1 
                ORDER BY created_at DESC 
                LIMIT 5
            `, [projectId]);
            console.log('\n--- Recent Delivery Logs ---');
            console.table(logs.rows);
        } else {
            console.log('\n[Note] Table fluxbase_global.webhook_delivery_logs does not exist or schema is different.');
        }

    } catch (err) {
        console.error('Diagnostic error:', err);
    } finally {
        await pool.end();
    }
}

check();
