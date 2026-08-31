import { NextResponse } from 'next/server';
import { TenantProvisioner } from '@/lib/tenant-engine';
import { pool } from '@/lib/pg';
import { getUserIdFromRequest } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const authenticatedUserId = await getUserIdFromRequest(req);
        if (!authenticatedUserId) {
            return NextResponse.json({
                success: false,
                error: 'Unauthorized: You must be logged in to provision a database.'
            }, { status: 401 });
        }

        const body = await req.json();
        const { projectName, dialect = 'postgresql' } = body;
        const userId = authenticatedUserId;

        if (!projectName) {
            return NextResponse.json({
                success: false,
                error: 'projectName is a required parameter.'
            }, { status: 400 });
        }

        const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const tenantId = `proj_${projectSlug}_${Math.random().toString(36).substring(2, 8)}`;

        // 1. Provision isolated schema space instantly (<50ms)
        const provisionResult = await TenantProvisioner.createTenantSchema(tenantId, dialect);

        // 2. Save metadata in global projects registry
        const query = `
            INSERT INTO fluxbase_global.projects (
                project_id, display_name, db_name, host, port, db_user, dialect, user_id, is_serverless, schema_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;

        const values = [
            tenantId,
            projectName,
            provisionResult.schemaName,
            dialect === 'postgresql' ? (process.env.AWS_RDS_POSTGRES_HOST || 'localhost') : (process.env.AWS_RDS_MYSQL_HOST || 'localhost'),
            dialect === 'postgresql' ? 5432 : 3306,
            'fluxbase_app',
            dialect,
            userId,
            true,
            provisionResult.schemaName
        ];

        const res = await pool.query(query, values);
        const project = res.rows[0];

        return NextResponse.json({
            success: true,
            project,
            tenant: {
                id: tenantId,
                schemaName: provisionResult.schemaName,
                dialect,
                executionTimeMs: provisionResult.executionTimeMs,
                coldStart: '0ms (Warm Shared Pool)'
            }
        });
    } catch (error: any) {
        console.error('[Serverless Provisioning Error]:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to provision serverless database.'
        }, { status: 500 });
    }
}
