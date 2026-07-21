import { pool } from './pg';
import mysql from 'mysql2/promise';

export interface TenantConfig {
    tenantId: string;
    displayName: string;
    dialect: 'postgresql' | 'mysql';
    createdAt: string;
}

export interface TenantMetrics {
    tenantId: string;
    tableCount: number;
    sizeBytes: number;
    formattedSize: string;
    dialect: 'postgresql' | 'mysql';
}

export class TenantProvisioner {
    /**
     * Sanitizes a tenant identifier to ensure safe SQL identifier usage.
     */
    private static sanitizeTenantId(rawId: string): string {
        const cleaned = rawId.toLowerCase().replace(/[^a-z0-9_]/g, '');
        return cleaned.startsWith('flux_tenant_') ? cleaned : `flux_tenant_${cleaned}`;
    }

    /**
     * Provisions an isolated tenant database schema space in PostgreSQL or MySQL.
     */
    public static async createTenantSchema(tenantId: string, dialect: 'postgresql' | 'mysql' = 'postgresql'): Promise<{
        success: boolean;
        schemaName: string;
        dialect: string;
        executionTimeMs: number;
    }> {
        const startTime = Date.now();
        const schemaName = this.sanitizeTenantId(tenantId);

        if (dialect === 'postgresql') {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // 1. Create isolated tenant schema
                await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);

                // 2. Create tenant metadata table within schema
                await client.query(`
                    CREATE TABLE IF NOT EXISTS "${schemaName}"."_flux_tenant_info" (
                        id VARCHAR(64) PRIMARY KEY,
                        schema_name VARCHAR(128) NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        status VARCHAR(32) DEFAULT 'active'
                    );
                `);

                await client.query(`
                    INSERT INTO "${schemaName}"."_flux_tenant_info" (id, schema_name)
                    VALUES ($1, $2)
                    ON CONFLICT (id) DO NOTHING;
                `, [tenantId, schemaName]);

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`[Tenant Engine Error] Failed to create PG schema ${schemaName}:`, error);
                throw error;
            } finally {
                client.release();
            }
        } else {
            // MySQL Database Isolation
            const mysqlConfig = {
                host: process.env.AWS_RDS_MYSQL_HOST || 'localhost',
                user: process.env.AWS_RDS_MYSQL_USER || 'root',
                password: process.env.AWS_RDS_MYSQL_PASSWORD || '',
                port: parseInt(process.env.AWS_RDS_MYSQL_PORT || '3306', 10),
            };

            const conn = await mysql.createConnection(mysqlConfig);
            try {
                await conn.query(`CREATE DATABASE IF NOT EXISTS \`${schemaName}\`;`);
                await conn.query(`
                    CREATE TABLE IF NOT EXISTS \`${schemaName}\`.\`_flux_tenant_info\` (
                        id VARCHAR(64) PRIMARY KEY,
                        schema_name VARCHAR(128) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        status VARCHAR(32) DEFAULT 'active'
                    );
                `);
            } finally {
                await conn.end();
            }
        }

        const executionTimeMs = Date.now() - startTime;
        console.log(`[Tenant Engine] Created ${dialect} tenant schema "${schemaName}" in ${executionTimeMs}ms`);

        return {
            success: true,
            schemaName,
            dialect,
            executionTimeMs
        };
    }

    /**
     * Safely drops a tenant schema space.
     */
    public static async dropTenantSchema(tenantId: string, dialect: 'postgresql' | 'mysql' = 'postgresql'): Promise<boolean> {
        const schemaName = this.sanitizeTenantId(tenantId);

        if (dialect === 'postgresql') {
            await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
        } else {
            const mysqlConfig = {
                host: process.env.AWS_RDS_MYSQL_HOST || 'localhost',
                user: process.env.AWS_RDS_MYSQL_USER || 'root',
                password: process.env.AWS_RDS_MYSQL_PASSWORD || '',
                port: parseInt(process.env.AWS_RDS_MYSQL_PORT || '3306', 10),
            };
            const conn = await mysql.createConnection(mysqlConfig);
            try {
                await conn.query(`DROP DATABASE IF EXISTS \`${schemaName}\`;`);
            } finally {
                await conn.end();
            }
        }
        return true;
    }

    /**
     * Retrieves table counts and disk size metrics for a tenant schema space.
     */
    public static async getTenantMetrics(tenantId: string, dialect: 'postgresql' | 'mysql' = 'postgresql'): Promise<TenantMetrics> {
        const schemaName = this.sanitizeTenantId(tenantId);

        if (dialect === 'postgresql') {
            const res = await pool.query(`
                SELECT 
                    COUNT(t.table_name)::int as table_count,
                    COALESCE(SUM(pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"')), 0)::bigint as size_bytes
                FROM information_schema.tables t
                WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE';
            `, [schemaName]);

            const tableCount = res.rows[0]?.table_count || 0;
            const sizeBytes = parseInt(res.rows[0]?.size_bytes || '0', 10);
            const formattedSize = this.formatBytes(sizeBytes);

            return {
                tenantId,
                tableCount,
                sizeBytes,
                formattedSize,
                dialect: 'postgresql'
            };
        } else {
            const mysqlConfig = {
                host: process.env.AWS_RDS_MYSQL_HOST || 'localhost',
                user: process.env.AWS_RDS_MYSQL_USER || 'root',
                password: process.env.AWS_RDS_MYSQL_PASSWORD || '',
                port: parseInt(process.env.AWS_RDS_MYSQL_PORT || '3306', 10),
            };
            const conn = await mysql.createConnection(mysqlConfig);
            try {
                const [rows]: any = await conn.query(`
                    SELECT 
                        COUNT(table_name) as table_count,
                        COALESCE(SUM(data_length + index_length), 0) as size_bytes
                    FROM information_schema.tables 
                    WHERE table_schema = ?;
                `, [schemaName]);

                const tableCount = rows[0]?.table_count || 0;
                const sizeBytes = parseInt(rows[0]?.size_bytes || '0', 10);

                return {
                    tenantId,
                    tableCount,
                    sizeBytes,
                    formattedSize: this.formatBytes(sizeBytes),
                    dialect: 'mysql'
                };
            } finally {
                await conn.end();
            }
        }
    }

    private static formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
