import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
    const { getPgPool } = await import('../src/lib/pg');
    const pool = getPgPool();

    console.log('1. Inspecting current pricing_configs table...');
    try {
        const res = await pool.query('SELECT * FROM fluxbase_global.pricing_configs LIMIT 100');
        console.log('Current pricing_configs rows count:', res.rows.length);
        console.log('Row sample:', res.rows[0]);
        await pool.query("UPDATE fluxbase_global.pricing_configs SET upi_id = '918310870493@waaxis'");
        console.log('Updated pricing_configs upi_id to 918310870493@waaxis');
    } catch (e) {
        console.error('Error querying pricing_configs:', e);
    }

    console.log('2. Creating fluxbase_global.plans table...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.plans (
            id SERIAL PRIMARY KEY,
            plan_key VARCHAR(64) UNIQUE NOT NULL,
            name VARCHAR(128) NOT NULL,
            description TEXT,
            category VARCHAR(64) DEFAULT 'student',
            price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            billing_interval VARCHAR(32) DEFAULT 'monthly',
            max_projects INT DEFAULT 1,
            storage_bytes BIGINT DEFAULT 524288000,
            requests_limit INT DEFAULT 50000,
            max_connections INT DEFAULT 20,
            features JSONB DEFAULT '[]'::jsonb,
            is_active BOOLEAN DEFAULT true,
            sort_order INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    console.log('3. Creating fluxbase_global.discounts table...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fluxbase_global.discounts (
            id SERIAL PRIMARY KEY,
            code VARCHAR(64) UNIQUE NOT NULL,
            description TEXT,
            discount_type VARCHAR(32) NOT NULL DEFAULT 'percentage',
            discount_value NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
            applicable_plans JSONB DEFAULT '["all"]'::jsonb,
            min_order_amount NUMERIC(10, 2) DEFAULT 0.00,
            max_discount_amount NUMERIC(10, 2) DEFAULT 1000.00,
            is_active BOOLEAN DEFAULT true,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    console.log('4. Seeding plans table...');
    const plansData = [
        {
            plan_key: 'free',
            name: 'Student Free',
            description: 'Perfect for coursework, learning, and lab assignments.',
            category: 'student',
            price: 0.00,
            billing_interval: 'monthly',
            max_projects: 1,
            storage_bytes: 524288000,
            requests_limit: 50000,
            max_connections: 20,
            features: JSON.stringify(['1 Database Project', '500 MB Storage', '50,000 requests/mo', 'Community Discord Support']),
            is_active: true,
            sort_order: 1
        },
        {
            plan_key: 'pro',
            name: 'Student Pro',
            description: 'Extra capacity for academic thesis and portfolio apps.',
            category: 'student',
            price: 499.00,
            billing_interval: 'monthly',
            max_projects: 3,
            storage_bytes: 8589934592,
            requests_limit: 2000000,
            max_connections: 100,
            features: JSON.stringify(['3 Database Projects', '8 GB Storage', '2,000,000 requests/mo', 'Email Support']),
            is_active: true,
            sort_order: 2
        },
        {
            plan_key: 'max',
            name: 'Student Max',
            description: 'Unleashed limits for capstone projects and student startups.',
            category: 'student',
            price: 1499.00,
            billing_interval: 'monthly',
            max_projects: 999999,
            storage_bytes: 53687091200,
            requests_limit: 15000000,
            max_connections: 500,
            features: JSON.stringify(['Unlimited Database Projects', '50 GB Storage', '15,000,000 requests/mo', 'Priority 24/7 Slack Support']),
            is_active: true,
            sort_order: 3
        },
        {
            plan_key: 'employee',
            name: 'Employee Dedicated',
            description: 'Dedicated infrastructure for team workloads and production APIs.',
            category: 'business',
            price: 500.00,
            billing_interval: 'monthly',
            max_projects: 10,
            storage_bytes: 10737418240,
            requests_limit: 10000000,
            max_connections: 100,
            features: JSON.stringify(['2 vCPU Dedicated Server (4 GB RAM)', '10 GB High-Speed SSD', '100 Concurrent Connections', 'Pay-As-You-Go: Rs.0.50 / 10k queries', 'Daily Automated Backups']),
            is_active: true,
            sort_order: 4
        },
        {
            plan_key: 'org_owner',
            name: 'Org Owner Enterprise',
            description: 'Dedicated Xeon/EPYC clusters with 99.99% SLA and high-IOPS storage.',
            category: 'enterprise',
            price: 5000.00,
            billing_interval: 'monthly',
            max_projects: 999999,
            storage_bytes: 107374182400,
            requests_limit: 100000000,
            max_connections: 1000,
            features: JSON.stringify(['8 vCPU Dedicated Xeon/EPYC (32 GB RAM)', '100 GB Gen4 NVMe Storage', '1,000+ Concurrent Connections', 'Pay-As-You-Go: Rs.2.00 / 10k queries', '99.99% SLA & PITR']),
            is_active: true,
            sort_order: 5
        },
        {
            plan_key: 'pay_as_you_go',
            name: 'Pay-As-You-Go Dedicated',
            description: 'Metered pay-as-you-go billing with dedicated performance base.',
            category: 'business',
            price: 500.00,
            billing_interval: 'metered',
            max_projects: 10,
            storage_bytes: 10737418240,
            requests_limit: 10000000,
            max_connections: 100,
            features: JSON.stringify(['2 vCPU Dedicated Base', 'Pay-As-You-Go: Rs.0.50 / 10k queries', 'Rs.5 / additional GB', 'Automated Backups']),
            is_active: true,
            sort_order: 6
        }
    ];

    for (const p of plansData) {
        await pool.query(`
            INSERT INTO fluxbase_global.plans (plan_key, name, description, category, price, billing_interval, max_projects, storage_bytes, requests_limit, max_connections, features, is_active, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
            ON CONFLICT (plan_key) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                price = EXCLUDED.price,
                billing_interval = EXCLUDED.billing_interval,
                max_projects = EXCLUDED.max_projects,
                storage_bytes = EXCLUDED.storage_bytes,
                requests_limit = EXCLUDED.requests_limit,
                max_connections = EXCLUDED.max_connections,
                features = EXCLUDED.features,
                is_active = EXCLUDED.is_active,
                sort_order = EXCLUDED.sort_order,
                updated_at = NOW()
        `, [
            p.plan_key, p.name, p.description, p.category, p.price, p.billing_interval,
            p.max_projects, p.storage_bytes, p.requests_limit, p.max_connections,
            p.features, p.is_active, p.sort_order
        ]);
    }

    console.log('5. Seeding discounts table...');
    const discountsData = [
        {
            code: 'FLUX20',
            description: '20% off across all plans',
            discount_type: 'percentage',
            discount_value: 20.00,
            applicable_plans: JSON.stringify(['all']),
            min_order_amount: 0.00,
            max_discount_amount: 1000.00,
            is_active: true
        },
        {
            code: 'EARLYBIRD',
            description: 'Early bird launch discount',
            discount_type: 'percentage',
            discount_value: 20.00,
            applicable_plans: JSON.stringify(['all']),
            min_order_amount: 0.00,
            max_discount_amount: 1000.00,
            is_active: true
        },
        {
            code: 'WELCOME20',
            description: 'New account promotional voucher',
            discount_type: 'percentage',
            discount_value: 20.00,
            applicable_plans: JSON.stringify(['all']),
            min_order_amount: 0.00,
            max_discount_amount: 1000.00,
            is_active: true
        },
        {
            code: 'PROMO50',
            description: 'Flat Rs.100 discount coupon',
            discount_type: 'fixed_amount',
            discount_value: 100.00,
            applicable_plans: JSON.stringify(['all']),
            min_order_amount: 400.00,
            max_discount_amount: 100.00,
            is_active: true
        },
        {
            code: 'LAUNCH',
            description: 'Launch event 20% discount',
            discount_type: 'percentage',
            discount_value: 20.00,
            applicable_plans: JSON.stringify(['all']),
            min_order_amount: 0.00,
            max_discount_amount: 1000.00,
            is_active: true
        }
    ];

    for (const d of discountsData) {
        await pool.query(`
            INSERT INTO fluxbase_global.discounts (code, description, discount_type, discount_value, applicable_plans, min_order_amount, max_discount_amount, is_active)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
            ON CONFLICT (code) DO UPDATE SET
                description = EXCLUDED.description,
                discount_type = EXCLUDED.discount_type,
                discount_value = EXCLUDED.discount_value,
                applicable_plans = EXCLUDED.applicable_plans,
                min_order_amount = EXCLUDED.min_order_amount,
                max_discount_amount = EXCLUDED.max_discount_amount,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
        `, [
            d.code, d.description, d.discount_type, d.discount_value,
            d.applicable_plans, d.min_order_amount, d.max_discount_amount, d.is_active
        ]);
    }

    console.log('6. Querying populated plans table:');
    const plansRes = await pool.query('SELECT plan_key, name, price, category, billing_interval FROM fluxbase_global.plans ORDER BY sort_order ASC');
    console.table(plansRes.rows);

    console.log('7. Querying populated discounts table:');
    const discRes = await pool.query('SELECT code, description, discount_type, discount_value, is_active FROM fluxbase_global.discounts');
    console.table(discRes.rows);

    console.log('Migration successfully completed!');
    process.exit(0);
}

run().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
