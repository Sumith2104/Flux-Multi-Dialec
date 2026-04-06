require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// --- Config from .env ---
const FLUX_URL = process.env.FLUXBASE_URL || 'http://localhost:3000';
const API_KEY = process.env.FLUXBASE_API_KEY;
const PROJECT_ID = process.env.FLUXBASE_PROJECT_ID;
const WH_SECRET = process.env.WEBHOOK_SECRET || '';
const TABLE = process.env.FLUXBASE_TABLE || 'messages';

if (!API_KEY || !PROJECT_ID) {
    console.warn('⚠️  FLUXBASE_API_KEY or FLUXBASE_PROJECT_ID is missing from .env – chat writing will fail.');
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/config  →  safe public config for the browser
app.get('/api/config', (req, res) => {
    res.json({
        fluxUrl: FLUX_URL,
        projectId: PROJECT_ID,
        apiKey: API_KEY,        // exposed intentionally — test app only
        table: TABLE,
    });
});

// ------------------------------------------------------------------
// POST /api/send  →  proxy message INSERT to Fluxbase
// ------------------------------------------------------------------
app.post('/api/send', async (req, res) => {
    try {
        const { content, username, color } = req.body;
        if (!content?.trim() || !username?.trim()) {
            return res.status(400).json({ error: 'content and username are required' });
        }

        const query = `INSERT INTO ${TABLE} (username, content, color, created_at) VALUES ('${username.replace(/'/g, "''")}', '${content.replace(/'/g, "''")}', '${(color || '#a78bfa').replace(/'/g, "''")}', NOW())`;

        const response = await fetch(`${FLUX_URL}/api/execute-sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({ projectId: PROJECT_ID, query }),
        });

        const data = await response.json();
        if (!data.success) {
            return res.status(500).json({ error: data.error?.message || 'Fluxbase error' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Send Error]', err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------------------------------
// GET /api/history  →  fetch last 50 messages from Fluxbase
// ------------------------------------------------------------------
app.get('/api/history', async (req, res) => {
    try {
        const response = await fetch(`${FLUX_URL}/api/execute-sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                projectId: PROJECT_ID,
                query: `SELECT * FROM ${TABLE} ORDER BY created_at DESC LIMIT 50`,
            }),
        });
        const data = await response.json();
        if (!data.success) return res.status(500).json({ error: data.error?.message });
        res.json({ messages: (data.result?.rows || []).reverse() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------------------------------------------
// POST /webhook  →  receive and verify Fluxbase webhook
// ------------------------------------------------------------------
app.post('/webhook', (req, res) => {
    const sig = req.headers['x-fluxbase-signature'];
    const event = req.headers['x-fluxbase-event'] || req.body?.event_type;
    const payload = JSON.stringify(req.body);

    let verified = false;
    if (WH_SECRET && sig) {
        const expected = crypto.createHmac('sha256', WH_SECRET).update(payload).digest('hex');
        verified = sig === expected;
    }

    console.log(`\n📥 WEBHOOK [${new Date().toLocaleTimeString()}]`);
    console.log(`   Event   : ${event}`);
    console.log(`   Table   : ${req.body?.table_id || req.body?.tableName || '?'}`);
    console.log(`   Payload : ${payload.substring(0, 200)}`);
    console.log(`   Verified: ${WH_SECRET ? (verified ? '✅ YES' : '❌ MISMATCH') : '⚠️  No secret set'}`);

    res.status(200).json({ received: true });
});

// ------------------------------------------------------------------
// SSE proxy  →  forward Fluxbase SSE to browser (if needed locally)
// ------------------------------------------------------------------
app.get('/api/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        const upstream = await fetch(`${FLUX_URL}/api/realtime/subscribe?projectId=${PROJECT_ID}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}` },
        });
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        req.on('close', () => reader.cancel());

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            res.write(chunk);
        }
    } catch (err) {
        send({ error: err.message });
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 FluxChat Test App running at http://localhost:${PORT}`);
    console.log(`   Fluxbase : ${FLUX_URL}`);
    console.log(`   Project  : ${PROJECT_ID || 'NOT SET'}`);
    console.log(`   Table    : ${TABLE}`);
    console.log(`   Webhook  : http://localhost:${PORT}/webhook`);
    console.log(`\nTip: use 'npx localtunnel --port ${PORT}' to expose for Fluxbase webhook delivery.\n`);
});
