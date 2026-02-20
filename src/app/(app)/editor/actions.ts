'use server';

import { v4 as uuidv4 } from 'uuid';
import { getCurrentUserId } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
    getColumnsForTable,
    getConstraintsForTable,
    getTableData,
    getConstraintsForProject,
    getTablesForProject,
    insertRow,
    updateRow,
    deleteRow,
    addColumn,
    updateColumn,
    deleteColumn,
    addConstraint,
    deleteConstraint,
    deleteTable,
    Constraint,
    getProjectById
} from '@/lib/data';
import { getLocalTimestamp } from '@/lib/utils';

// --- Constraint Validation Helpers ---

async function validatePrimaryKey(projectId: string, tableId: string, newRow: Record<string, any>, rowIdToExclude?: string) {
    const pkConstraints = (await getConstraintsForTable(projectId, tableId)).filter(c => c.type === 'PRIMARY KEY');
    if (pkConstraints.length === 0) return;

    // For simplicity in this phase, we fetch the whole table (up to limit) to check for uniqueness.
    // In a production app, we would query specifically for the conflicting values.
    const { rows: existingRows } = await getTableData(projectId, (await getTablesForProject(projectId)).find(t => t.table_id === tableId)?.table_name || '', 1, 10000);

    for (const constraint of pkConstraints) {
        const pkColumns = constraint.column_names.split(',');
        const pkValue = pkColumns.map(col => newRow[col]).join('-');

        // Check for null/empty values
        for (const col of pkColumns) {
            if (newRow[col] === null || newRow[col] === undefined || newRow[col] === '') {
                throw new Error(`Primary key violation: Column '${col}' cannot be null.`);
            }
        }

        // Check for uniqueness
        const duplicate = existingRows.some((row: any) => {
            // If editing, exclude the current row from the check
            if (rowIdToExclude && row.id === rowIdToExclude) {
                return false;
            }
            const existingPkValue = pkColumns.map(col => row[col]).join('-');
            return existingPkValue === pkValue;
        });

        if (duplicate) {
            throw new Error(`Primary key violation: A row with the value(s) '${pkValue.replace(/-/g, ', ')}' for column(s) '${constraint.column_names}' already exists.`);
        }
    }
}

async function validateForeignKey(projectId: string, tableId: string, newRow: Record<string, any>) {
    const fkConstraints = (await getConstraintsForTable(projectId, tableId)).filter(c => c.type === 'FOREIGN KEY');

    if (fkConstraints.length === 0) return;

    for (const constraint of fkConstraints) {
        const fkColumns = constraint.column_names.split(',');
        const fkValue = fkColumns.map(col => newRow[col]).join('-');

        // Skip validation if FK value is null or empty for any column in the key
        if (!fkValue || fkColumns.some(col => !newRow[col])) continue;

        const referencedTable = (await getTablesForProject(projectId)).find(t => t.table_id === constraint.referenced_table_id);
        if (!referencedTable) throw new Error(`Internal error: Referenced table with ID '${constraint.referenced_table_id}' not found.`);

        const { rows: referencedData } = await getTableData(projectId, referencedTable.table_name, 1, 10000);
        const referencedPkColumns = (constraint.referenced_column_names || '').split(',');

        const referenceExists = referencedData.some((refRow: any) => {
            // If the key is 'id', it might be the doc ID, which is always present in 'refRow.id'
            // But strict column checking relies on row content.
            const refPkValue = referencedPkColumns.map(col => refRow[col]).join('-');
            return refPkValue === fkValue;
        });

        if (!referenceExists) {
            throw new Error(`Foreign key violation on table '${referencedTable.table_name}': The value '${fkValue.replace(/-/g, ', ')}' for column '${constraint.column_names}' does not exist in the referenced table.`);
        }
    }
}

// --- Row Actions ---

export async function addRowAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const userId = await getCurrentUserId();

    if (!projectId || !tableName || !userId || !tableId) {
        return { error: 'Missing required fields.' };
    }

    try {
        // 1. Prepare data
        const columns = await getColumnsForTable(projectId, tableId);
        if (!columns.length) return { error: 'No columns found for this table.' };

        // Fetch project for timezone context
        const project = await getProjectById(projectId, userId);

        const newRowObject: Record<string, any> = {};
        const now = new Date();

        for (const col of columns) {
            let value: string | null = null;
            const formValues = formData.getAll(col.column_name);
            if (formValues.length > 0) {
                value = formValues[formValues.length - 1] as string;
            }

            // Logic to generate default values
            if (col.default_value === 'now()' || (!value && ['created_at', 'updated_at'].includes(col.column_name.toLowerCase()))) {
                if (!value) {
                    value = getLocalTimestamp(project?.timezone);
                }
            }

            if (col.column_name === 'id' && !value) {
                value = uuidv4();
            }

            if (value && ['timestamp', 'timestamptz', 'datetime'].includes(col.data_type.toLowerCase())) {
                try {
                    // Try parsing it. If it fails, keep the original string.
                    value = new Date(value).toISOString();
                } catch (e) {
                    console.error("Invalid date value", value);
                }
            }

            newRowObject[col.column_name] = value || ''; // Firestore allows empty strings
        }

        // Ensure ID exists
        if (!newRowObject['id']) {
            newRowObject['id'] = uuidv4();
        }

        // 2. Validate
        await validatePrimaryKey(projectId, tableId, newRowObject);
        await validateForeignKey(projectId, tableId, newRowObject);

        // 3. Insert
        await insertRow(projectId, tableId, newRowObject);

        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to add row:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

export async function editRowAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const rowId = formData.get('rowId') as string;
    const userId = await getCurrentUserId();

    if (!projectId || !tableName || !userId || !rowId) {
        return { error: 'Missing required fields for editing.' };
    }

    try {
        const columns = await getColumnsForTable(projectId, tableId);
        const project = await getProjectById(projectId, userId);

        const newRowObject: Record<string, any> = { id: rowId };
        columns.forEach(col => {
            if (col.column_name !== 'id') {
                let value = formData.get(col.column_name) as string | null;

                // Auto-fill updated_at on edits
                if (!value && col.column_name.toLowerCase() === 'updated_at') {
                    value = getLocalTimestamp(project?.timezone);
                }

                if (value && ['timestamp', 'timestamptz', 'datetime'].includes(col.data_type.toLowerCase())) {
                    try {
                        value = new Date(value).toISOString();
                    } catch (e) {
                        // Keep original
                    }
                }

                newRowObject[col.column_name] = value || '';
            }
        });

        // Validate
        await validatePrimaryKey(projectId, tableId, newRowObject, rowId);
        await validateForeignKey(projectId, tableId, newRowObject);

        // Update
        await updateRow(projectId, tableId, rowId, newRowObject);

        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to edit row:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

export async function deleteRowAction(projectId: string, tableId: string, tableName: string, rowIds: string[]) {
    const userId = await getCurrentUserId();
    if (!projectId || !tableName || !userId || !rowIds || rowIds.length === 0) {
        return { error: 'Missing required fields for deletion.' };
    }

    try {
        // Cascade delete logic would go here. 
        // For Phase 2, we skip complex CSV cascading and assume Firestore handles it or we add it later.

        for (const id of rowIds) {
            await deleteRow(projectId, tableId, id);
        }

        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true, deletedCount: rowIds.length };

    } catch (error) {
        console.error('Failed to delete row(s):', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

// --- Column Actions ---

export async function addColumnAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const columnName = formData.get('columnName') as string;
    const columnType = formData.get('columnType') as any;
    const userId = await getCurrentUserId();

    if (!projectId || !tableId || !tableName || !columnName || !columnType || !userId) {
        return { error: 'Missing required fields.' };
    }

    try {
        await addColumn(projectId, tableId, {
            column_name: columnName,
            data_type: columnType,
            is_primary_key: false,
            is_nullable: true
        });

        // No need to backfill data in Firestore
        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to add column:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}


export async function editColumnAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const columnId = formData.get('columnId') as string;
    const newColumnName = formData.get('newColumnName') as string;

    // Phase 2: We just update the metadata. No data migration implemented yet for simple renames 
    // (since data is key-value in Firestore, renaming a column requires updating ALL docs).
    // For this prototype, we'll update the column definition, but old data might be lost/hidden.
    // WARNING: Renaming columns in Firestore is expensive (Update all docs).

    try {
        await updateColumn(projectId, tableId, columnId, { column_name: newColumnName });
        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to edit column:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}


export async function deleteColumnAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const columnId = formData.get('columnId') as string;
    const columnName = formData.get('columnName') as string;

    try {
        // Validation: Check constraints
        const constraints = await getConstraintsForProject(projectId);
        const isUsedInConstraint = constraints.some(c => c.table_id === tableId && c.column_names.split(',').includes(columnName));
        if (isUsedInConstraint) {
            return { error: `Cannot delete column '${columnName}' being used in a constraint.` };
        }

        await deleteColumn(projectId, tableId, columnId);

        // Note: Field remains in documents until manually cleaned up or overwritten.

        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true };
    } catch (error) {
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

// --- Constraint Actions ---

export async function addConstraintAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const type = formData.get('type') as Constraint['type'];
    const columnNames = formData.get('columnNames') as string;

    try {
        const constraint: any = {
            table_id: tableId,
            type,
            column_names: columnNames,
        };

        if (type === 'FOREIGN KEY') {
            constraint.referenced_table_id = formData.get('referencedTableId');
            constraint.referenced_column_names = formData.get('referencedColumnNames');
            constraint.on_delete = formData.get('onDelete');
        }

        await addConstraint(projectId, constraint);
        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${formData.get('tableName')}`);
        return { success: true };

    } catch (error) {
        console.error('Failed to add constraint:', error);
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

export async function deleteConstraintAction(formData: FormData) {
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const constraintId = formData.get('constraintId') as string;

    try {
        await deleteConstraint(projectId, constraintId);
        // revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
        return { success: true };
    } catch (error) {
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}

export async function deleteTableAction(projectId: string, tableId: string, tableName: string) {
    try {
        await deleteTable(projectId, tableId);
        revalidatePath(`/dashboard?projectId=${projectId}`);
        return { success: true };
    } catch (error) {
        return { error: `An unexpected error occurred: ${(error as Error).message}` };
    }
}