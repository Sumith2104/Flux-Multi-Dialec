import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    const pool = mysql.createPool(process.env.AWS_RDS_MYSQL_URL);

    const [cols] = await pool.query('SHOW COLUMNS FROM `project_8f5fb711f85b4b91`.`test_`');
    console.log('Columns:', cols);

    const [rows] = await pool.query('SELECT * FROM `project_8f5fb711f85b4b91`.`test_` WHERE `id` = "72193f3d-1a44-11f1-9fb4-06509421a721"');
    console.log('Row 2:', rows);

    pool.end();
}

test().catch(console.error);
