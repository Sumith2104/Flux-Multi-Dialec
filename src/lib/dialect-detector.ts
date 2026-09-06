export interface DialectScore {
    postgresql: number;
    mysql: number;
    winner: 'postgresql' | 'mysql';
    confidence: number; // 0 - 100
    details: {
        pgMatchedKeywords: string[];
        mysqlMatchedKeywords: string[];
    };
}

/**
 * Analyzes SQL content and scores dialect indicators.
 * Works on concatenated or individual SQL strings.
 */
export function detectDialect(sqlContent: string): DialectScore {
    if (!sqlContent || !sqlContent.trim()) {
        return {
            postgresql: 0,
            mysql: 0,
            winner: 'postgresql',
            confidence: 0,
            details: { pgMatchedKeywords: [], mysqlMatchedKeywords: [] }
        };
    }

    const upper = sqlContent.toUpperCase();

    let pgScore = 0;
    let mysqlScore = 0;
    const pgMatched: string[] = [];
    const mysqlMatched: string[] = [];

    const pgRules: Array<{ pattern: RegExp; score: number; label: string }> = [
        { pattern: /\b(BIGSERIAL|SERIAL)\b/, score: 10, label: 'SERIAL' },
        { pattern: /\bJSONB\b/, score: 8, label: 'JSONB' },
        { pattern: /\bUUID\b/, score: 8, label: 'UUID' },
        { pattern: /\bBYTEA\b/, score: 8, label: 'BYTEA' },
        { pattern: /CREATE\s+EXTENSION/i, score: 10, label: 'CREATE EXTENSION' },
        { pattern: /\$\$/, score: 10, label: '$$ (Dollar Quoting)' },
        { pattern: /\bRETURNING\b/, score: 8, label: 'RETURNING' },
        { pattern: /\bON\s+CONFLICT\b/, score: 8, label: 'ON CONFLICT' },
        { pattern: /\b(TIMESTAMP\s+WITH\s+TIME\s+ZONE|TIMESTAMPTZ)\b/, score: 6, label: 'TIMESTAMPTZ' },
        { pattern: /\bBOOLEAN\b/, score: 4, label: 'BOOLEAN' },
        { pattern: /\bCITEXT\b/, score: 8, label: 'CITEXT' },
        { pattern: /\bINET\b/, score: 8, label: 'INET' },
        { pattern: /\bARRAY\[/, score: 8, label: 'ARRAY[]' },
        { pattern: /\bGEN_RANDOM_UUID\(\)/, score: 8, label: 'gen_random_uuid()' },
    ];

    const mysqlRules: Array<{ pattern: RegExp; score: number; label: string }> = [
        { pattern: /\bAUTO_INCREMENT\b/, score: 10, label: 'AUTO_INCREMENT' },
        { pattern: /ENGINE\s*=\s*(INNODB|MYISAM|MEMORY)/i, score: 10, label: 'ENGINE=' },
        { pattern: /\bUNSIGNED\b/, score: 8, label: 'UNSIGNED' },
        { pattern: /\b(TINYINT|MEDIUMINT)\b/, score: 8, label: 'TINYINT/MEDIUMINT' },
        { pattern: /\bON\s+DUPLICATE\s+KEY\b/, score: 10, label: 'ON DUPLICATE KEY' },
        { pattern: /COLLATE\s+UTF8/i, score: 6, label: 'COLLATE utf8' },
        { pattern: /\bDATETIME\b/, score: 6, label: 'DATETIME' },
        { pattern: /\bENUM\s*\(/, score: 6, label: 'ENUM(...)' },
        { pattern: /DEFAULT\s+CURRENT_TIMESTAMP\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/i, score: 10, label: 'ON UPDATE CURRENT_TIMESTAMP' },
        { pattern: /`[^`]+`/, score: 4, label: 'Backtick Quoting (`...`)' },
    ];

    for (const rule of pgRules) {
        if (rule.pattern.test(upper)) {
            pgScore += rule.score;
            pgMatched.push(rule.label);
        }
    }

    for (const rule of mysqlRules) {
        if (rule.pattern.test(upper)) {
            mysqlScore += rule.score;
            mysqlMatched.push(rule.label);
        }
    }

    const winner: 'postgresql' | 'mysql' = pgScore >= mysqlScore ? 'postgresql' : 'mysql';
    const totalMax = Math.max(pgScore, mysqlScore, 1);
    const diff = Math.abs(pgScore - mysqlScore);

    // Confidence 0-100%
    const confidence = totalMax === 1 && diff === 0 ? 0 : Math.min(100, Math.round((diff / totalMax) * 100));

    return {
        postgresql: pgScore,
        mysql: mysqlScore,
        winner,
        confidence,
        details: {
            pgMatchedKeywords: pgMatched,
            mysqlMatchedKeywords: mysqlMatched
        }
    };
}
