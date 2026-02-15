
import { adminDb } from '../lib/firebase-admin';

async function main() {
    const targetProjectId = 'tygeNt1kN5juQ6jGyjTP';
    console.log(`🔍 Searching for Project ID: ${targetProjectId}`);

    try {
        const usersSnapshot = await adminDb.collection('users').get();
        console.log(`Found ${usersSnapshot.size} users.`);

        let found = false;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const projectDoc = await adminDb
                .collection('users').doc(userId)
                .collection('projects').doc(targetProjectId)
                .get();

            if (projectDoc.exists) {
                console.log(`✅ Project FOUND!`);
                console.log(`   - Owner User ID: ${userId}`);
                console.log(`   - Project Data:`, projectDoc.data());
                found = true;
                break;
            }
        }

        if (!found) {
            console.error(`❌ Project ${targetProjectId} NOT found in any user's collection.`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
