export interface IndexRecommendation {
    tableName: string;
    columnName: string;
    indexName: string;
    sqlStatement: string;
    reason: string;
}

export class IndexAdvisor {
    /**
     * Inspects a SQL query string and detects potential unindexed WHERE or JOIN columns.
     */
    public static analyzeQuery(queryText: string, dialect: 'postgresql' | 'mysql' = 'postgresql'): IndexRecommendation[] {
        const recommendations: IndexRecommendation[] = [];
        const cleanQuery = queryText.trim().toLowerCase();

        // Only analyze SELECT, UPDATE, DELETE queries with WHERE clauses
        if (!cleanQuery.includes('where')) return [];

        // Extract WHERE clause columns using regex pattern matching
        const whereMatch = cleanQuery.match(/where\s+([a-z0-9_.\s=><!'"%-]+?)(?:order\s+by|group\s+by|limit|;|$)/i);
        if (!whereMatch) return [];

        const whereCondition = whereMatch[1];
        
        // Extract table name from FROM / UPDATE clause
        const tableMatch = cleanQuery.match(/(?:from|update|into)\s+["`]?([a-z0-9_]+)["`]?/i);
        if (!tableMatch) return [];

        const tableName = tableMatch[1];

        // Parse condition columns e.g. "email = 'user@example.com'" or "user_id = 5"
        const colMatches = whereCondition.matchAll(/([a-z0-9_]+)\s*(?:=|>|<|!=|like|in)/gi);

        for (const match of colMatches) {
            const colName = match[1];
            // Skip system keywords
            if (['and', 'or', 'not', 'is', 'null', 'true', 'false', 'select', 'where'].includes(colName.toLowerCase())) continue;

            const indexName = `idx_${tableName}_${colName}`;
            const sqlStatement = dialect === 'postgresql'
                ? `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ("${colName}");`
                : `CREATE INDEX \`${indexName}\` ON \`${tableName}\` (\`${colName}\`);`;

            recommendations.push({
                tableName,
                columnName: colName,
                indexName,
                sqlStatement,
                reason: `Column "${colName}" in table "${tableName}" is filtered in WHERE clause. Adding an index will accelerate query performance.`
            });
        }

        return recommendations;
    }
}
