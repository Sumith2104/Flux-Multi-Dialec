const { Pool } = require('pg');

async function verify() {
    const pool = new Pool({
        connectionString: 'postgresql://postgres:SumithU2104@fluxbase-master-db.c968iiqo2ol2.ap-south-1.rds.amazonaws.com:5432/postgres',
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Testing connection...');
        const schemaRes = await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = 'auth'");
        console.log('Auth Schema exists:', schemaRes.rows.length > 0);

        const funcRes = await pool.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'auth' AND routine_name = 'uid'");
        console.log('auth.uid() function exists:', funcRes.rows.length > 0);

        const sessionRes = await pool.query("SELECT set_config('fluxbase.auth_uid', 'test_user_123', true); SELECT auth.uid();");
        console.log('auth.uid() returns:', sessionRes[1].rows[0].uid);

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await pool.end();
    }
}

verify();
