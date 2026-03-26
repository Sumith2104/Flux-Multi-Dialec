require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');
(async () => {
  try {
    const url = new URL(process.env.AWS_RDS_MYSQL_URL);
    url.pathname = '';
    const pool = mysql.createPool(url.toString());
    await pool.query('DROP DATABASE IF EXISTS `project_test123`');
    console.log('DROP DATABASE success');
    await pool.query('CREATE DATABASE `project_test123`');
    console.log('CREATE DATABASE success');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
