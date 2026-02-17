
import { Parser } from 'node-sql-parser';

const parser = new Parser();
const query = "CREATE TABLE Departments ( department_id INT PRIMARY KEY, department_name VARCHAR(255) )";

try {
    const ast = parser.astify(query, { database: 'PostgreSQL' });
    console.log(JSON.stringify(ast, null, 2));
} catch (e) {
    console.error("Parser Error:", e);
}
