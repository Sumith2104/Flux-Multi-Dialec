'use server';

import { adminDb } from '@/lib/firebase-admin';
import { getCurrentUserId } from '@/lib/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRow } from '@/lib/validation';

// --- Types ---

export interface Project {
    project_id: string;
    user_id: string;
    display_name: string;
    created_at: string;
    dialect?: 'mysql' | 'postgresql' | 'oracle';
}

export interface Table {
    table_id: string;
    project_id: string;
    table_name: string;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface Column {
    id?: string;
    column_id: string;
    table_id: string;
    column_name: string;
    data_type: 'INT' | 'VARCHAR' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'FLOAT' | 'TEXT'; // Added TEXT for compatibility
    is_primary_key: boolean;
    is_nullable: boolean;
    default_value?: string; // e.g. 'now()', 'uuid()'
    created_at?: string;
}

export interface Row {
    id: string;
    [key: string]: any;
}

export type ConstraintType = 'PRIMARY KEY' | 'FOREIGN KEY';
export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'RESTRICT';

export interface Constraint {
    constraint_id: string;
    table_id: string;
    type: ConstraintType;
    column_names: string;
    referenced_table_id?: string;
    referenced_column_names?: string;
    on_delete?: ReferentialAction;
    on_update?: ReferentialAction;
}

// --- Projects ---

export async function getProjectsForCurrentUser(): Promise<Project[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    try {
        const snapshot = await adminDb.collection('users').doc(userId).collection('projects').get();
        return snapshot.docs.map(doc => ({
            project_id: doc.id,
            ...doc.data()
        } as Project));
    } catch (error) {
        console.error("Error fetching projects:", error);
        return [];
    }
}

export async function getProjectById(projectId: string): Promise<Project | null> {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    try {
        const doc = await adminDb.collection('users').doc(userId).collection('projects').doc(projectId).get();
        if (!doc.exists) return null;
        return { project_id: doc.id, ...doc.data() } as Project;
    } catch (error) {
        console.error("Error fetching project:", error);
        return null;
    }
}


// --- User Profile ---

export async function getUserProfile(userId: string) {
    const userDoc = await adminDb.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data() : null;
}

export async function createUserProfile(userId: string, email: string, displayName?: string, photoURL?: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
        throw new Error("User profile already exists.");
    }

    await userRef.set({
        email,
        display_name: displayName || email.split('@')[0],
        photo_url: photoURL || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
}

export async function updateUserProfile(userId: string, displayName?: string, photoURL?: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new Error("User profile not found. Please sign up first.");
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (displayName) updates.display_name = displayName;
    if (photoURL) updates.photo_url = photoURL;

    await userRef.update(updates);
}

// Deprecated: kept for backward compatibility if needed, but prefers explicit flow
export async function ensureUserProfile(userId: string, email: string, displayName?: string, photoURL?: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        await createUserProfile(userId, email, displayName, photoURL);
    } else {
        await updateUserProfile(userId, displayName, photoURL);
    }
}

export async function createProject(name: string, description: string, dialect: string = 'mysql'): Promise<Project> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const newProjectRef = adminDb.collection('users').doc(userId).collection('projects').doc();

    // Check limit...
    const projectsSnapshot = await adminDb.collection('users').doc(userId).collection('projects').get();
    if (projectsSnapshot.size >= 5) {
        throw new Error("Project limit reached (Max 5). Delete a project to create a new one.");
    }

    const project: Project = {
        project_id: newProjectRef.id,
        user_id: userId,
        display_name: name,
        created_at: new Date().toISOString(),
        dialect: dialect as any
    };

    await newProjectRef.set(project);
    return project;
}

export async function resetProjectData(projectId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const projectRef = adminDb.collection('users').doc(userId).collection('projects').doc(projectId);

    // We need to delete all tables and their subcollections (columns, rows).
    // recursiveDelete is the best way if available on the backend instance.
    // Since we are using firebase-admin, we can try to use it.
    // However, to be safe and granular (and avoid deleting the project doc itself if not careful), 
    // we might want to iterate. But recursiveDelete on the 'tables' collection is cleanest.

    const tablesRef = projectRef.collection('tables');
    const constraintsRef = projectRef.collection('constraints');

    // Delete all tables (and their subcollections like rows/columns)
    await adminDb.recursiveDelete(tablesRef);

    // Delete all constraints
    await adminDb.recursiveDelete(constraintsRef);

    // Note: This does NOT delete the project document itself, just the collections.
}

// --- Tables ---

export async function getTablesForProject(projectId: string): Promise<Table[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const snapshot = await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables')
        .get();

    return snapshot.docs.map(doc => ({
        table_id: doc.id,
        ...doc.data()
    } as Table));
}

export async function createTable(projectId: string, tableName: string, description: string, columns: Column[]): Promise<Table> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const projectRef = adminDb.collection('users').doc(userId).collection('projects').doc(projectId);
    const tableRef = projectRef.collection('tables').doc();

    const table: Table = {
        table_id: tableRef.id,
        project_id: projectId,
        table_name: tableName,
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const batch = adminDb.batch();

    // 1. Create Table Doc
    batch.set(tableRef, table);

    // 2. Create Column Docs (Strict Schema)
    const columnsRef = tableRef.collection('columns');
    for (const col of columns) {
        const colDoc = columnsRef.doc(); // Auto ID
        const colData: any = {
            ...col,
            column_id: colDoc.id,
            table_id: tableRef.id,
            created_at: new Date().toISOString()
        };
        // Firestore doesn't like undefined
        Object.keys(colData).forEach(key => colData[key] === undefined && delete colData[key]);

        batch.set(colDoc, colData);
    }

    await batch.commit();
    return table;
}

export async function deleteTable(projectId: string, tableId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    // Note: Firestore requires deleting subcollections recursively.
    // adminDb.recursiveDelete is available in Admin SDK but here we might need to be careful.
    // For simplicity in Phase 2, we just delete the document reference.
    // In a real app, use recursiveDelete.

    const tableRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId);

    await adminDb.recursiveDelete(tableRef);
}


// --- Columns ---

export async function getColumnsForTable(projectId: string, tableId: string): Promise<Column[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const snapshot = await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('columns')
        .get();

    return snapshot.docs.map(doc => ({
        column_id: doc.id,
        ...doc.data()
    } as Column)).sort((a, b) => {
        // Both have created_at: sort by time
        if (a.created_at && b.created_at) {
            return a.created_at.localeCompare(b.created_at);
        }
        // Only a has created_at: a is newer, so b (older) comes first
        if (a.created_at && !b.created_at) return 1;
        // Only b has created_at: b is newer, so a (older) comes first
        if (!a.created_at && b.created_at) return -1;

        // Neither has created_at: sort by name for consistency
        return a.column_name.localeCompare(b.column_name);
    });
}

export async function addColumn(projectId: string, tableId: string, column: Omit<Column, 'column_id' | 'table_id'>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const columnsRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('columns');

    const colDoc = columnsRef.doc();
    const colData: any = {
        ...column,
        column_id: colDoc.id,
        table_id: tableId,
        created_at: new Date().toISOString()
    };
    Object.keys(colData).forEach(key => colData[key] === undefined && delete colData[key]);

    await colDoc.set(colData);
}

export async function deleteColumn(projectId: string, tableId: string, columnId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('columns').doc(columnId)
        .delete();
}

export async function updateColumn(projectId: string, tableId: string, columnId: string, updates: Partial<Column>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('columns').doc(columnId)
        .update(updates);
}


// --- Constraints ---

export async function getConstraintsForProject(projectId: string): Promise<Constraint[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    // Constraints are stored under project/constraints subcollection
    const snapshot = await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('constraints')
        .get();

    return snapshot.docs.map(doc => ({
        constraint_id: doc.id,
        ...doc.data()
    } as Constraint));
}

export async function getConstraintsForTable(projectId: string, tableId: string): Promise<Constraint[]> {
    const allConstraints = await getConstraintsForProject(projectId);
    return allConstraints.filter(c => c.table_id === tableId);
}

export async function addConstraint(projectId: string, constraint: Omit<Constraint, 'constraint_id'>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const constraintsRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('constraints');

    const doc = constraintsRef.doc();
    const newConstraint = { ...constraint, constraint_id: doc.id };
    await doc.set(newConstraint);
    return newConstraint;
}

export async function deleteConstraint(projectId: string, constraintId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('constraints').doc(constraintId)
        .delete();
}


// --- Validation ---




// --- Rows (Data) ---

import fs from 'fs/promises';
import path from 'path';

export async function getTableData(projectId: string, tableName: string, page: number = 1, pageSize: number = 100) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const ignoreFileCheck = false; // Flag to skip file check if needed

    // Check for CSV file existence first (Hybrid Architecture)
    const projectPath = path.join(process.cwd(), 'src', 'database', userId, projectId);
    const dataFilePath = path.join(projectPath, `${tableName}.csv`);

    try {
        await fs.access(dataFilePath);
        // If file exists, read from CSV
        const fileContent = await fs.readFile(dataFilePath, 'utf8');
        const lines = fileContent.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');

        if (lines.length === 0) return { rows: [], totalRows: 0 };

        const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const dataLines = lines.slice(1);
        const totalRows = dataLines.length;

        // Pagination
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedLines = dataLines.slice(startIndex, endIndex);

        const rows = paginatedLines.map(line => {
            const values = line.split(','); // Simple split, reliable for this specific import flow
            const row: any = {};
            header.forEach((col, index) => {
                row[col] = values[index] ? values[index].trim() : null;
            });
            // Ensure ID is present
            if (!row.id && header.includes('id')) {
                // It should be there from import
            }
            return row;
        });

        return { rows, totalRows };

    } catch (err) {
        // File doesn't exist, fall back to Firestore
        // check if error is ENOENT
    }

    const tables = await getTablesForProject(projectId);
    const table = tables.find(t => t.table_name === tableName);
    if (!table) throw new Error(`Table ${tableName} not found`);

    const snapshot = await adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(table.table_id)
        .collection('rows')
        .limit(pageSize)
        .get();

    const rows = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            id: data.id, // Preserve the 'id' column from data if it exists
            _id: doc.id  // Expose Firestore document ID as _id
        };
    });
    const totalRows = rows.length; // Approximate for now, real total count requires aggregation query

    return { rows, totalRows };
}

export async function insertRow(projectId: string, tableId: string, rowData: Record<string, any>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    // Fetch columns for validation
    const columns = await getColumnsForTable(projectId, tableId);

    // Validate
    // Note: cast rowData to Row for validation context
    validateRow(rowData as Row, columns);

    const rowsRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('rows');

    // Check Primary Key uniqueness if PK exists
    const pkCol = columns.find(c => c.is_primary_key);
    if (pkCol && rowData[pkCol.column_name]) {
        const pkVal = rowData[pkCol.column_name];
        // Simple check: query for existing row with this PK value
        // This assumes the PK is mapped to a field in the document, OR the document ID itself.
        // Typically user-defined PKs are just fields.
        const existing = await rowsRef.where(pkCol.column_name, '==', pkVal).get();
        if (!existing.empty) {
            throw new Error(`Duplicate entry '${pkVal}' for primary key column '${pkCol.column_name}'.`);
        }
    }


    // Use specific ID if provided, otherwise auto-ID
    if (rowData.id) {
        await rowsRef.doc(rowData.id).set(rowData);
    } else {
        await rowsRef.add(rowData);
    }
}

export async function updateRow(projectId: string, tableId: string, rowId: string, updates: Record<string, any>) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const columns = await getColumnsForTable(projectId, tableId);

    // For update, we might not have the full row, so validation is trickier.
    // We should validate the *updates* against the schema.
    // For NOT NULL, we only check if the update is setting it to null.
    for (const col of columns) {
        if (updates.hasOwnProperty(col.column_name)) {
            const val = updates[col.column_name];
            if (!col.is_nullable && (val === null || val === undefined || val === '') && !col.default_value) {
                throw new Error(`Column '${col.column_name}' cannot be set to null.`);
            }
            // Type checks ... (reuse logic or refactor validateRow to accept partial)
            if (val !== null && val !== undefined && val !== '') {
                switch (col.data_type) {
                    case 'INT':
                        if (!Number.isInteger(Number(val))) throw new Error(`Column '${col.column_name}' expects Integer.`);
                        break;
                    case 'FLOAT': if (isNaN(Number(val))) throw new Error(`Column '${col.column_name}' expects Float.`); break;
                    case 'BOOLEAN':
                        if (!['true', 'false', '0', '1'].includes(String(val).toLowerCase())) throw new Error(`Column '${col.column_name}' expects Boolean.`);
                        break;
                    case 'DATE':
                    case 'TIMESTAMP':
                        if (isNaN(Date.parse(String(val)))) throw new Error(`Column '${col.column_name}' expects Date.`);
                        break;
                }
            }
        }
    }

    const rowRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('rows').doc(rowId);

    await rowRef.update(updates);
}

export async function deleteRow(projectId: string, tableId: string, rowId: string) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Unauthorized");

    const rowRef = adminDb
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('tables').doc(tableId)
        .collection('rows').doc(rowId);

    await rowRef.delete();
}


// --- Analytics ---

export interface ProjectAnalytics {
    totalSize: number;
    totalRows: number;
    tables: { name: string; rows: number; size: number }[];
}

export async function getProjectAnalytics(projectId: string): Promise<ProjectAnalytics> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { totalSize: 0, totalRows: 0, tables: [] };
    }

    try {
        const tables = await getTablesForProject(projectId);

        let totalRows = 0;
        let totalSize = 0;
        const tablesStats = [];

        for (const table of tables) {
            let rowCount = 0;
            let size = 0;

            // Check CSV first
            try {
                const projectPath = path.join(process.cwd(), 'src', 'database', userId, projectId);
                const dataFilePath = path.join(projectPath, `${table.table_name}.csv`);
                await fs.access(dataFilePath);

                const stats = await fs.stat(dataFilePath);
                size = stats.size;

                // Read file to count rows (optimization: could cache this or read partial)
                // For now, fast read is okay for 10-50MB files.
                // Or just estimate from size if too large.
                // Let's do a quick read of lines for accuracy on < 5MB?
                // For 10000 rows (1MB), it's fast.
                const content = await fs.readFile(dataFilePath, 'utf8');
                const lines = content.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
                rowCount = Math.max(0, lines.length - 1); // Subtract header

            } catch {
                // Fallback to Firestore
                const rowsSnapshot = await adminDb
                    .collection('users').doc(userId)
                    .collection('projects').doc(projectId)
                    .collection('tables').doc(table.table_id)
                    .collection('rows')
                    .count()
                    .get();

                rowCount = rowsSnapshot.data().count;
                // Estimate size: 100 bytes overhead + 100 bytes per row (very rough heuristic)
                size = 1024 + (rowCount * 128);
            }

            totalRows += rowCount;
            totalSize += size;

            tablesStats.push({
                name: table.table_name,
                rows: rowCount,
                size: size
            });
        }

        return {
            totalRows,
            totalSize,
            tables: tablesStats
        };

    } catch (error) {
        console.error("Error calculating analytics:", error);
        return { totalSize: 0, totalRows: 0, tables: [] };
    }
}
