import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
        const schemaRes = await client.query("SELECT nspname FROM pg_namespace WHERE nspname = 'auth'");
        const funcRes = await client.query("SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'auth' AND routine_name = 'uid'");
        
        return NextResponse.json({
            schemaExists: schemaRes.rows.length > 0,
            functionExists: funcRes.rows.length > 0,
            message: 'Rls setup check complete'
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        client.release();
    }
}
