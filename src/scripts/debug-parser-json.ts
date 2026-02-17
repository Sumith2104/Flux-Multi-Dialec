
import { Parser } from 'node-sql-parser';
import fs from 'fs';

const parser = new Parser();
const query = "CREATE TABLE Departments ( department_id INT PRIMARY KEY, department_name VARCHAR(255) )";

try {
    const ast = parser.astify(query, { database: 'PostgreSQL' });
    fs.writeFileSync('debug_ast.json', JSON.stringify(ast, null, 2));
    console.log("AST written to debug_ast.json");
} catch (e) {
    console.error("Parser Error:", e);
}
