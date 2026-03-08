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

const PRIMARY = [255, 75, 41];   // #FF4B29
const DARK = [17, 17, 17];    // #111111
const MUTED = [120, 120, 120];
const CODE_BG = [30, 30, 30];
const CODE_FG = [220, 220, 220];

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
    doc.setFontSize(28);
    doc.setTextColor(...DARK);
    doc.text(text, MARGIN, y);
    y += 36;
}

function addH2(text) {
    checkPageBreak(55);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...PRIMARY);
    doc.text(text, MARGIN, y);
    y += 6;
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 16;
}

function addH3(text) {
    checkPageBreak(40);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...DARK);
    doc.text(text, MARGIN, y);
    y += 18;
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

function addBullet(text) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    const bullet = '•  ';
    const bulletW = doc.getTextWidth(bullet);
    const lines = doc.splitTextToSize(text, CONTENT_W - bulletW - 4);
    lines.forEach((line, i) => {
        checkPageBreak(16);
        if (i === 0) doc.text(bullet, MARGIN, y);
        doc.text(line, MARGIN + bulletW + 2, y);
        y += 15;
    });
}

function addCodeBlock(lines) {
    const lineH = 14;
    const padV = 10;
    const total = lines.length * lineH + padV * 2;
    checkPageBreak(total + 20);
    doc.setFillColor(...CODE_BG);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.5);
    doc.roundedRect(MARGIN, y, CONTENT_W, total, 4, 4, 'FD');
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
    y += padV;
    y += 10;
}

// ─── COVER PAGE ─────────────────────────────────────────────────────────────
doc.setFillColor(17, 17, 17);
doc.rect(0, 0, W, doc.internal.pageSize.getHeight(), 'F');

// Accent bar
doc.setFillColor(...PRIMARY);
doc.rect(0, 0, 8, doc.internal.pageSize.getHeight(), 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(40);
doc.setTextColor(255, 255, 255);
doc.text('Fluxbase', MARGIN, 200);

doc.setFont('helvetica', 'normal');
doc.setFontSize(20);
doc.setTextColor(...PRIMARY);
doc.text('Integration Guide', MARGIN, 240);

doc.setFontSize(12);
doc.setTextColor(160, 160, 160);
doc.text('How to connect your backend applications to Fluxbase', MARGIN, 280);
doc.text('REST API  •  MySQL Connection  •  All Major Languages', MARGIN, 300);

doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, doc.internal.pageSize.getHeight() - 60);
doc.text('© 2025 Fluxbase Inc. All rights reserved.', MARGIN, doc.internal.pageSize.getHeight() - 44);

// ─── PAGE 2: OVERVIEW ───────────────────────────────────────────────────────
newPage();
addTitle('Connecting to Fluxbase');
addText(
    'Fluxbase provides two primary integration methods: REST HTTP API and direct MySQL connections. ' +
    'No proprietary SDK is required — use standard HTTP libraries or native MySQL drivers in your preferred language.'
);

addH2('Prerequisites');
addBullet('An active Fluxbase account and at least one project.');
addBullet('Your Project ID (found in Dashboard → Settings).');
addBullet('An API Bearer Token for REST access, or DB credentials for MySQL access.');
y += 10;

addH2('Authentication');
addH3('REST API — Bearer Token');
addText('Include your API token in every HTTP request header:');
addCodeBlock([
    'Authorization: Bearer YOUR_FLUXBASE_SECRET_KEY',
    'Content-Type: application/json',
]);
addH3('MySQL — Connection String');
addText('Use standard MySQL credentials provided in your project dashboard:');
addCodeBlock([
    'Host:     db.fluxbase.io',
    'Port:     3306',
    'Database: project_<ID>_schema',
    'User:     project_<ID>_admin',
    'Password: <your_secret_token>',
]);

// ─── Node.js ────────────────────────────────────────────────────────────────
newPage();
addTitle('Node.js — REST API');
addText('Uses native fetch (Node 18+). No external packages needed.');
addCodeBlock([
    "// Execute an SQL query using Node.js native fetch",
    "async function fetchUsers() {",
    "  const response = await fetch(",
    "    'https://api.fluxbase.io/v1/projects/YOUR_PROJECT_ID/query',",
    "    {",
    "      method: 'POST',",
    "      headers: {",
    "        'Content-Type': 'application/json',",
    "        'Authorization': `Bearer ${process.env.FLUXBASE_SECRET_KEY}`",
    "      },",
    "      body: JSON.stringify({ sql: 'SELECT * FROM users LIMIT 10;' })",
    "    }",
    "  );",
    "  if (!response.ok) throw new Error(`HTTP error! ${response.status}`);",
    "  const { data } = await response.json();",
    "  return data;",
    "}",
    "",
    "fetchUsers().then(console.log);",
]);

// ─── Python ─────────────────────────────────────────────────────────────────
addH2('Python — REST API');
addText('Uses the popular `requests` library. Install with: pip install requests');
addCodeBlock([
    "import os, requests",
    "",
    "FLUXBASE_API = 'https://api.fluxbase.io/v1/projects/YOUR_PROJECT_ID/query'",
    "API_KEY = os.getenv('FLUXBASE_SECRET_KEY')",
    "",
    "def get_users():",
    "    headers = {",
    "        'Authorization': f'Bearer {API_KEY}',",
    "        'Content-Type': 'application/json'",
    "    }",
    "    resp = requests.post(FLUXBASE_API, json={'sql': 'SELECT * FROM users'}, headers=headers)",
    "    if resp.status_code == 200:",
    "        return resp.json().get('data', [])",
    "    print('Error:', resp.text)",
    "",
    "print(get_users())",
]);

// ─── Go ─────────────────────────────────────────────────────────────────────
newPage();
addTitle('Go — MySQL Driver');
addText('Uses go-sql-driver/mysql. Install: go get github.com/go-sql-driver/mysql');
addCodeBlock([
    'import (',
    '    "database/sql"',
    '    "fmt"',
    '    _ "github.com/go-sql-driver/mysql"',
    ')',
    '',
    'func main() {',
    '    dsn := "project_ID_admin:token@tcp(db.fluxbase.io:3306)/project_ID_schema"',
    '    db, err := sql.Open("mysql", dsn)',
    '    if err != nil { panic(err) }',
    '    defer db.Close()',
    '',
    '    rows, _ := db.Query("SELECT id, name FROM users")',
    '    for rows.Next() {',
    '        var id int; var name string',
    '        rows.Scan(&id, &name)',
    '        fmt.Printf("User: %d - %s\\n", id, name)',
    '    }',
    '}',
]);

// ─── Java ────────────────────────────────────────────────────────────────────
addH2('Java — JDBC MySQL');
addText('Add mysql-connector-java to your Maven/Gradle project, then use standard JDBC:');
addCodeBlock([
    'import java.sql.*;',
    '',
    'public class FluxbaseExample {',
    '    public static void main(String[] args) throws Exception {',
    '        Connection con = DriverManager.getConnection(',
    '            "jdbc:mysql://db.fluxbase.io:3306/project_ID_schema",',
    '            "project_ID_admin", "your_secret_token"',
    '        );',
    '        Statement stmt = con.createStatement();',
    '        ResultSet rs = stmt.executeQuery("SELECT * FROM users");',
    '        while (rs.next())',
    '            System.out.println("ID: " + rs.getInt(1) + " Name: " + rs.getString(2));',
    '        con.close();',
    '    }',
    '}',
]);

// ─── Ruby ────────────────────────────────────────────────────────────────────
newPage();
addTitle('Ruby — REST API');
addText('Uses Ruby\'s standard net/http library. No gems required.');
addCodeBlock([
    "require 'uri', 'net/http', 'json'",
    "",
    "url = URI('https://api.fluxbase.io/v1/projects/YOUR_PROJECT_ID/query')",
    "https = Net::HTTP.new(url.host, url.port)",
    "https.use_ssl = true",
    "",
    "req = Net::HTTP::Post.new(url)",
    "req['Authorization'] = 'Bearer your_secret_token'",
    "req['Content-Type'] = 'application/json'",
    "req.body = JSON.dump({ sql: 'SELECT * FROM users' })",
    "",
    "puts https.request(req).read_body",
]);

// ─── PHP ─────────────────────────────────────────────────────────────────────
addH2('PHP — PDO MySQL');
addText('PHP\'s native PDO extension supports MySQL directly. No Composer package needed.');
addCodeBlock([
    "<?php",
    "\$dsn = 'mysql:host=db.fluxbase.io;dbname=project_ID_schema;charset=utf8mb4';",
    "\$pdo = new PDO(\$dsn, 'project_ID_admin', 'your_secret_token', [",
    "    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,",
    "    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,",
    "]);",
    "",
    "\$stmt = \$pdo->query('SELECT * FROM users');",
    "while (\$row = \$stmt->fetch())",
    "    echo \$row['name'] . PHP_EOL;",
]);

// ─── Rust ────────────────────────────────────────────────────────────────────
newPage();
addTitle('Rust — sqlx (MySQL)');
addText('Add sqlx to Cargo.toml: sqlx = { version = "0.7", features = ["mysql", "runtime-tokio-rustls"] }');
addCodeBlock([
    'use sqlx::mysql::MySqlPoolOptions;',
    '',
    '#[tokio::main]',
    'async fn main() -> Result<(), sqlx::Error> {',
    '    let pool = MySqlPoolOptions::new()',
    '        .max_connections(5)',
    '        .connect("mysql://project_ID_admin:token@db.fluxbase.io/project_ID_schema")',
    '        .await?;',
    '',
    '    let rows: Vec<(i32, String)> = sqlx::query_as("SELECT id, name FROM users")',
    '        .fetch_all(&pool).await?;',
    '',
    '    for row in rows { println!("{} - {}", row.0, row.1); }',
    '    Ok(())',
    '}',
]);

// ─── cURL ───────────────────────────────────────────────────────────────────
addH2('cURL — Terminal / Shell');
addText('Test your connection directly from any terminal. No dependencies required.');
addCodeBlock([
    'curl -X POST "https://api.fluxbase.io/v1/projects/YOUR_PROJECT_ID/query" \\',
    '  -H "Authorization: Bearer your_secret_token" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"sql": "SELECT * FROM users"}\'',
]);

// ─── FINAL PAGE ─────────────────────────────────────────────────────────────
newPage();
addH2('Common Query Patterns');
addH3('Insert a Row');
addCodeBlock([
    "INSERT INTO users (name, email, created_at)",
    "VALUES ('John Doe', 'john@example.com', NOW());",
]);
addH3('Update a Row');
addCodeBlock([
    "UPDATE users SET name = 'Jane' WHERE id = 42;",
]);
addH3('Delete a Row');
addCodeBlock([
    "DELETE FROM users WHERE id = 42;",
]);
addH3('Join Tables');
addCodeBlock([
    "SELECT u.name, o.total",
    "FROM users u",
    "JOIN orders o ON u.id = o.user_id",
    "WHERE o.total > 100;",
]);

y += 10;
addH2('Support & Resources');
addBullet('Dashboard: https://fluxbase.io/dashboard');
addBullet('Documentation: https://fluxbase.io/docs');
addBullet('Email: sumithsumith4567890@gmail.com');
y += 10;
addText('© 2025 Fluxbase Inc. All rights reserved. This document is provided for developer use only.');

// ─── WRITE FILE ─────────────────────────────────────────────────────────────
const pdfBytes = doc.output('arraybuffer');
writeFileSync(join(publicDir, 'fluxbase-integration-guide.pdf'), Buffer.from(pdfBytes));
console.log('✅ PDF written to public/fluxbase-integration-guide.pdf');
