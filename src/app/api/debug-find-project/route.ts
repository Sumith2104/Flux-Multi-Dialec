
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
    const targetProjectId = 'tygeNt1kN5juQ6jGyjTP';
    const results: any[] = [];

    try {
        const usersSnapshot = await adminDb.collection('users').get();

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const projectDoc = await adminDb
                .collection('users').doc(userId)
                .collection('projects').doc(targetProjectId)
                .get();

            if (projectDoc.exists) {
                results.push({
                    found: true,
                    ownerUserId: userId,
                    projectData: projectDoc.data()
                });
            }
        }

        return NextResponse.json({
            searchId: targetProjectId,
            usersScanned: usersSnapshot.size,
            results
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
