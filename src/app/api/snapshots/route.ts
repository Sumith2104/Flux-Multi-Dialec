import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { createDatabaseSnapshot, listDatabaseSnapshots } from '@/lib/aws-rds';

export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const identifier = searchParams.get('identifier');

        if (!identifier) {
            return NextResponse.json({ success: false, error: 'Missing instance identifier' }, { status: 400 });
        }

        const snapshots = await listDatabaseSnapshots(identifier);

        return NextResponse.json({
            success: true,
            snapshots: snapshots.map((s: any) => ({
                id: s.DBSnapshotIdentifier,
                status: s.Status,
                createdAt: s.SnapshotCreateTime,
                engine: s.Engine,
                allocatedStorage: s.AllocatedStorage
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { identifier } = body;

        if (!identifier) {
            return NextResponse.json({ success: false, error: 'Missing instance identifier' }, { status: 400 });
        }

        const snapshotIdentifier = `${identifier}-manual-${Date.now()}`;
        const snapshot = await createDatabaseSnapshot(identifier, snapshotIdentifier);

        return NextResponse.json({
            success: true,
            snapshot: {
                id: snapshot?.DBSnapshotIdentifier,
                status: snapshot?.Status
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
