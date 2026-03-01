const { Parser } = require('node-sql-parser');
const parser = new Parser();

try {
    const ast = parser.astify("SELECT * FROM dual", { database: 'Oracle' });
    console.log("Oracle parsed successfully:", ast);
} catch (e) {
    console.log("Oracle parser failed:", e.message);
}

try {
    const ast = parser.astify("SELECT * FROM pg_class", { database: 'PostgreSQL' });
    console.log("PostgreSQL parsed successfully:", ast);
} catch (e) {
    console.log("PostgreSQL parser failed:", e.message);
}

try {
    const ast = parser.astify("SELECT * FROM user_tables", { database: 'MySQL' });
    console.log("MySQL parsed successfully:", ast);
} catch (e) {
    console.log("MySQL parser failed:", e.message);
}
