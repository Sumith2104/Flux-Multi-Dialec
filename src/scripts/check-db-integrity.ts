
import { adminDb } from '../lib/firebase-admin';

async function checkIntegrity() {
    const userId = "test-user-1"; // Adjust if known, or scan all users
    // Since we don't know the exact user ID from here easily without auth context, 
    // let's try to find a user with projects.

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

            for (const t of tables) {
                console.log(`      Table: ${(t as any).table_name} (ID: ${t.id})`);
                const colsSnap = await projDoc.ref.collection('tables').doc(t.id).collection('columns').get();
                colsSnap.docs.forEach(c => {
                    console.log(`        Col: ${(c.data() as any).column_name} (PK: ${(c.data() as any).is_primary_key})`);
                });
            }

            for (const c of constraints) {
                console.log(`      Constraint: ${(c as any).type}`);
                console.log(`        Table ID: ${(c as any).table_id}`);
                console.log(`        Cols: ${(c as any).column_names}`);
                if ((c as any).type === 'FOREIGN KEY') {
                    console.log(`        Ref Table ID: ${(c as any).referenced_table_id}`);
                    console.log(`        Ref Cols: ${(c as any).referenced_column_names}`);
                }
            }
        }
    }
}

checkIntegrity();
