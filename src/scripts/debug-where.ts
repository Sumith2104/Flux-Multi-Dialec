
import { Parser } from 'node-sql-parser';

const parser = new Parser();

function evaluateWhereClause(whereNode: any, row: any): boolean {
    if (!whereNode) return true;

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
                rVal = right.value.map((v: any) => v.value);
            } else if (right.type === 'null') {
                rVal = null;
            } else {
                rVal = right.value;
            }

            console.log(`Checking: ${val} ${operator} ${rVal}`);
            return compare(val, operator, rVal);
        }

        return true;
    } catch (e: any) {
        console.error('Error:', e.message);
        return false;
    }
}

function compare(left: any, operator: string, right: any): boolean {
    switch (operator) {
        case '=': return left == right; // Use loose equality for string/number mismatch
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

// Test Case 1: Simple Equality
const ast1 = parser.astify("SELECT * FROM users WHERE email = 'test@example.com'");
const row1 = { email: 'test@example.com', id: 1 };
console.log('Test 1 (Match):', evaluateWhereClause(ast1[0].where, row1));

const row2 = { email: 'wrong@example.com', id: 2 };
console.log('Test 1 (No Match):', evaluateWhereClause(ast1[0].where, row2));

// Test Case 2: Object Column Name (Simulation)
// Manually construct weird AST node if needed, but parser usually handles standard SQL.

// Test Case 3: Column alias or strange format
const ast3 = parser.astify("SELECT * FROM users WHERE `users`.`email` = 'test@example.com'");
console.log('Test 3 (Table.Column):', evaluateWhereClause(ast3[0].where, row1));

