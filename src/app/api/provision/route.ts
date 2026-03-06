import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { provisionDatabaseInstance, getDatabaseStatus } from '@/lib/aws-rds';
import { getPgPool } from '@/lib/pg';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { engine, size, region } = body;

        // CI/CD API Keys inject `allowedProjectId` automatically
        const projectId = body.projectId || auth.allowedProjectId;

        if (!engine || !projectId) {
            return NextResponse.json({ success: false, error: 'Missing required parameters (engine, projectId)' }, { status: 400 });
        }

        // Generate secure master credentials for the new RDS instance
        const masterUsername = 'fluxadmin_' + crypto.randomBytes(4).toString('hex');
        const masterPassword = 'Flux' + crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!'; // AWS requires strict passwords

        // AWS requires instance identifiers to be strictly lowercase alphanumeric with hyphens
        const instanceIdentifier = `fluxbase-tenant-${projectId.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;

        // Fire off the AWS API call using the orchestrator
        const instance = await provisionDatabaseInstance({
            instanceIdentifier,
            engine: engine.toLowerCase() === 'mysql' ? 'mysql' : 'postgres',
            masterUsername,
            masterPassword,
            instanceClass: size || 'db.t3.micro'
        });

        // Normally, we would update the `fluxbase_global.projects` table here to store the AWS identifier and password.
        // For phase 1, we just return the confirmation and identifier back to the UI.

        return NextResponse.json({
            success: true,
            status: 'creating',
            instanceIdentifier,
            masterUsername,
            masterPassword, // Exposing temporarily for the dashboard UI testing
            awsResponse: {
                arn: instance?.DBInstanceArn,
                status: instance?.DBInstanceStatus
            }
        });

    } catch (error: any) {
        console.error('[Provisioning API Error]', error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Provisioning Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('identifier');

        if (!identifier) {
            return NextResponse.json({ success: false, error: 'Missing instance identifier' }, { status: 400 });
        }

        const status = await getDatabaseStatus(identifier);

        if (!status) {
            return NextResponse.json({ success: false, error: 'Instance not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            status: status.status,
            endpoint: status.endpoint,
            port: status.port
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
