const http = require('http');

const data = JSON.stringify({
    projectId: "p_someId",  // Provide a dummy or specific project ID
    query: "UPDATE plans SET price = 1000 WHERE plan_name = 'test'"
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/execute-sql',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer test'
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Response:', body));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
