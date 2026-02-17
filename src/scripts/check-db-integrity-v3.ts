
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Load Env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^"|"$/g, '');
            process.env[key] = value;
        }
    });
}

// 2. Init Firebase
const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}
const adminDb = getFirestore();

// 3. Run Check
async function run() {
    console.log("Scanning users...");
    const usersSnap = await adminDb.collection('users').get();

    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        console.log(`Checking User: ${userId}`);
        const projectsSnap = await adminDb.collection('users').doc(userId).collection('projects').get();

        for (const projDoc of projectsSnap.docs) {
            const projectId = projDoc.id;
            console.log(`  Project: ${projectId} (${projDoc.data().display_name})`);

            const tablesSnap = await projDoc.ref.collection('tables').get();
            const constraintsSnap = await projDoc.ref.collection('constraints').get();

            const tables = tablesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const constraints = constraintsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            console.log(`    Tables found: ${tables.length}`);
            console.log(`    Constraints found: ${constraints.length}`);

            const tableMap = new Map();
            tables.forEach((t: any) => tableMap.set(t.table_id, t.table_name));

            // Check Tables
            for (const t of tables) {
                const tAny = t as any;
                console.log(`      Table: ${tAny.table_name} (ID: ${tAny.table_id})`);

                const colsSnap = await projDoc.ref.collection('tables').doc(t.id).collection('columns').get();
                colsSnap.docs.forEach(c => {
                    const cData = c.data();
                    // Log details for PK columns
                    if (cData.is_primary_key) {
                        console.log(`        PK Column: ${cData.column_name}`);
                    }
                });
            }

            // Check Constraints
            for (const c of constraints) {
                const cAny = c as any;
                const type = cAny.type;
                const tableName = tableMap.get(cAny.table_id) || 'UNKNOWN';

                console.log(`      Constraint [${c.id}]: ${type}`);
                console.log(`        Table: ${tableName} (${cAny.table_id})`);
                console.log(`        Cols: ${cAny.column_names}`);

                if (type === 'FOREIGN KEY') {
                    const refTableName = tableMap.get(cAny.referenced_table_id);
                    console.log(`        Ref Table: ${refTableName || 'UNKNOWN'} (${cAny.referenced_table_id})`);
                    console.log(`        Ref Cols: ${cAny.referenced_column_names}`);

                    if (!refTableName) {
                        console.error("        [ERROR] Referenced Table ID not found in project tables! Edge will be missing.");
                    }
                }
            }
        }
    }
}

run().catch(console.error);
