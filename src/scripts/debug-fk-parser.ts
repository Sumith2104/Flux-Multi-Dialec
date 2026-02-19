
const { Parser } = require('node-sql-parser');
const p = new Parser();

function extractVal(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.column) return obj.column;
    if (obj.value) return obj.value;
    if (obj.name) return obj.name;
    return 'UNKNOWN_OBJ';
}

function debugSQL(sql: string) {
    console.log('--- Analyze SQL ---');
    // console.log(sql);
    try {
        const ast = p.astify(sql);
        // console.log('AST:', JSON.stringify(ast, null, 2));

        if (Array.isArray(ast)) {
            ast.forEach(analyzeStatement);
        } else {
            analyzeStatement(ast);
        }
    } catch (e) {
        console.error('Parse Error:', e);
    }
}

function analyzeStatement(ast: any) {
    if (ast.type === 'create' && ast.keyword === 'table') {
        const tableName = (ast.table[0].table);
        console.log(`Table: ${tableName}`);

        ast.create_definitions.forEach((def: any) => {
            if (def.resource === 'column') {
                const colName = extractVal(def.column);
                console.log(`  Column: ${colName}`);

                if (def.primary_key) {
                    console.log(`    -> Inline PRIMARY KEY`);
                }

                if (def.reference_definition) {
                    console.log(`    -> Inline FOREIGN KEY`);
                    const refTable = def.reference_definition.table?.[0]?.table;
                    const refCols = def.reference_definition.definition?.map((c: any) => extractVal(c.column));
                    console.log(`       Ref Table: ${refTable}, Ref Cols: ${refCols}`);
                }
            } else if (def.resource === 'constraint') {
                const type = def.constraint_type;
                console.log(`  Constraint: ${type}`);
                if (type === 'FOREIGN KEY') {
                    const fkCols = def.definition.map((c: any) => extractVal(c));
                    const refTable = def.reference_definition?.table?.[0]?.table;
                    const refCols = def.reference_definition?.definition?.map((c: any) => extractVal(c));
                    console.log(`    FK Cols: ${fkCols}, Ref Table: ${refTable}, Ref Cols: ${refCols}`);
                }
            }
        });
    }
}

const sql1 = `
CREATE TABLE orders (
    id INT PRIMARY KEY,
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

const sql3 = `
CREATE TABLE "orders_quoted" (
    "id" INT PRIMARY KEY,
    "user_id" INT,
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
);
`;

debugSQL(sql1);
debugSQL(sql3);
