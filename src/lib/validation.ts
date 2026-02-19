
import { Row, Column } from '@/lib/data';

export function validateRow(row: Row, columns: Column[]) {
    for (const col of columns) {
        const val = row[col.column_name];

        // 1. Check NOT NULL
        if (!col.is_nullable && (val === null || val === undefined || val === '')) {
            // Exceptions: Auto-increment or default values might be handled by DB, 
            // but here we are simulating. If no default value, it's an error.
            if (!col.default_value && col.column_name !== 'id') {
                throw new Error(`Column '${col.column_name}' cannot be null.`);
            }
        }

        if (val !== null && val !== undefined && val !== '') {
            // 2. Check Data Types
            const type = col.data_type.toUpperCase();

            // Map 'number' to INT/FLOAT for validation if needed, or just handle it.
            // validRow already checks valid numbers.

            switch (type) {
                case 'INT':
                case 'NUMBER': // Handle 'number' type
                    if (!Number.isInteger(Number(val))) {
                        // Soft check: generic number
                        if (isNaN(Number(val))) {
                            throw new Error(`Column '${col.column_name}' expects a Number, got '${val}'.`);
                        }
                    }
                    break;
                case 'FLOAT':
                    if (isNaN(Number(val))) {
                        throw new Error(`Column '${col.column_name}' expects a Float, got '${val}'.`);
                    }
                    break;
                case 'BOOLEAN':
                    // loose check for boolean from strings
                    const boolVal = String(val).toLowerCase();
                    if (!['true', 'false', '0', '1'].includes(boolVal)) {
                        throw new Error(`Column '${col.column_name}' expects a Boolean, got '${val}'.`);
                    }
                    break;
                case 'DATE':
                case 'TIMESTAMP':
                case 'TIMESTAMPTZ':
                case 'DATETIME':
                    if (isNaN(Date.parse(String(val)))) {
                        throw new Error(`Column '${col.column_name}' expects a Date/Timestamp, got '${val}'.`);
                    }
                    break;
                // VARCHAR, TEXT are loose strings
            }
        }
    }
}
