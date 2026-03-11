/**
 * Infers SQL column structures automatically based on the extracted JSON keys.
 * By default, web scraped data is extremely unpredictable, so we map everything to TEXT.
 * It also strips out unsafe characters from column names to prevent SQL Injection during DDL.
 * 
 * @param sampleRow A sample data object extracted from the webpage.
 * @returns Array of SQL Column Definition Strings like ["price TEXT", "title TEXT"]
 */
export function inferSchema(sampleRow: Record<string, any>): { columnName: string, sqlDefinition: string }[] {
    console.log(`[Scraper Schema] Inferring dynamic schema...`);

    const columns: { columnName: string, sqlDefinition: string }[] = [];

    for (const key in sampleRow) {
        // Sanitize the column name to only allow alphanumeric and underscores
        const safeColumnName = key.replace(/[^a-zA-Z0-9_]/g, '');

        if (safeColumnName) {
            // We force everything to TEXT initially to prevent immediate type crashes from unstructured web data
            columns.push({
                columnName: safeColumnName,
                sqlDefinition: `"${safeColumnName}" TEXT`
            });
        }
    }

    return columns;
}
