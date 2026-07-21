export interface RlsRule {
    id: string;
    tableName: string;
    action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
    roleName: string; // e.g. 'authenticated', 'anon', 'public'
    usingExpression: string; // e.g. "auth.uid() = user_id" or "true"
    withCheckExpression?: string;
}

export class RlsCompiler {
    /**
     * Compiles visual RLS rules into native PostgreSQL RLS DDL statements.
     */
    public static compilePgPolicy(rule: RlsRule, schemaName = 'public'): string[] {
        const statements: string[] = [];
        const policyName = `flux_policy_${rule.tableName}_${rule.action.toLowerCase()}_${rule.id.substring(0, 6)}`;

        // 1. Enable RLS on target table if not already enabled
        statements.push(`ALTER TABLE "${schemaName}"."${rule.tableName}" ENABLE ROW LEVEL SECURITY;`);

        // 2. Drop existing policy with matching name if present
        statements.push(`DROP POLICY IF EXISTS "${policyName}" ON "${schemaName}"."${rule.tableName}";`);

        // 3. Construct CREATE POLICY statement
        let sql = `CREATE POLICY "${policyName}" ON "${schemaName}"."${rule.tableName}" `;
        sql += `FOR ${rule.action} `;
        sql += `TO ${rule.roleName === 'public' ? 'PUBLIC' : `"${rule.roleName}"`} `;
        sql += `USING (${rule.usingExpression})`;

        if (rule.withCheckExpression && (rule.action === 'INSERT' || rule.action === 'UPDATE' || rule.action === 'ALL')) {
            sql += ` WITH CHECK (${rule.withCheckExpression})`;
        }

        sql += `;`;
        statements.push(sql);

        return statements;
    }

    /**
     * Helper to generate a default user-ownership policy ("Users can only read/edit their own rows").
     */
    public static generateUserOwnershipPolicy(tableName: string, userColumn = 'user_id'): RlsRule {
        return {
            id: Math.random().toString(36).substring(2, 8),
            tableName,
            action: 'ALL',
            roleName: 'authenticated',
            usingExpression: `auth.uid() = ${userColumn}`,
            withCheckExpression: `auth.uid() = ${userColumn}`
        };
    }
}
