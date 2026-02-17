
import fs from 'fs';
import path from 'path';

// Manual .env.local loading
try {
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
        console.log("Loaded .env.local");
    }
} catch (e) {
    console.warn("Failed to load .env.local", e);
}

// Now import adminDb
// We use dynamic import to ensure env vars are set first
async function run() {
    const { adminDb } = await import('../lib/firebase-admin');

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

            // Map table names to IDs for verification
            const tableMap = new Map();
            tables.forEach((t: any) => tableMap.set(t.table_id, t.table_name));

            for (const c of constraints) {
                const cAny = c as any;
                console.log(`      Constraint: ${cAny.type}`);
                console.log(`        Table: ${tableMap.get(cAny.table_id)} (${cAny.table_id})`);
                console.log(`        Cols: ${cAny.column_names}`);

                if (cAny.type === 'FOREIGN KEY') {
                    const refTableName = tableMap.get(cAny.referenced_table_id);
                    console.log(`        Ref Table: ${refTableName} (${cAny.referenced_table_id})`);
                    console.log(`        Ref Cols: ${cAny.referenced_column_names}`);

                    if (!refTableName) {
                        console.error("        [ERROR] Referenced Table ID not found in project tables!");
                    }
                }
            }
        }
    }
}

run().catch(console.error);
