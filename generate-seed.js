const fs = require('fs');
const numUsers = 2000;
const numOrders = 10000;

let sql = '-- Pure Raw SQL Data Seed\n';
sql += 'SET FOREIGN_KEY_CHECKS = 0;\n';
sql += 'TRUNCATE TABLE orders;\nTRUNCATE TABLE users;\nTRUNCATE TABLE products;\nTRUNCATE TABLE categories;\n';

sql += 'INSERT INTO categories (category_name) VALUES (\'Electronics\'), (\'Apparel\'), (\'Home & Kitchen\'), (\'Sports & Outdoors\'), (\'Books & Media\');\n';

let products = [];
for(let i=1; i<=100; i++) {
  products.push(`(${Math.floor(Math.random()*5)+1}, '\'Premium Product ${i}\'', ${Math.floor(Math.random()*800)+15})`);
}
sql += `INSERT INTO products (category_id, product_name, base_price) VALUES ${products.join(', ')};\n`;

let users = [];
for(let i=1; i<=numUsers; i++) {
  users.push(`('\'Customer ${i}\'', '\'customer_${i}_${Math.floor(Math.random()*999999)}@shopdemo.com\'', '\'USA\'', DATE_SUB(NOW(), INTERVAL ${Math.floor(Math.random()*365)} DAY))`);
}
sql += `INSERT INTO users (full_name, email, country, signup_date) VALUES ${users.join(', ')};\n`;

let orders = [];
for(let i=1; i<=numOrders; i++) {
  orders.push(`(${Math.floor(Math.random()*numUsers)+1}, '\'Delivered\'', DATE_SUB(NOW(), INTERVAL ${Math.floor(Math.random()*365)} DAY), ${Math.floor(Math.random()*1500)+25})`);
}

// Chunk orders to prevent max_allowed_packet issues
for (let i=0; i<orders.length; i+=1000) {
  let chunk = orders.slice(i, i+1000);
  sql += `INSERT INTO orders (user_id, order_status, order_date, total_amount) VALUES ${chunk.join(', ')};\n`;
}

sql += 'SET FOREIGN_KEY_CHECKS = 1;\n';
sql += `SELECT '\'Database perfectly seeded with pure raw INSERTs!\'' as Status;\n`;

fs.writeFileSync('C:/Users/sumit/Downloads/Flux-ServerBased-main/Flux-ServerBased-main/Flux-ServerBased-main/shopping_demo_seed.sql', sql.replace(/\\'/g, "'"));
console.log('Done!');
