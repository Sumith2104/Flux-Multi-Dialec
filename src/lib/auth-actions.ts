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
