
const { Parser } = require('node-sql-parser');
const p = new Parser();

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

function debug(sql) {
    console.log('--- SQL Analysis ---');
    try {
        const ast = p.astify(sql);
        const definitions = Array.isArray(ast) ? ast[0].create_definitions : ast.create_definitions;
        const tableName = Array.isArray(ast) ? ast[0].table[0].table : ast.table[0].table;

        console.log('Table:', tableName);

        definitions.forEach(def => {
            if (def.constraint_type === 'FOREIGN KEY') {
                console.log('Found Explicit FK:');

                // Columns
                const cols = def.definition.map(c => c.column); // expecting column property
                console.log('  Columns:', JSON.stringify(cols));

                // Ref Table
                const refTable = def.reference_definition.table[0].table;
                const refDb = def.reference_definition.table[0].db;
                console.log('  Ref Table:', refTable);
                console.log('  Ref DB:', refDb);

                // Ref Columns
                const refCols = def.reference_definition.definition.map(c => c.column);
                console.log('  Ref Columns:', JSON.stringify(refCols));
            }
        });

    } catch (e) {
        console.error(e);
    }
}

debug(sql1);
debug(sql3);
