
import { generateApiKey, listApiKeys, ApiKey } from '../lib/api-keys';
import { adminDb } from '../lib/firebase-admin';

async function main() {
    try {
        console.log('--- Starting Debug Script ---');

        // 1. Using a dummy user ID or existing one if possible
        const userId = 'test-user-debug';
        const projectId = 'test-project-123';
        const keyName = 'debug-key-' + Date.now();

        console.log(`Generating Key for User: ${userId}, Project: ${projectId}`);
        const result = await generateApiKey(userId, keyName, projectId, 'Test Project Debug');
        console.log('✅ Key Generated:', result.apiKeyData.id);

        console.log('--- Waiting for Firestore Consistency (1s) ---');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`Listing Keys for User: ${userId}`);
        const list = await listApiKeys(userId);
        console.log(`Found ${list.length} keys.`);

        const found = list.find(k => k.id === result.apiKeyData.id);
        if (found) {
            console.log('✅ Key Found in List:', found);
            if (found.projectId === projectId) {
                console.log('✅ Project ID matched.');
            } else {
                console.error('❌ Project ID mismatch. Expected', projectId, 'Got', found.projectId);
            }
        } else {
            console.error('❌ Key NOT Found in List. Potential Indexing issue?');
        }

    } catch (error) {
        console.error('❌ Script Error:', error);
    }
    process.exit(0);
}

main();
