'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { User } from '@/lib/auth';

export async function findUserById(userId: string): Promise<User | null> {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return null;

        const data = userDoc.data();
        return {
            id: userDoc.id,
            email: data?.email,
            // Add other fields as needed for the User interface
            // created_at might be in data or not, simplified here:
            created_at: data?.created_at || new Date().toISOString(),
            ...data
        } as User;
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return null;
    }
}

export async function deleteUserAccount(userId: string) {
    // 1. Get all user projects
    const projectsSnapshot = await adminDb
        .collection('users').doc(userId)
        .collection('projects')
        .get();

    // 2. Delete each project recursively
    const deletePromises = projectsSnapshot.docs.map(doc =>
        adminDb.recursiveDelete(doc.ref)
    );
    await Promise.all(deletePromises);

    // 3. Delete user profile
    await adminDb.collection('users').doc(userId).delete();

    // (Optional) We could also delete the Auth user via adminAuth.deleteUser(uid)
    // but that requires the 'auth' instance to be exported and used here.
    // For now, deleting data is primary.
}
