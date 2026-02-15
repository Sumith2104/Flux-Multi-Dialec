'use server';

import { getTablesForProject, getColumnsForTable } from '@/lib/data';
import { generateSQL } from '@/ai/flows/generate-sql';

export async function generateSQLAction(projectId: string, userInput: string) {
    try {
        // 1. Fetch tables
        const tables = await getTablesForProject(projectId);
        console.log('[DEBUG] generateSQLAction tables:', tables.length);

        // 2. Fetch columns for all tables and build schema string
        let schemaDescription = '';

        for (const table of tables) {
            const columns = await getColumnsForTable(projectId, table.table_id);

            const columnsDesc = columns.map(col =>
                `${col.column_name} (${col.data_type}${col.is_primary_key ? ' PK' : ''}${col.is_nullable ? '' : ' NOT NULL'})`
            ).join(', ');

            schemaDescription += `Table: ${table.table_name}\nColumns: ${columnsDesc}\nDescription: ${table.description || 'No description'}\n\n`;
        }

        if (!schemaDescription) {
            schemaDescription = "No tables exist in the project yet. The user may want to create a new table. Please generate a CREATE TABLE statement if requested.";
        }

        // 3. Call Genkit Flow
        const result = await generateSQL({
            userInput,
            tableSchema: schemaDescription
        });

        return { success: true, query: result.sqlQuery };

    } catch (error: any) {
        console.error('Error generating SQL:', error);
        return { success: false, error: error.message || 'Failed to generate SQL' };
    }
}
