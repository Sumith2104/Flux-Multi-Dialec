import { config } from 'dotenv';
config({ path: '.env.local' });

async function migrate() {
    try {
        const { getPgPool } = await import('./src/lib/pg');
        const pool = getPgPool();
        
        console.log("Creating fluxbase_global.pricing_configs table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.pricing_configs (
                id SERIAL PRIMARY KEY,
                pro_price NUMERIC(10, 2) NOT NULL DEFAULT 4.00,
                max_price NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
                discount_pro_price NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
                discount_max_price NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
                enable_discount BOOLEAN NOT NULL DEFAULT TRUE,
                discount_code VARCHAR(128) NOT NULL DEFAULT 'EARLYBIRD',
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        // Check if there is already a configuration row, if not seed it.
        const rowCheck = await pool.query(`SELECT id FROM fluxbase_global.pricing_configs LIMIT 1`);
        if (rowCheck.rows.length === 0) {
            console.log("Seeding default pricing configurations into database...");
            await pool.query(`
                INSERT INTO fluxbase_global.pricing_configs 
                (pro_price, max_price, discount_pro_price, discount_max_price, enable_discount, discount_code)
                VALUES (4.00, 2.00, 20.00, 10.00, true, 'EARLYBIRD')
            `);
            console.log("Seeding complete.");
        } else {
            console.log("Pricing configuration row already exists. Skipping seed.");
        }

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit(0);
    }
}

migrate();
