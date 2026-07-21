import { pool } from './pg';
import mysql from 'mysql2/promise';

export class TenantPooler {
    /**
     * Executes a SQL query in PostgreSQL scoped directly to a tenant's schema
     * with statement execution timeout protections to prevent noisy neighbors.
     */
    public static async executePgTenantQuery(tenantId: string, queryText: string, params: any[] = [], timeoutMs = 5000) {
        const schemaName = tenantId.startsWith('flux_tenant_') ? tenantId : `flux_tenant_${tenantId}`;
        const client = await pool.connect();
        const startTime = Date.now();

        try {
            // Set statement timeout and search path to tenant schema for execution scope
            await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'; SET search_path TO "${schemaName}", public;`);
            const result = await client.query(queryText, params);
            const executionTime = Date.now() - startTime;

            return {
                rows: result.rows,
                rowCount: result.rowCount,
                fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
                executionTimeMs: executionTime,
                schemaName
            };
        } finally {
            client.release();
        }
    }

    /**
     * Executes a SQL query in MySQL scoped to a tenant's isolated database
     * with max_execution_time protections.
     */
    public static async executeMySqlTenantQuery(tenantId: string, queryText: string, params: any[] = [], timeoutMs = 5000) {
        const schemaName = tenantId.startsWith('flux_tenant_') ? tenantId : `flux_tenant_${tenantId}`;
        const mysqlConfig = {
            host: process.env.AWS_RDS_MYSQL_HOST || 'localhost',
            user: process.env.AWS_RDS_MYSQL_USER || 'root',
            password: process.env.AWS_RDS_MYSQL_PASSWORD || '',
            port: parseInt(process.env.AWS_RDS_MYSQL_PORT || '3306', 10),
            database: schemaName
        };

        const conn = await mysql.createConnection(mysqlConfig);
        const startTime = Date.now();

        try {
            await conn.query(`SET max_execution_time = ${timeoutMs};`);
            const [rows, fields]: any = await conn.query(queryText as any, params);
            const executionTime = Date.now() - startTime;

            return {
                rows: Array.isArray(rows) ? rows : [rows],
                rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
                fields: Array.isArray(fields) ? fields.map((f: any) => ({ name: f.name, type: f.type })) : [],
                executionTimeMs: executionTime,
                schemaName
            };
        } finally {
            await conn.end();
        }
    }
}
