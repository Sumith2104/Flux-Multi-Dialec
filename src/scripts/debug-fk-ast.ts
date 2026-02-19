
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
    console.log('--- SQL ---');
    try {
        const ast = p.astify(sql);
        console.log(JSON.stringify(ast, (key, value) => {
            if (key === 'location' || key === 'loc') return undefined; // Filter out location
            return value;
        }, 2));
    } catch (e) {
        console.error(e);
    }
}

debug(sql1);
debug(sql3);
