
import { adminDb } from '@/lib/firebase-admin';
import { randomBytes, createHash } from 'crypto';

const API_KEYS_COLLECTION = 'api_keys';

export interface ApiKey {
    id: string; // The document ID (which is the hash of the key)
    userId: string;
    name: string;
    projectId?: string; // Optional: Scope to a specific project
    projectName?: string; // Optional: Display name of the project
    preview: string; // The first few and last few characters for display
    createdAt: string;
    lastUsedAt?: string;
}

export interface CreateApiKeyResult {
    key: string; // The raw key, shown ONLY once
    apiKeyData: ApiKey;
}

/**
 * Generates a new API key for the given user.
 * The key is returned only once. A hash is stored in the database.
 */
export async function generateApiKey(userId: string, name: string, projectId?: string, projectName?: string): Promise<CreateApiKeyResult> {
    const rawKey = 'fl_' + randomBytes(24).toString('hex'); // e.g. fl_3a...
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const preview = `${rawKey.substring(0, 7)}...${rawKey.substring(rawKey.length - 4)}`;

    const apiKeyData: ApiKey = {
        id: hash,
        userId,
        name,
        preview,
        createdAt: new Date().toISOString(),
    };

    if (projectId) apiKeyData.projectId = projectId;
    if (projectName) apiKeyData.projectName = projectName;

    // Store in root collection for O(1) lookup by hash
    // Firestore doesn't like undefined values, so we construct the object carefully or sanitize it
    // The above approach ensures undefined keys are simply not added.
    await adminDb.collection(API_KEYS_COLLECTION).doc(hash).set(apiKeyData as any);

    return { key: rawKey, apiKeyData };
}

/**
 * Validates an API key and returns the associated User ID and Scope.
 * Updates the lastUsedAt timestamp.
 */
export async function validateApiKey(rawKey: string): Promise<{ userId: string, projectId?: string } | null> {
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const docRef = adminDb.collection(API_KEYS_COLLECTION).doc(hash);
    const doc = await docRef.get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data() as ApiKey;

    // Async update last used (fire and forget to not block response)
    docRef.update({ lastUsedAt: new Date().toISOString() }).catch(err =>
        console.error('Failed to update API key stats:', err)
    );

    return { userId: data.userId, projectId: data.projectId };
}

/**
 * Lists all API keys for a specific user.
 */
export async function listApiKeys(userId: string): Promise<ApiKey[]> {
    const snapshot = await adminDb.collection(API_KEYS_COLLECTION)
        .where('userId', '==', userId)
        .get();

    const keys = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as ApiKey));

    return keys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Revokes (deletes) an API key.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
    const docRef = adminDb.collection(API_KEYS_COLLECTION).doc(keyId);
    const doc = await docRef.get();

    if (doc.exists && doc.data()?.userId === userId) {
        await docRef.delete();
    } else {
        throw new Error("Key not found or unauthorized");
    }
}
