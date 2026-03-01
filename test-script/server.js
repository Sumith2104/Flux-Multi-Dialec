const express = require('express');
const app = express();
app.use(express.json());
app.post('/webhook', (req, res) => {
  console.log('--- WEBHOOK RECEIVED ---');
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).send('OK');
});
app.listen(9000, () => console.log('Test Webhook Receiver running on http://localhost:9000/webhook'));
