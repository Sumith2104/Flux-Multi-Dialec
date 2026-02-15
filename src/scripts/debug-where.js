
const { Parser } = require('node-sql-parser');

const parser = new Parser();

function evaluateWhereClause(whereNode, row) {
    if (!whereNode) return true;
    console.log('[DEBUG] whereNode:', JSON.stringify(whereNode, null, 2));

    try {
        const { type, operator, left, right } = whereNode;

        if (type === 'binary_expr') {
            if (['AND', 'OR'].includes(operator.toUpperCase())) {
                const leftValue = evaluateWhereClause(left, row);
                if (operator.toUpperCase() === 'AND' && !leftValue) return false;
                if (operator.toUpperCase() === 'OR' && leftValue) return true;
                const rightValue = evaluateWhereClause(right, row);
                if (operator.toUpperCase() === 'AND') return leftValue && rightValue;
                if (operator.toUpperCase() === 'OR') return leftValue || rightValue;
            }

            let colName = left.column;
            if (colName && typeof colName === 'object') {
                colName = colName.column || colName.value || colName.name || JSON.stringify(colName);
            }
            colName = String(colName);
            const actualCol = colName.includes('.') ? colName.split('.')[1] : colName;

            // Debug logging
            // console.log(`[DEBUG] Evaluating: ${colName} (mapped to ${actualCol}) ${operator} ...`);
            // console.log(`[DEBUG] Row value:`, row[actualCol]);

            if (row[actualCol] === undefined && row[colName] === undefined) return false;
            const val = row[actualCol] !== undefined ? row[actualCol] : row[colName];

            let rVal;
            if (right.type === 'column_ref') {
                let rightColName = right.column;
                if (rightColName && typeof rightColName === 'object') {
                    rightColName = rightColName.column || rightColName.value || rightColName.name || JSON.stringify(rightColName);
                }
                rightColName = String(rightColName);
                const rightCol = rightColName.includes('.') ? rightColName.split('.')[1] : rightColName;
                rVal = row[rightCol];
            } else if (right.type === 'value_list') {
                rVal = right.value.map(v => v.value);
            } else if (right.type === 'null') {
                rVal = null;
            } else {
                rVal = right.value;
            }

            console.log(`Checking: '${val}' (${typeof val}) ${operator} '${rVal}' (${typeof rVal})`);
            return compare(val, operator, rVal);
        }

        return true;
    } catch (e) {
        console.error('Error:', e.message);
        return false;
    }
}

function compare(left, operator, right) {
    switch (operator) {
        case '=': return left == right; // Use loose equality
        case '!=':
        case '<>': return left != right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case 'IN': return Array.isArray(right) && right.includes(left);
        case 'LIKE':
            if (typeof left !== 'string' || typeof right !== 'string') return false;
            const regex = new RegExp(`^${right.replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');
            return regex.test(left);
        default: return false;
    }
}

// Test Case 1: Simple Equality (String vs String)
console.log('--- Test 1: Simple Equality ---');
const ast1 = parser.astify("SELECT * FROM users WHERE email = 'test@example.com'");
// console.log('AST1 Structure:', JSON.stringify(ast1, null, 2));

const row1 = { email: 'test@example.com', id: 1 };
const whereClause = Array.isArray(ast1) ? ast1[0].where : ast1.where;

try {
    console.log('Match?', evaluateWhereClause(whereClause, row1));
} catch (e) {
    console.error('Error executing Test 1:', e);
}

// Test Case 2: String vs Single Quotes (Parser might handle strings differently)
console.log('\n--- Test 2: Mismatch ---');
const row2 = { email: 'wrong@example.com', id: 2 };
console.log('Match?', evaluateWhereClause(whereClause, row2));

// Test Case 3: Table.Column format
console.log('\n--- Test 3: Table.Column ---');
const ast3 = parser.astify("SELECT * FROM users WHERE `users`.`email` = 'test@example.com'");
console.log('Match?', evaluateWhereClause(ast3[0].where, row1));

// Test Case 4: Integer vs String comparison (Loose equality check)
console.log('\n--- Test 4: Type Coercion ---');
const ast4 = parser.astify("SELECT * FROM users WHERE id = 1");
const rowStringId = { email: 'test@example.com', id: '1' };
console.log('Match?', evaluateWhereClause(ast4[0].where, rowStringId));
