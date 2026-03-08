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
    doc.setFillColor(...PRIMARY);
    doc.rect(MARGIN, y, CONTENT_W, 2, 'F');
    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...DARK);
    doc.text(text, MARGIN, y);
    y += 34;
}

function addH2(text) {
    checkPageBreak(55);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...PRIMARY);
    doc.text(text, MARGIN, y);
    y += 5;
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 16;
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
doc.text(`v2.0  •  corrected edition  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`, MARGIN, doc.internal.pageSize.getHeight() - 60);
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

doc.setFontSize(9);
doc.setTextColor(70, 70, 70);
doc.text('© 2025 Fluxbase Inc. All rights reserved.  —  v2.0 corrected edition', MARGIN, doc.internal.pageSize.getHeight() - 30);

// ─── WRITE FILE ──────────────────────────────────────────────────────────────
const pdfBytes = doc.output('arraybuffer');
writeFileSync(join(publicDir, 'fluxbase-integration-guide.pdf'), Buffer.from(pdfBytes));
console.log('✅  PDF written to public/fluxbase-integration-guide.pdf');
