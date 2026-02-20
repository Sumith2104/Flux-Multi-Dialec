const { Parser } = require('node-sql-parser');
const p = new Parser();
const ast = p.astify("UPDATE plans SET price = 1000 WHERE plan_name = 'test'", { database: 'PostgreSQL' });
console.log(JSON.stringify(ast, null, 2));
