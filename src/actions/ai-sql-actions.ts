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

        // 3. Get the project dialect, default to PostgreSQL
        const { getProjectById } = await import('@/lib/data');
        const { getCurrentUserId } = await import('@/lib/auth');
        const userId = await getCurrentUserId();

        let dialect = 'PostgreSQL';
        if (userId) {
            const project = await getProjectById(projectId, userId);
            if (project && project.dialect) {
                const fetchedDialect = project.dialect.toLowerCase();
                if (fetchedDialect === 'postgresql') dialect = 'PostgreSQL';
                else if (fetchedDialect === 'mysql') dialect = 'MySQL';
                else dialect = project.dialect;
            }
        }

        // 4. Call Genkit Flow
        const result = await generateSQL({
            userInput,
            tableSchema: schemaDescription,
            dialect
        });

        // Ensure no markdown blocks snuck in
        let finalQuery = result.sqlQuery || '';
        if (finalQuery.startsWith('\`\`\`sql')) {
            finalQuery = finalQuery.replace(/^\`\`\`sql\n?/, '').replace(/\n?\`\`\`$/, '');
        } else if (finalQuery.startsWith('\`\`\`')) {
            finalQuery = finalQuery.replace(/^\`\`\`\n?/, '').replace(/\n?\`\`\`$/, '');
        }

        return { success: true, query: result.sqlQuery };

    } catch (error: any) {
        console.error('Error generating SQL:', error);
        return { success: false, error: error.message || 'Failed to generate SQL' };
    }
}
