import { Pool } from 'pg';

/**
 * Creates a new table dynamically if it doesn't already exist.
 * @param pool The PostgreSQL Database Pool
 * @param schemaName The tenant project schema name (e.g., project_1234)
 * @param tableName The sanitized table name requested by the user
 * @param columns The safe column definitions (e.g., ["price TEXT", "title TEXT"])
 */
export async function createTable(
    pgPool: Pool,
    schemaName: string,
    tableName: string,
    columns: { columnName: string, sqlDefinition: string }[],
    dialect: string = 'postgresql'
): Promise<void> {

    if (dialect.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();

        let defs = [];
        for (const c of columns) {
            defs.push(`\`${c.columnName}\` LONGTEXT`);
        }
        const definitions = defs.join(',\n            ');

        const createDbDdl = `CREATE DATABASE IF NOT EXISTS \`${schemaName}\`;`;
        const createTableDdl = `
            CREATE TABLE IF NOT EXISTS \`${schemaName}\`.\`${tableName}\` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                _scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ${definitions}
            );
        `;
        console.log(`[Scraper Ingestion] Ensuring MySQL Database and table \`${schemaName}\`.\`${tableName}\` exist...`);
        await mysqlPool.query(createDbDdl);
        await mysqlPool.query(createTableDdl);
    } else {
        const definitions = columns.map(c => c.sqlDefinition).join(',\n                ');

        const createSchemaDdl = `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`;
        const createTableDdl = `
            CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (
                id SERIAL PRIMARY KEY,
                _scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ${definitions}
            );
        `;

        console.log(`[Scraper Ingestion] Ensuring PG schema and table "${schemaName}"."${tableName}" exist...`);
        await pgPool.query(createSchemaDdl);
        await pgPool.query(createTableDdl);
    }
}

/**
 * High-speed Parameterized Bulk Ingestion Engine
 * Chunks the massive scraped JSON array into chunks of 500 rows to prevent database timeouts.
 *
 * @param pool The PostgreSQL Database Pool
 * @param schemaName The tenant project schema name
 * @param tableName The target table name
 * @param rows The massive array of extracted row objects
 * @param columns Our inferred schema metadata for safely looping keys
 */
export async function insertRows(
    pgPool: Pool,
    schemaName: string,
    tableName: string,
    rows: Record<string, string>[],
    columns: { columnName: string, sqlDefinition: string }[],
    dialect: string = 'postgresql'
): Promise<void> {
    const CHUNK_SIZE = 500;
    const safeKeys = columns.map(c => c.columnName);

    console.log(`[Scraper Ingestion] Beginning bulk insert of ${rows.length} rows in chunks of ${CHUNK_SIZE}...`);

    if (dialect.toLowerCase() === 'mysql') {
        const { getMysqlPool } = await import('@/lib/mysql');
        const mysqlPool = getMysqlPool();
        const colsStr = safeKeys.map(k => `\`${k}\``).join(', ');

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const values: any[] = [];
            const placeholders: string[] = [];

            chunk.forEach(row => {
                const rowPlaceholders: string[] = [];
                safeKeys.forEach(key => {
                    values.push(row[key] || null);
                    rowPlaceholders.push(`?`);
                });
                placeholders.push(`(${rowPlaceholders.join(', ')})`);
            });

            const insertSql = `INSERT INTO \`${schemaName}\`.\`${tableName}\` (${colsStr}) VALUES ${placeholders.join(', ')}`;
            await mysqlPool.query(insertSql, values);
        }
    } else {
        const colsStr = safeKeys.map(k => `"${k}"`).join(', ');

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const values: any[] = [];
            const placeholders: string[] = [];
            let paramIndex = 1;

            chunk.forEach(row => {
                const rowPlaceholders: string[] = [];
                safeKeys.forEach(key => {
                    values.push(row[key] || null);
                    rowPlaceholders.push(`$${paramIndex++}`);
                });
                placeholders.push(`(${rowPlaceholders.join(', ')})`);
            });

            const insertSql = `INSERT INTO "${schemaName}"."${tableName}" (${colsStr}) VALUES ${placeholders.join(', ')}`;
            await pgPool.query(insertSql, values);
        }
    }

    console.log(`[Scraper Ingestion] Completed bulk insert successfully.`);
}
