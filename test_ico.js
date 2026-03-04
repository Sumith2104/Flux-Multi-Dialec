const fs = require('fs');
const buf = fs.readFileSync('src/app/favicon.ico');

console.log('Size:', buf.length);
console.log('Head (hex):', buf.toString('hex').substring(0, 32));
console.log('Head (txt):', buf.toString('utf8').substring(0, 50));
