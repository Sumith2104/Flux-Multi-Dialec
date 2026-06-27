import { config } from 'dotenv';
config({ path: '.env.local' });

async function check() {
    const { getPgPool } = await import('./src/lib/pg');
    const pool = getPgPool();
    const res = await pool.query(`
        SELECT * FROM fluxbase_global.scraped_sms ORDER BY created_at DESC LIMIT 10;
    `);
    const paymentsRes = await pool.query(`
        SELECT * FROM fluxbase_global.payments ORDER BY created_at DESC LIMIT 10;
    `);
    console.log("---- SCRAPED SMS START ----");
    console.log(JSON.stringify(res.rows, null, 2));
    console.log("---- SCRAPED SMS END ----");
    
    console.log("---- PAYMENTS START ----");
    console.log(JSON.stringify(paymentsRes.rows, null, 2));
    console.log("---- PAYMENTS END ----");
    process.exit(0);
}
check().catch(console.error);

