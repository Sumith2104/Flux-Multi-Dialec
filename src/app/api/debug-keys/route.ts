
import { NextResponse } from 'next/server';
import { generateApiKey, listApiKeys, ApiKey } from '@/lib/api-keys';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('--- [DEBUG API] Starting Execution ---');

        // Check DB connection
        const settings = adminDb.settings;
        console.log('[DEBUG API] Firestore Project ID:', settings.projectId);

        const userId = 'debug-user-' + Date.now();
        const projectId = 'debug-project-123';

        console.log(`[DEBUG API] Generating Key for User: ${userId}, Project: ${projectId}`);
        // 1. Generate
        const genResult = await generateApiKey(userId, 'Debug Key', projectId, 'Debug Project');
        console.log('[DEBUG API] Generated Key ID:', genResult.apiKeyData.id);

        // 2. Wait
        await new Promise(r => setTimeout(r, 1000));

        // 3. List
        console.log(`[DEBUG API] Listing Keys for User: ${userId}`);
        const keys = await listApiKeys(userId);
        console.log(`[DEBUG API] Found ${keys.length} keys.`);

        // 4. Verify
        const found = keys.find(k => k.id === genResult.apiKeyData.id);
        if (found) {
            console.log('[DEBUG API] Key found in listing:', found.id);
        } else {
            console.error('[DEBUG API] Key NOT found in listing!');
        }

        return NextResponse.json({
            success: true,
            generated: genResult.apiKeyData,
            foundInList: found || null,
            totalKeys: keys.length,
            match: !!found && found.projectId === projectId
        });
    } catch (error: any) {
        console.error('[DEBUG API] Error:', error);
        return NextResponse.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
    }
}
