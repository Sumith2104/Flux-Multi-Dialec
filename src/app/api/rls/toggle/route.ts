import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { projectId, tableName, policyName, enabled } = body;
    const auth = await getAuthContextFromRequest(req);
    
    if (!auth?.userId || !projectId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = getPgPool();
    const schemaName = `project_${projectId}`;
    
    try {
        // 1. Update metadata in our catalog
        await pool.query(
            `UPDATE fluxbase_global.rls_policies SET enabled = $1 
             WHERE project_id = $2 AND table_name = $3 AND policy_name = $4`,
            [enabled, projectId, tableName, policyName]
        );

        // 2. Fetch the full policy details to execute the real SQL
        const policyRes = await pool.query(
            `SELECT command, expression FROM fluxbase_global.rls_policies 
             WHERE project_id = $1 AND table_name = $2 AND policy_name = $3`,
            [projectId, tableName, policyName]
        );

        if (policyRes.rows.length === 0) {
            throw new Error('Policy not found in catalog');
        }

        const { command, expression } = policyRes.rows[0];

        // 3. Execute database-level SQL
        // We use a transaction to ensure schema consistency
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (enabled) {
                // Enable RLS on the table
                await client.query(`ALTER TABLE "${schemaName}"."${tableName}" ENABLE ROW LEVEL SECURITY`);
                await client.query(`ALTER TABLE "${schemaName}"."${tableName}" FORCE ROW LEVEL SECURITY`); // Ensure owner is also restricted
                
                // Drop if exists first to avoid duplicates
                await client.query(`DROP POLICY IF EXISTS "${policyName}" ON "${schemaName}"."${tableName}"`);
                
                // Create the actual policy
                const sqlCommand = command === 'ALL' ? 'ALL' : command;
                await client.query(`CREATE POLICY "${policyName}" ON "${schemaName}"."${tableName}" FOR ${sqlCommand} TO PUBLIC USING (${expression})`);
            } else {
                // Drop the policy
                await client.query(`DROP POLICY IF EXISTS "${policyName}" ON "${schemaName}"."${tableName}"`);
                
                // Check if any other enabled policies remain for this table
                const otherPolicies = await client.query(
                    `SELECT id FROM fluxbase_global.rls_policies 
                     WHERE project_id = $1 AND table_name = $2 AND enabled = true`,
                    [projectId, tableName]
                );

                if (otherPolicies.rows.length === 0) {
                    // No enabled policies left, we can disable RLS completely for better performance
                    await client.query(`ALTER TABLE "${schemaName}"."${tableName}" DISABLE ROW LEVEL SECURITY`);
                }
            }

            await client.query('COMMIT');
            return NextResponse.json({ success: true });
        } catch (dbErr: any) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally {
            client.release();
        }
    } catch (e: any) {
        console.error('[RLS Toggle Error]', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}
