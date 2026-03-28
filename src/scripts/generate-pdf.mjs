// Script to generate the Fluxbase Integration Guide PDF
// Run with: node src/scripts/generate-pdf.mjs

import { jsPDF } from 'jspdf';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const publicDir = join(projectRoot, 'public');

if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
}

const doc = new jsPDF({ unit: 'pt', format: 'a4' });

try {

const W = doc.internal.pageSize.getWidth();
const MARGIN = 50;
const CONTENT_W = W - MARGIN * 2;

const PRIMARY = [255, 75, 41];
const DARK = [17, 17, 17];
const MUTED = [100, 100, 100];
const CODE_BG = [28, 28, 28];
const CODE_FG = [220, 220, 220];
const SUCCESS = [34, 197, 94];
const WARN = [251, 191, 36];

let y = 0;

function newPage() {
    doc.addPage();
    y = MARGIN;
}

function checkPageBreak(needed = 40) {
    if (y + needed > doc.internal.pageSize.getHeight() - MARGIN) {
        newPage();
        return true;
    }
    return false;
}

function addTitle(text) {
    checkPageBreak(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...DARK);
    doc.text(text, MARGIN, y);
    y += 8;
    doc.setFillColor(...PRIMARY);
    doc.rect(MARGIN, y, CONTENT_W, 2, 'F');
    y += 24;
}

function addH2(text) {
    checkPageBreak(55);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...PRIMARY);
    doc.text(text, MARGIN, y);
    y += 22; // Move line down to sit below text instead of striking through
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 14;
}

function addH3(text, color = DARK) {
    checkPageBreak(38);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...color);
    doc.text(text, MARGIN, y);
    y += 16;
}

function addText(text, size = 10) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    lines.forEach(line => {
        checkPageBreak(16);
        doc.text(line, MARGIN, y);
        y += 15;
    });
    y += 4;
}

function addBullet(text, indent = 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    const bx = MARGIN + indent;
    const bw = CONTENT_W - indent;
    const bullet = '›  ';
    const bW = doc.getTextWidth(bullet);
    const lines = doc.splitTextToSize(text, bw - bW - 4);
    lines.forEach((line, i) => {
        checkPageBreak(16);
        if (i === 0) doc.text(bullet, bx, y);
        doc.text(line, bx + bW + 2, y);
        y += 15;
    });
}

function addAlert(label, text, type = 'info') {
    const colors = { info: [59, 130, 246], warn: [251, 191, 36], danger: [239, 68, 68] };
    const col = colors[type] || colors.info;
    const lineH = 14;
    const lines = doc.splitTextToSize(text, CONTENT_W - 24);
    const total = lines.length * lineH + 20;
    checkPageBreak(total + 10);
    doc.setFillColor(col[0], col[1], col[2], 0.08);
    doc.setDrawColor(...col);
    doc.setLineWidth(1);
    doc.roundedRect(MARGIN, y, CONTENT_W, total, 4, 4, 'FD');
    doc.setFillColor(...col);
    doc.rect(MARGIN, y, 4, total, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...col);
    doc.text(label, MARGIN + 12, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    lines.forEach((line, i) => {
        doc.text(line, MARGIN + 12, y + 13 + (i + 1) * lineH);
    });
    y += total + 10;
}

function addCodeBlock(lines, lang = '') {
    const lineH = 13;
    const padV = 10;
    const total = lines.length * lineH + padV * 2 + (lang ? 18 : 0);
    checkPageBreak(total + 20);
    doc.setFillColor(...CODE_BG);
    doc.setDrawColor(55, 55, 55);
    doc.setLineWidth(0.5);
    doc.roundedRect(MARGIN, y, CONTENT_W, total, 4, 4, 'FD');
    if (lang) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(140, 140, 140);
        doc.text(lang.toUpperCase(), MARGIN + 10, y + 12);
        doc.setDrawColor(55, 55, 55);
        doc.line(MARGIN, y + 18, MARGIN + CONTENT_W, y + 18);
        y += 18;
    }
    y += padV + lineH * 0.8;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...CODE_FG);
    lines.forEach(line => {
        const parts = doc.splitTextToSize(line || ' ', CONTENT_W - 20);
        parts.forEach(part => {
            doc.text(part, MARGIN + 10, y);
            y += lineH;
        });
    });
    y += padV + 8;
}

function addResponseBox(json) {
    const lines = json.split('\n');
    addCodeBlock(lines, 'Response JSON');
}

// ─── COVER PAGE ─────────────────────────────────────────────────────────────
doc.setFillColor(17, 17, 17);
doc.rect(0, 0, W, doc.internal.pageSize.getHeight(), 'F');

doc.setFillColor(...PRIMARY);
doc.rect(0, 0, 6, doc.internal.pageSize.getHeight(), 'F');

// Gradient bar at top
doc.setFillColor(40, 40, 40);
doc.rect(0, 0, W, 180, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(48);
doc.setTextColor(255, 255, 255);
doc.text('Fluxbase', MARGIN, 120);

doc.setFont('helvetica', 'normal');
doc.setFontSize(22);
doc.setTextColor(...PRIMARY);
doc.text('Backend Integration Guide', MARGIN, 155);

doc.setFontSize(11);
doc.setTextColor(150, 150, 150);
doc.text('How to connect your backend to Fluxbase using the REST API', MARGIN, 210);

// Badges
const badges = ['Node.js', 'Python', 'Go', 'Java', 'Ruby', 'PHP', 'Rust', 'cURL'];
let bx = MARGIN;
badges.forEach(b => {
    doc.setFillColor(40, 40, 40);
    const bw = doc.getTextWidth(b) + 16;
    doc.roundedRect(bx, 240, bw, 18, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PRIMARY);
    doc.text(b, bx + 8, 253);
    bx += bw + 8;
});

doc.setFontSize(10);
doc.setTextColor(80, 80, 80);
doc.text(`v4.0  •  Enhanced edition  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`, MARGIN, doc.internal.pageSize.getHeight() - 60);
doc.text('© 2025 Fluxbase Inc. — For developer use only.', MARGIN, doc.internal.pageSize.getHeight() - 44);

// ─── PAGE 2: OVERVIEW ───────────────────────────────────────────────────────
newPage();
addTitle('Overview & Correct API Reference');
addText(
    'Fluxbase exposes a single SQL execution endpoint that allows any backend application to run queries ' +
    'against a Fluxbase-managed project database. Authentication uses a per-project API Key sent as a Bearer token.'
);

addAlert('IMPORTANT — Read Before Integrating',
    'The API endpoint is POST /api/execute-sql (NOT /v1/projects/.../query). ' +
    'The request body uses the field name "query" (NOT "sql"). ' +
    'The response rows are at data.result.rows (NOT data). ' +
    'Earlier documentation contained errors on all three points — this edition is the corrected reference.',
    'warn'
);

addH2('API Endpoint');
addCodeBlock([
    'Method:   POST',
    'URL:      https://fluxbase.vercel.app/api/execute-sql',
    'Auth:     Bearer <YOUR_API_KEY>',
    'Content:  application/json',
], 'HTTP');

addH2('Request Body');
addCodeBlock([
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "query":     "SELECT * FROM users LIMIT 10;"',
    '}',
], 'JSON');

addH3('Fields', DARK);
addBullet('"projectId" — Your project\'s unique ID (found in Dashboard → Settings). If your API key is already scoped to a project, this field can be omitted and will be auto-injected.');
addBullet('"query"     — The SQL statement to execute (SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, etc.).');

addH2('Response Shape');
addCodeBlock([
    '{',
    '  "success": true,',
    '  "result": {',
    '    "rows":    [ { "id": 1, "name": "Alice" }, ... ],',
    '    "columns": [ "id", "name" ],',
    '    "message": null',
    '  },',
    '  "explanation": [],',
    '  "executionInfo": {',
    '    "time": "12ms",',
    '    "rowCount": 1',
    '  }',
    '}',
], 'Success Response');

addH2('Error Response');
addCodeBlock([
    '{',
    '  "success": false,',
    '  "error": {',
    '    "message": "Project not found",',
    '    "code":    "NOT_FOUND"',
    '  }',
    '}',
], 'Error Response');

addH3('Error Codes', DARK);
addBullet('AUTH_REQUIRED (401)     — Missing or invalid API key.');
addBullet('SCOPE_MISMATCH (403)    — API key is scoped to a different project.');
addBullet('NOT_FOUND (404)         — Project does not exist or you lack access.');
addBullet('RATE_LIMIT_EXCEEDED (429) — 30 requests per 10 seconds per project exceeded.');
addBullet('BAD_REQUEST (400)       — Missing projectId or query field.');
addBullet('EXECUTION_ERROR (200)   — SQL syntax or runtime error (check body.error.message).');

// ─── NODE.JS ─────────────────────────────────────────────────────────────────
newPage();
addTitle('Node.js — native fetch (REST)');
addText('No external packages required. Uses built-in fetch (Node 18+).');
addCodeBlock([
    "const FLUXBASE_URL = 'https://fluxbase.vercel.app/api/execute-sql';",
    "const API_KEY      = process.env.FLUXBASE_API_KEY;",
    "const PROJECT_ID   = process.env.FLUXBASE_PROJECT_ID;",
    "",
    "async function runQuery(sql) {",
    "  const res = await fetch(FLUXBASE_URL, {",
    "    method: 'POST',",
    "    headers: {",
    "      'Content-Type': 'application/json',",
    "      'Authorization': `Bearer ${API_KEY}`",
    "    },",
    "    body: JSON.stringify({",
    "      projectId: PROJECT_ID,  // field name is 'query', NOT 'sql'",
    "      query:     sql",
    "    })",
    "  });",
    "",
    "  const json = await res.json();",
    "  if (!json.success) throw new Error(json.error.message);",
    "",
    "  // Rows are at json.result.rows — NOT json.data",
    "  return json.result.rows;",
    "}",
    "",
    "runQuery('SELECT * FROM users LIMIT 5').then(rows => {",
    "  console.log('Rows:', rows);",
    "}).catch(console.error);",
], 'JavaScript (Node.js)');

// ─── PYTHON ─────────────────────────────────────────────────────────────────
addH2('Python — requests');
addText('Install: pip install requests');
addCodeBlock([
    "import os, requests",
    "",
    "FLUXBASE_URL = 'https://fluxbase.vercel.app/api/execute-sql'",
    "API_KEY      = os.getenv('FLUXBASE_API_KEY')",
    "PROJECT_ID   = os.getenv('FLUXBASE_PROJECT_ID')",
    "",
    "def run_query(sql: str):",
    "    headers = {",
    "        'Authorization': f'Bearer {API_KEY}',",
    "        'Content-Type':  'application/json'",
    "    }",
    "    # Body uses field 'query' (NOT 'sql')",
    "    payload = {'projectId': PROJECT_ID, 'query': sql}",
    "    resp = requests.post(FLUXBASE_URL, json=payload, headers=headers)",
    "    data = resp.json()",
    "    if not data.get('success'):",
    "        raise Exception(data['error']['message'])",
    "    # Access via data['result']['rows']: (NOT data['data'])",
    "    return data['result']['rows']",
    "",
    "rows = run_query('SELECT * FROM users')",
    "print(rows)",
], 'Python');

// ─── GO ─────────────────────────────────────────────────────────────────────
newPage();
addTitle('Go — net/http (REST)');
addText('Uses Go\'s standard library only.');
addCodeBlock([
    'package main',
    '',
    'import (',
    '    "bytes"',
    '    "encoding/json"',
    '    "fmt"',
    '    "net/http"',
    '    "os"',
    ')',
    '',
    'func runQuery(sql string) ([]map[string]interface{}, error) {',
    '    body, _ := json.Marshal(map[string]string{',
    '        "projectId": os.Getenv("FLUXBASE_PROJECT_ID"),',
    '        "query":     sql,  // field is "query", not "sql"',
    '    })',
    '    req, _ := http.NewRequest("POST", "https://fluxbase.vercel.app/api/execute-sql",',
    '        bytes.NewBuffer(body))',
    '    req.Header.Set("Authorization", "Bearer "+os.Getenv("FLUXBASE_API_KEY"))',
    '    req.Header.Set("Content-Type", "application/json")',
    '',
    '    resp, err := http.DefaultClient.Do(req)',
    '    if err != nil { return nil, err }',
    '    defer resp.Body.Close()',
    '',
    '    var result struct {',
    '        Success bool `json:"success"`',
    '        Result  struct {',
    '            Rows []map[string]interface{} `json:"rows"`',
    '        } `json:"result"` // nested under "result", not "data"',
    '        Error struct{ Message string `json:"message"` } `json:"error"`',
    '    }',
    '    json.NewDecoder(resp.Body).Decode(&result)',
    '    if !result.Success { return nil, fmt.Errorf(result.Error.Message) }',
    '    return result.Result.Rows, nil',
    '}',
], 'Go');

// ─── JAVA ─────────────────────────────────────────────────────────────────────
addH2('Java — HttpURLConnection (REST)');
addText('Uses Java 11+ standard library. No Maven dependency required.');
addCodeBlock([
    'import java.net.URI; import java.net.http.*;',
    'import java.util.Map; import com.fasterxml.jackson.databind.ObjectMapper;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    'ObjectMapper mapper = new ObjectMapper();',
    '',
    '// Body: projectId + query (NOT "sql")',
    'String body = mapper.writeValueAsString(Map.of(',
    '    "projectId", System.getenv("FLUXBASE_PROJECT_ID"),',
    '    "query",     "SELECT * FROM users"',
    '));',
    '',
    'HttpRequest req = HttpRequest.newBuilder()',
    '    .uri(URI.create("https://fluxbase.vercel.app/api/execute-sql"))',
    '    .POST(HttpRequest.BodyPublishers.ofString(body))',
    '    .header("Content-Type", "application/json")',
    '    .header("Authorization", "Bearer " + System.getenv("FLUXBASE_API_KEY"))',
    '    .build();',
    '',
    'HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());',
    'Map<?,?> json = mapper.readValue(resp.body(), Map.class);',
    '// Rows: ((Map)json.get("result")).get("rows")',
    'System.out.println(((Map<?,?>)json.get("result")).get("rows"));',
], 'Java');

// ─── RUBY ─────────────────────────────────────────────────────────────────────
newPage();
addTitle('Ruby — net/http (REST)');
addText("Uses Ruby's standard library.");
addCodeBlock([
    "require 'uri', 'net/http', 'json'",
    "",
    "FLUXBASE_URL = URI('https://fluxbase.vercel.app/api/execute-sql')",
    "",
    "def run_query(sql)",
    "  http = Net::HTTP.new(FLUXBASE_URL.host, FLUXBASE_URL.port)",
    "  http.use_ssl = true",
    "  req = Net::HTTP::Post.new(FLUXBASE_URL)",
    "  req['Authorization'] = \"Bearer #{ENV['FLUXBASE_API_KEY']}\"",
    "  req['Content-Type']  = 'application/json'",
    "  # Body field is 'query', NOT 'sql'",
    "  req.body = JSON.dump({ projectId: ENV['FLUXBASE_PROJECT_ID'], query: sql })",
    "  body = JSON.parse(http.request(req).read_body)",
    "  raise body['error']['message'] unless body['success']",
    "  body['result']['rows']  # Access via result.rows, NOT data",
    "end",
    "",
    "p run_query('SELECT * FROM users')",
], 'Ruby');

// ─── PHP ─────────────────────────────────────────────────────────────────────
addH2('PHP — cURL (REST)');
addText('Uses cURL, which ships with PHP by default.');
addCodeBlock([
    "<?php",
    "\$url    = 'https://fluxbase.vercel.app/api/execute-sql';",
    "\$apiKey = getenv('FLUXBASE_API_KEY');",
    "\$projId = getenv('FLUXBASE_PROJECT_ID');",
    "",
    "// Body field is 'query' (NOT 'sql')",
    "\$payload = json_encode(['projectId' => \$projId, 'query' => 'SELECT * FROM users']);",
    "",
    "\$ch = curl_init(\$url);",
    "curl_setopt_array(\$ch, [",
    "    CURLOPT_RETURNTRANSFER => true,",
    "    CURLOPT_POST           => true,",
    "    CURLOPT_POSTFIELDS     => \$payload,",
    "    CURLOPT_HTTPHEADER     => [",
    "        'Content-Type: application/json',",
    "        'Authorization: Bearer ' . \$apiKey,",
    "    ],",
    "]);",
    "\$resp = json_decode(curl_exec(\$ch), true);",
    "curl_close(\$ch);",
    "",
    "if (!\$resp['success']) throw new Exception(\$resp['error']['message']);",
    "\$rows = \$resp['result']['rows']; // NOT \$resp['data']",
    "print_r(\$rows);",
], 'PHP');

// ─── RUST ─────────────────────────────────────────────────────────────────────
newPage();
addTitle('Rust — reqwest (REST)');
addText('Add to Cargo.toml: reqwest = { version = "0.12", features = ["json"] }  tokio = { version = "1", features = ["full"] }  serde_json = "1"');
addCodeBlock([
    'use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};',
    'use serde_json::{json, Value};',
    '',
    '#[tokio::main]',
    'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
    '    let api_key    = std::env::var("FLUXBASE_API_KEY")?;',
    '    let project_id = std::env::var("FLUXBASE_PROJECT_ID")?;',
    '',
    '    let client = reqwest::Client::new();',
    '    // Body uses "query" field, NOT "sql"',
    '    let body = json!({ "projectId": project_id, "query": "SELECT * FROM users" });',
    '',
    '    let resp: Value = client',
    '        .post("https://fluxbase.vercel.app/api/execute-sql")',
    '        .header(AUTHORIZATION, format!("Bearer {}", api_key))',
    '        .header(CONTENT_TYPE, "application/json")',
    '        .json(&body)',
    '        .send().await?',
    '        .json().await?;',
    '',
    '    if !resp["success"].as_bool().unwrap_or(false) {',
    '        eprintln!("Error: {}", resp["error"]["message"]);',
    '    } else {',
    '        // Rows are at resp["result"]["rows"] NOT resp["data"]',
    '        println!("{:#?}", resp["result"]["rows"]);',
    '    }',
    '    Ok(())',
    '}',
], 'Rust');

// ─── CURL ────────────────────────────────────────────────────────────────────
addH2('cURL — Shell / Terminal');
addText('Directly test your integration from any terminal.');
addCodeBlock([
    'curl -X POST "https://fluxbase.vercel.app/api/execute-sql" \\',
    '  -H "Authorization: Bearer $FLUXBASE_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{',
    '    "projectId": "YOUR_PROJECT_ID",',
    '    "query":     "SELECT * FROM users LIMIT 5"',
    '  }\'',
    '',
    '# Expected response structure:',
    '# { "success": true, "result": { "rows": [...], "columns": [...] } }',
], 'bash');

// ─── COMMON PATTERNS ─────────────────────────────────────────────────────────
newPage();
addTitle('Common SQL Examples');

addH2('Insert a Row');
addCodeBlock([
    '// Body to send:',
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "query": "INSERT INTO users (name, email) VALUES (\'Alice\', \'alice@example.com\')"',
    '}',
    '',
    '// Response: result.message will contain row count info',
], 'JSON');

addH2('Update a Row');
addCodeBlock([
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "query": "UPDATE users SET name = \'Bob\' WHERE id = 42"',
    '}',
], 'JSON');

addH2('Delete a Row');
addCodeBlock([
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "query": "DELETE FROM users WHERE id = 42"',
    '}',
], 'JSON');

addH2('Join Tables');
addCodeBlock([
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "query": "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"',
    '}',
], 'JSON');

addH2('Create a Table (DDL)');
addCodeBlock([
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "query": "CREATE TABLE products (id SERIAL PRIMARY KEY, name TEXT, price NUMERIC)"',
    '}',
], 'JSON');
addText('DDL statements (CREATE, ALTER, DROP) return { success: true, result: { message: "..." } } with no rows.');

addH2('Rate Limiting');
addBullet('Limit: 30 requests per 10 seconds per project per user.');
addBullet('When exceeded the API returns HTTP 429 with code RATE_LIMIT_EXCEEDED.');
addBullet('SELECT queries are cached server-side for 15 seconds — duplicate identical reads are free.');

y += 10;
addH2('Getting Your Credentials');
addBullet('Project ID   — Dashboard → Your Project → Settings → Project ID');
addBullet('API Key      — Dashboard → Your Project → Settings → API Keys → Create Key');
addBullet('Scope your API key to a single project for maximum security.');

y += 10;
addH2('Support');
addBullet('Web:   https://fluxbase.vercel.app/docs');
addBullet('Email: sumithsumith4567890@gmail.com');

// ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
newPage();
addTitle('Webhooks');
addText(
    'Webhooks let Fluxbase automatically notify your application whenever data changes in a table — ' +
    'a row is inserted, updated, or deleted. Fluxbase fires an outbound HTTP POST to your app\'s URL ' +
    'within ~1–2 seconds of the event, no persistent connection required.'
);

addAlert('Architecture — Outbound HTTP (No Extra Server Needed)',
    'Direction: Fluxbase (on Vercel) ─── POST ───→ Your App\n\n' +
    'Webhooks are OUTBOUND from Fluxbase. You do NOT need Render or any long-running server ' +
    'for webhooks. Fluxbase calls YOUR endpoint. Any publicly accessible URL works — ' +
    'Vercel, Railway, Render, AWS Lambda, Cloudflare Workers, etc.\n\n' +
    'NOTE: SSE/Realtime is different and DOES require a persistent server. ' +
    'Webhooks and Realtime are separate features with different infrastructure needs.',
    'info'
);

addH2('Webhook Payload');
addText('Every webhook event delivers this JSON body to your endpoint:');
addCodeBlock([
    '{',
    '  "event_type": "row.inserted",',
    '  "table_id":   "orders",',
    '  "timestamp":  "2026-03-27T19:00:00.000Z",',
    '  "data": {',
    '    "new": { "id": "abc123", "amount": 500, "status": "pending" },',
    '    "old": null',
    '  }',
    '}',
], 'Webhook Payload (JSON)');

addH3('Payload Fields', DARK);
addBullet('"event_type" — One of: row.inserted | row.updated | row.deleted');
addBullet('"table_id"   — The table name where the event occurred.');
addBullet('"timestamp"  — ISO-8601 UTC timestamp of the event.');
addBullet('"data.new"   — New row values (present on row.inserted and row.updated).');
addBullet('"data.old"   — Previous row values (present on row.updated and row.deleted).');

addH2('Step 1 — Create a Receiver Endpoint in Your App');
addText('Add any HTTP POST route to your application. Fluxbase will call this URL every time a relevant event fires.');

addH3('Next.js (App Router)', DARK);
addCodeBlock([
    '// app/api/fluxbase-webhook/route.ts',
    "import { NextRequest, NextResponse } from 'next/server';",
    '',
    'export async function POST(req: NextRequest) {',
    '  const { event_type, table_id, data } = await req.json();',
    '',
    "  if (table_id === 'matches' && event_type === 'row.inserted') {",
    '    await sendMatchNotification(data.new.user_b, data.new.id);',
    '  }',
    '',
    "  if (table_id === 'messages' && event_type === 'row.inserted') {",
    '    await broadcastToUser(data.new.recipient_id, data.new);',
    '  }',
    '',
    '  return NextResponse.json({ ok: true });',
    '}',
], 'TypeScript (Next.js)');

addH3('Node.js / Express', DARK);
addCodeBlock([
    "const express = require('express');",
    'const app = express();',
    'app.use(express.json());',
    '',
    "app.post('/fluxbase-webhook', (req, res) => {",
    '  const { event_type, table_id, data } = req.body;',
    "  if (event_type === 'row.inserted') console.log('New row in', table_id, data.new);",
    '  res.status(200).send("ok");',
    '});',
    'app.listen(3000);',
], 'JavaScript (Express)');

addH2('Step 2 — Register the Webhook in Fluxbase');
addText('Option A — Via the Dashboard: Settings → Webhooks → Add Webhook');
addBullet('Name:  A descriptive label (e.g. "New Order Listener")');
addBullet('URL:   The fully public URL (e.g. https://myapp.vercel.app/api/fluxbase-webhook)');
addBullet('Event: row.inserted | row.updated | row.deleted | * for all events');
addBullet('Table: A specific table name, or * to listen to all tables');

addText('Option B — Via the REST API:');
addCodeBlock([
    'POST /api/webhooks',
    'Authorization: Bearer YOUR_API_KEY',
    'Content-Type: application/json',
    '',
    '{',
    '  "projectId": "YOUR_PROJECT_ID",',
    '  "name":      "New Order Listener",',
    '  "url":       "https://myapp.vercel.app/api/fluxbase-webhook",',
    '  "event":     "row.inserted",',
    '  "table_id":  "orders",',
    '  "is_active": true',
    '}',
], 'HTTP');

addH2('Step 3 — Test Locally with ngrok');
addText(
    'Fluxbase can only POST to a public URL — localhost will not work. ' +
    'Use ngrok to expose your local server during development:'
);
addCodeBlock([
    '# Install ngrok once',
    'npm install -g ngrok',
    '',
    '# Start your local dev server',
    'npm run dev   # running on port 3000',
    '',
    '# In a 2nd terminal, open a tunnel',
    'ngrok http 3000',
    '',
    '# ngrok gives you a URL like:',
    '#   https://a1b2-103-123-456.ngrok-free.app',
    '',
    '# Register that URL in Fluxbase:',
    '#   https://a1b2-103-123-456.ngrok-free.app/api/fluxbase-webhook',
], 'bash');

addH2('Quick Test Without Code');
addText('Go to https://webhook.site, copy the unique URL it gives you, register it as your Fluxbase webhook, then insert a row via the Table Editor. The full JSON payload will appear on webhook.site instantly.');

addAlert('Security Tip',
    'Register a webhook Secret in Fluxbase. Your receiver endpoint can then verify the ' +
    'X-Fluxbase-Signature header using HMAC-SHA256 to confirm requests are genuinely from Fluxbase.',
    'warn'
);

// ─── STORAGE ─────────────────────────────────────────────────────────────────
newPage();
addTitle('Storage');
addText(
    'Fluxbase Storage allows you to upload, manage and serve files (images, PDFs, videos, CSVs) ' +
    'backed by AWS S3. All files are private by default — you use short-lived presigned URLs to serve them securely.'
);

addH2('Storage Workflow');
addCodeBlock([
    '1. Create a Bucket  —  a logical container for your files',
    '2. Upload a File    →  POST /api/storage/upload  (multipart/form-data)',
    '3. Save s3_key      —  store the returned s3_key in your own database table',
    '4. Serve the file   →  GET /api/storage/url?s3Key=...  →  15-min presigned URL',
    '5. Render           →  <img src={url} /> or trigger a download',
], 'Workflow');

addH2('Bucket Management');

addH3('List Buckets — GET /api/storage/buckets', DARK);
addCodeBlock([
    'GET  /api/storage/buckets?projectId=YOUR_PROJECT_ID',
    'Authorization: Bearer YOUR_API_KEY',
    '',
    '// Response',
    '{ "success": true, "buckets": [{ "id": "...", "name": "profile-pictures", "is_public": false }] }',
], 'HTTP');

addH3('Create a Bucket — POST /api/storage/buckets', DARK);
addCodeBlock([
    'POST /api/storage/buckets',
    'Authorization: Bearer YOUR_API_KEY',
    'Content-Type: application/json',
    '',
    '{ "projectId": "YOUR_PROJECT_ID", "name": "profile-pictures", "isPublic": false }',
    '',
    '// Name rules: lowercase, alphanumeric + hyphens/underscores, 1-63 characters',
    '// Response: { "success": true, "bucket": { "id": "...", "name": "..." } }',
], 'HTTP');

addH2('Uploading a File — POST /api/storage/upload');
addCodeBlock([
    'POST /api/storage/upload',
    'Authorization: Bearer YOUR_API_KEY',
    'Content-Type: multipart/form-data',
    '',
    'Form fields:',
    '  file      — the File object (from <input type="file">)',
    '  bucketId  — destination bucket ID or Bucket Name (e.g. "photos")',
    '  projectId — your project ID',
    '',
    '// Response',
    '{',
    '  "success": true,',
    '  "file": {',
    '    "id": "...", "name": "avatar.jpg",',
    '    "s3_key": "project_xxx/buckets/yyy/1711000000_avatar.jpg",',
    '    "size": 204800, "mime_type": "image/jpeg"',
    '  }',
    '}',
], 'HTTP');

addH3('JavaScript Example', DARK);
addCodeBlock([
    "const form = new FormData();",
    "form.append('file', document.getElementById('file-input').files[0]);",
    "form.append('bucketId', 'photos'); // Supports ID or Name",
    "form.append('projectId', 'YOUR_PROJECT_ID');",
    '',
    "const res = await fetch('https://your-fluxbase.app/api/storage/upload', {",
    "  method: 'POST',",
    "  headers: { 'Authorization': 'Bearer YOUR_API_KEY' },",
    "  body: form",
    "});",
    "const { file } = await res.json();",
    "// Store file.s3_key in your DB, then use it later to get a download URL",
], 'JavaScript');

addH2('Getting a Download URL — GET /api/storage/url');
addText('All files are private. Call this endpoint to get a 15-minute presigned URL to serve a file:');
addCodeBlock([
    'GET /api/storage/url?s3Key=YOUR_S3_KEY&projectId=YOUR_PROJECT_ID',
    'Authorization: Bearer YOUR_API_KEY',
    '',
    '// Response',
    '{ "success": true, "url": "https://s3.amazonaws.com/...", "expiresIn": 900 }',
], 'HTTP');

addH2('List Files — GET /api/storage/files');
addCodeBlock([
    'GET /api/storage/files?bucketId=YOUR_BUCKET_ID&projectId=YOUR_PROJECT_ID',
    'Authorization: Bearer YOUR_API_KEY',
    '',
    '// Response',
    '{ "success": true, "files": [{ "id", "name", "s3_key", "size", "mime_type", "created_at" }] }',
], 'HTTP');

addH2('Delete a File — DELETE /api/storage/files');
addCodeBlock([
    'DELETE /api/storage/files',
    'Authorization: Bearer YOUR_API_KEY',
    'Content-Type: application/json',
    '',
    '{ "fileId": "...", "s3Key": "...", "projectId": "YOUR_PROJECT_ID" }',
    '',
    '// Response: { "success": true }',
], 'HTTP');

addH2('Plan Limits & Supported File Types');
addBullet('Free: up to 50 MB per file  |  Pro: 500 MB per file  |  Max: 2 GB per file');
addBullet('Images: jpeg, png, gif, webp, svg');
addBullet('Documents: pdf, txt, csv, json');
addBullet('Video: mp4, webm  |  Audio: mp3, wav  |  Archives: zip');

// ─── REAL-TIME SSE ─────────────────────────────────────────────────────────────
newPage();
addTitle('Real-time (SSE) — @fluxbaseteam/fluxbase SDK');
addText(
    'Fluxbase provides native Server-Sent Events (SSE) for real-time database change notifications. ' +
    'The official SDK wraps the SSE connection with automatic reconnection, exponential backoff, ' +
    'online/offline detection, and Node.js compatibility.'
);

addAlert('Architecture — Two URLs Required',
    'Fluxbase requires two separate URLs:\n' +
    '  url         — Vercel deployment: handles all SQL/REST queries\n' +
    '  realtimeUrl — Render sidecar:    handles persistent SSE connections\n\n' +
    'The Render sidecar is required because Vercel serverless functions cannot hold ' +
    'persistent connections. Pass both URLs to createClient().',
    'warn'
);

addH2('Installation');
addCodeBlock([
    'npm install @fluxbaseteam/fluxbase',
], 'bash');

addH2('Initialize with Both URLs');
addCodeBlock([
    "import { createClient } from '@fluxbaseteam/fluxbase';",
    '',
    'const flux = createClient(',
    "  'https://your-app.vercel.app',",
    "  'your-project-id',",
    "  'fl_your-api-key',",
    '  {',
    "    realtimeUrl: 'https://fluxbase-realtime.onrender.com', // SSE → Render",
    '    debug: true,     // logs all events to console',
    '    timeout: 8000,',
    '    retries: 3,',
    '  }',
    ');',
], 'TypeScript');

addH2('Subscribe to Live Events');
addCodeBlock([
    "const channel = flux.channel('chat', 'messages')",
    '',
    "  .on('row.inserted', (payload) => {",
    '    const newRow = payload.data?.new;',
    "    console.log('New row:', newRow);",
    '  })',
    "  .on('row.updated', (p) => console.log('Updated:', p.data?.new))",
    "  .on('row.deleted', (p) => console.log('Deleted:', p.data?.old))",
    "  .on('*', (p) => console.log('Any event:', p.event_type))",
    '',
    '  // Lifecycle hooks',
    "  .onConnect(() => setStatus('connected'))",
    "  .onDisconnect(() => setStatus('disconnected'))",
    '  .onReconnect((attempt, delay) => {',
    "    console.log('Retry #' + attempt + ' in ' + delay + 'ms');",
    '  })',
    '',
    '  .subscribe();',
], 'TypeScript');

addH2('Pause, Resume and Unsubscribe');
addCodeBlock([
    'channel.pause();       // stop receiving (keeps subscription registered)',
    'channel.resume();      // reconnect after pause',
    'channel.unsubscribe(); // permanently close and clean up',
    "console.log(channel.state); // 'connected' | 'connecting' | 'disconnected' | 'paused'",
], 'TypeScript');

addH2('React Hook Pattern');
addCodeBlock([
    "import { useEffect } from 'react';",
    "import { createClient } from '@fluxbaseteam/fluxbase';",
    '',
    'const flux = createClient(',
    '  process.env.NEXT_PUBLIC_FLUXBASE_URL,',
    '  process.env.NEXT_PUBLIC_FLUXBASE_PROJECT_ID,',
    '  process.env.NEXT_PUBLIC_FLUXBASE_API_KEY,',
    '  { realtimeUrl: process.env.NEXT_PUBLIC_FLUXBASE_REALTIME_URL }',
    ');',
    '',
    'function ChatRoom() {',
    '  useEffect(() => {',
    "    const ch = flux.channel('chat', 'messages')",
    "      .on('row.inserted', (p) => setMessages(m => [...m, p.data?.new]))",
    '      .subscribe();',
    '    return () => ch.unsubscribe(); // cleanup on unmount',
    '  }, []);',
    '}',
], 'TypeScript (React)');

addH2('Required Environment Variables');
addCodeBlock([
    '# .env.local',
    'NEXT_PUBLIC_FLUXBASE_URL=https://your-app.vercel.app',
    'NEXT_PUBLIC_FLUXBASE_PROJECT_ID=your-project-id',
    'NEXT_PUBLIC_FLUXBASE_API_KEY=fl_your-api-key',
    'NEXT_PUBLIC_FLUXBASE_REALTIME_URL=https://fluxbase-realtime.onrender.com',
], '.env.local');

addH2('Raw EventSource (Without SDK)');
addText('For non-JS environments or advanced use only — the SDK handles reconnection automatically.');
addCodeBlock([
    "const url = new URL('https://fluxbase-realtime.onrender.com/api/realtime/subscribe');",
    "url.searchParams.set('projectId', 'YOUR_PROJECT_ID');",
    "url.searchParams.set('apiKey', 'fl_YOUR_API_KEY');",
    '',
    'const source = new EventSource(url.toString());',
    "source.onopen = () => console.log('SSE connected');",
    'source.onmessage = (event) => {',
    '  const payload = JSON.parse(event.data);',
    "  if (payload.type === 'connected') return; // ignore heartbeat",
    '  console.log(payload.event_type, payload.data?.new);',
    '};',
    'source.onerror = () => console.warn("Connection lost — browser will auto-retry");',
], 'JavaScript (Raw SSE)');

addAlert('SDK Advantage',
    'The @fluxbaseteam/fluxbase SDK adds: exponential backoff reconnect (1s→2s→4s→max 30s), ' +
    'auto-pause/resume on browser offline/online events, Node.js compatibility via EventSource ponyfill, ' +
    'and typed error codes. Use the SDK in production apps.',
    'info'
);

// ─── ERROR CODES ─────────────────────────────────────────────────────────────────
newPage();
addTitle('Structured Error Codes');
addText(
    'Fluxbase APIs and the @fluxbaseteam/fluxbase SDK return standardized error objects ' +
    'so your app can handle failures programmatically. Import ERROR_CODES for type-safe matching.'
);

addH2('SDK Error Handling');
addCodeBlock([
    "import { createClient, ERROR_CODES } from '@fluxbaseteam/fluxbase';",
    '',
    'const flux = createClient(url, projectId, apiKey, { realtimeUrl });',
    '',
    '// Global auth error handler',
    'flux.onAuthError((err) => {',
    "  if (err.code === ERROR_CODES.UNAUTHORIZED) router.push('/login');",
    '});',
    '',
    '// Per-query error handling',
    "const { data, error, success } = await flux.from('users').select('*');",
    'if (!success) {',
    '  switch (error.code) {',
    '    case ERROR_CODES.TIMEOUT:',
    "      showToast('Request timed out — check your connection.');",
    '      break;',
    '    case ERROR_CODES.CORS_ERROR:',
    "      console.error('CORS: Add Authorization to Access-Control-Allow-Headers');",
    '      break;',
    '    case ERROR_CODES.RATE_LIMIT_EXCEEDED:',
    "      showToast('Too many requests — slow down.');",
    '      break;',
    '    default:',
    '      console.error(error.message, error.hint);',
    '  }',
    '}',
], 'TypeScript');

addH2('All Error Codes');
addBullet('AUTH_REQUIRED (401)      — Missing or invalid API key.');
addBullet('UNAUTHORIZED (401)       — API key is expired or revoked.');
addBullet('SCOPE_MISMATCH (403)     — API key scoped to a different project.');
addBullet('TOKEN_EXPIRED            — Session token has expired.');
addBullet('BAD_REQUEST (400)        — Missing projectId or query field.');
addBullet('PROJECT_NOT_FOUND (404)  — Project does not exist.');
addBullet('TABLE_NOT_FOUND (404)    — Table referenced in query does not exist.');
addBullet('SQL_EXECUTION_ERROR      — SQL syntax or runtime error. Check error.message.');
addBullet('RATE_LIMIT_EXCEEDED (429)— 30 requests / 10 seconds per project exceeded.');
addBullet('NETWORK_ERROR            — Could not reach the server (connection issue).');
addBullet('TIMEOUT                  — Request exceeded the configured timeout ms.');
addBullet('CORS_ERROR               — Cross-origin request blocked. Check CORS headers.');
addBullet('ABORTED                  — Request cancelled via AbortController.abort().');
addBullet('REALTIME_CONNECTION_FAILED — SSE connection could not be established.');
addBullet('INTERNAL_ERROR (500)     — Server-side error. Check Render/Vercel logs.');

doc.setFontSize(9);
doc.setTextColor(70, 70, 70);
doc.text('© 2025 Fluxbase Inc. All rights reserved.  —  v4.0 Enhanced edition', MARGIN, doc.internal.pageSize.getHeight() - 30);

// ─── WRITE FILE ──────────────────────────────────────────────────────────────
const pdfBytes = doc.output('arraybuffer');
writeFileSync(join(publicDir, 'fluxbase-integration-guide.pdf'), Buffer.from(pdfBytes));
console.log('✅  PDF written to public/fluxbase-integration-guide.pdf');

} catch (error) {
    console.error('FATAL ERROR DURING PDF GENERATION:');
    console.error(error);
    process.exit(1);
}
