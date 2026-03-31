import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, ExternalLink } from 'lucide-react';

export default function settingsDocsPage() {
    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex flex-col gap-4">
                <h2 className="text-2xl font-bold tracking-tight">Fluxbase Documentation</h2>
                <p className="text-muted-foreground italic text-sm">
                    This is a copy of the official documentation for quick reference within your settings.
                </p>
                <div className="flex gap-4">
                    <a
                        href="/fluxbase-integration-guide.pdf"
                        download="Fluxbase-Integration-Guide.pdf"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors w-fit"
                    >
                        <Download className="h-4 w-4" />
                        Download PDF Guide
                    </a>
                    <a
                        href="/docs"
                        target="_blank"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors w-fit"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Open Full Screen
                    </a>
                </div>
            </div>

            <div className="space-y-12">
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold border-b pb-2">1. Essential Requirements</h2>
                    <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Fluxbase Project:</strong> You must have an active project initialized safely in your dashboard.</li>
                        <li><strong className="text-foreground">Database Credentials:</strong> Obtain your project database URL and safe credentials from your dashboard settings.</li>
                        <li><strong className="text-foreground">REST API Token:</strong> Required for both SQL execution and Storage/Webhook management.</li>
                    </ul>
                </section>

                <section className="space-y-6">
                    <h2 className="text-xl font-semibold border-b pb-2">2. Universal Language Setup</h2>
                    <p className="text-sm text-muted-foreground">Interact with Fluxbase entirely via standard HTTP networking or official MySQL drivers.</p>

                    <Tabs defaultValue="nodejs" className="w-full mt-4">
                        <TabsList className="mb-4 flex flex-wrap h-auto gap-2 bg-muted/50 justify-start p-1 rounded-lg">
                            <TabsTrigger value="nodejs">Node.js (REST)</TabsTrigger>
                            <TabsTrigger value="python">Python (REST)</TabsTrigger>
                            <TabsTrigger value="go">Go (MySQL)</TabsTrigger>
                            <TabsTrigger value="java">Java (MySQL)</TabsTrigger>
                            <TabsTrigger value="ruby">Ruby (REST)</TabsTrigger>
                            <TabsTrigger value="php">PHP (MySQL)</TabsTrigger>
                            <TabsTrigger value="rust">Rust (MySQL)</TabsTrigger>
                            <TabsTrigger value="curl">cURL</TabsTrigger>
                        </TabsList>

                        <div className="mt-4">
                            <TabsContent value="nodejs">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`// Execute an SQL query over native Node.js fetch
async function fetchUsers() {
  try {
    const response = await fetch('https://api.fluxbase.io/api/execute-sql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${process.env.FLUXBASE_SECRET_KEY}\`
      },
      body: JSON.stringify({
        projectId: 'YOUR_PROJECT_ID',
        query: 'SELECT * FROM users LIMIT 10;'
      })
    });

    const data = await response.json();
    
    if (!data.success) {
       throw new Error(data.error?.message || 'Query failed');
    }

    // Access nested rows payload
    return data.result.rows;
  } catch (err) {
    console.error("Database query failed:", err);
  }
}

fetchUsers().then(console.log);`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="python">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`import os
import requests

FLUXBASE_API = "https://api.fluxbase.io/api/execute-sql"
API_KEY = os.getenv("FLUXBASE_SECRET_KEY")

def get_users():
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "projectId": "YOUR_PROJECT_ID",
        "query": "SELECT * FROM users ORDER BY created_at DESC"
    }
    
    response = requests.post(FLUXBASE_API, json=payload, headers=headers)
    data = response.json()
    
    if data.get("success"):
        return data["result"]["rows"]
    else:
        print(f"Query Failed: {data.get('error', {}).get('message')}")
        return None

users = get_users()
print(users)`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="go">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`import (
    "database/sql"
    "fmt"
    _ "github.com/go-sql-driver/mysql"
)

func main() {
    // Standard MySQL connection string without extra packages
    dsn := "project_123_admin:your_super_secret_token@tcp(db.fluxbase.io:3306)/project_123_schema"
    
    db, err := sql.Open("mysql", dsn)
    if err != nil {
        panic(err.Error())
    }
    defer db.Close()

    results, err := db.Query("SELECT id, name FROM users")
    if err != nil {
        panic(err.Error())
    }

    for results.Next() {
        var id int
        var name string
        results.Scan(&id, &name)
        fmt.Printf("User: %d - %s\\n", id, name)
    }
}`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="java">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class FluxbaseExample {
    public static void main(String[] args) {
        try {
            // Provide raw standard MySQL Connection String
            Connection con = DriverManager.getConnection(
                "jdbc:mysql://db.fluxbase.io:3306/project_123_schema", 
                "project_123_admin", 
                "your_super_secret_token"
            );

            Statement stmt = con.createStatement();
            ResultSet rs = stmt.executeQuery("SELECT * FROM users");
            
            while(rs.next()) {
                System.out.println("ID: " + rs.getInt(1) + " Name: " + rs.getString(2));
            }
            con.close();
        } catch(Exception e) {
            System.out.println(e);
        }
    }
}`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="ruby">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`require 'uri'
require 'net/http'
require 'json'

url = URI("https://api.fluxbase.io/api/execute-sql")

https = Net::HTTP.new(url.host, url.port)
https.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = "Bearer your_super_secret_token"
request["Content-Type"] = "application/json"
request.body = JSON.dump({
  "projectId": "YOUR_PROJECT_ID",
  "query": "SELECT * FROM users"
})

response = https.request(request)
puts response.read_body`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="php">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`$dsn = 'mysql:host=db.fluxbase.io;dbname=project_123_schema;charset=utf8mb4';
$user = 'project_123_admin';
$password = 'your_super_secret_token';

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
];

try {
    $pdo = new PDO($dsn, $user, $password, $options);
    $stmt = $pdo->query('SELECT * FROM users');
    
    while ($row = $stmt->fetch()) {
        echo $row['name'] . "\\n";
    }
} catch (PDOException $e) {
    echo 'Connection failed: ' . $e->getMessage();
}`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="rust">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`use sqlx::mysql::MySqlPoolOptions;

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .connect("mysql://project_123_admin:your_super_secret_token@db.fluxbase.io/project_123_schema")
        .await?;

    let rows: Vec<(i32, String)> = sqlx::query_as("SELECT id, name FROM users")
        .fetch_all(&pool)
        .await?;
        
    for row in rows {
        println!("User: {} - {}", row.0, row.1);
    }

    Ok(())
}`}</code>
                                </pre>
                            </TabsContent>

                            <TabsContent value="curl">
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                                    <code>{`# You can test your queries directly in your terminal using cURL
curl -X POST "https://api.fluxbase.io/api/execute-sql" \\
  -H "Authorization: Bearer your_super_secret_token" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId": "YOUR_PROJECT_ID", "query": "SELECT * FROM users"}'`}</code>
                                </pre>
                            </TabsContent>
                        </div>
                    </Tabs>
                </section>

                <section className="space-y-6">
                    <h2 className="text-xl font-semibold border-b pb-2">3. Webhooks & Storage</h2>
                    <p className="text-sm text-muted-foreground">
                        Fluxbase provides advanced services for handling real-time data events and file management.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-card border p-4 rounded-xl space-y-2">
                            <h3 className="font-semibold text-base">Webhooks</h3>
                            <p className="text-xs text-muted-foreground">Receive real-time POST notifications when rows are inserted, updated, or deleted.</p>
                        </div>
                        <div className="bg-card border p-4 rounded-xl space-y-2">
                            <h3 className="font-semibold text-base">Storage</h3>
                            <p className="text-xs text-muted-foreground">Securely upload and serve files with built-in S3 integration. <strong>Pro Tip:</strong> You can use bucket <code>id</code> or <code>name</code>.</p>
                        </div>
                    </div>
                </section>

                <section className="space-y-6">
                    <h2 className="text-xl font-semibold border-b pb-2">4. Real-time (WebSockets) <span className="ml-2 text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">Recommended</span></h2>
                    <p className="text-sm text-muted-foreground">
                        Subscribe to live database changes using the persistent <strong>WebSocket server</strong>. This connection stays warm 24/7, eliminating cold-start delays. Authenticate using your <strong>API Key</strong> as a URL query parameter.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-card border p-4 rounded-xl space-y-2">
                            <h3 className="font-semibold text-sm">Connection URL</h3>
                            <pre className="bg-muted/50 p-2 rounded text-xs font-mono break-all">{`wss://YOUR_WS_HOST:4000?token=YOUR_API_KEY`}</pre>
                        </div>
                        <div className="bg-card border p-4 rounded-xl space-y-2">
                            <h3 className="font-semibold text-sm">Event Types</h3>
                            <ul className="text-xs text-muted-foreground space-y-1">
                                <li><code className="text-primary">subscribed</code> — confirmed subscription</li>
                                <li><code className="text-primary">update</code> — row INSERT/UPDATE/DELETE</li>
                                <li><code className="text-primary">live</code> — project-level analytics event</li>
                                <li><code className="text-primary">error</code> — access denied / bad request</li>
                            </ul>
                        </div>
                    </div>
                    <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                        <code>{`// Browser / Node.js — subscribe to all changes in a project
const ws = new WebSocket(
  'wss://YOUR_WS_HOST:4000?token=YOUR_API_KEY'
);

ws.onopen = () => {
  // Subscribe to all tables in a project using wildcard '*'
  ws.send(JSON.stringify({
    type: 'subscribe',
    projectId: 'YOUR_PROJECT_ID',
    tableId: '*'          // use a specific table name to narrow scope
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'update') {
    console.log('Row changed:', msg.operation, msg.table, msg.data);
  }
  if (msg.type === 'live') {
    console.log('Project event:', msg);
  }
};

ws.onclose = (e) => console.log('Disconnected:', e.reason);
ws.onerror = (e) => console.error('WS Error', e);`}</code>
                    </pre>
                    <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                        <code>{`# Node.js — using the 'ws' package
# npm install ws
const WebSocket = require('ws');

const ws = new WebSocket(
  'wss://YOUR_WS_HOST:4000?token=YOUR_API_KEY'
);

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    projectId: 'YOUR_PROJECT_ID',
    tableId: 'users'   // listen to a specific table
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[Realtime]', msg.type, msg);
});`}</code>
                    </pre>
                </section>

                <section className="space-y-6 opacity-60">
                    <h2 className="text-xl font-semibold border-b pb-2">
                        5. Real-time (SSE) 
                        <span className="ml-2 text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">Deprecated</span>
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        ⚠️ This method uses Server-Sent Events and is subject to serverless cold-start delays. <strong>Migrate to WebSockets (Section 4)</strong> for a reliable, always-on connection.
                    </p>
                    <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-xs text-card-foreground">
                        <code>{`const eventSource = new EventSource('/api/realtime/subscribe?projectId=ID');
eventSource.onmessage = (e) => console.log(JSON.parse(e.data));`}</code>
                    </pre>
                </section>

                <section className="space-y-6">
                    <h2 className="text-xl font-semibold border-b pb-2">6. Error Codes</h2>
                    <div className="bg-card border rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-2 border-b">Code</th>
                                    <th className="p-2 border-b">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                <tr><td className="p-2 font-mono text-primary">FLUX_SQL_SYNTAX</td><td className="p-2">Syntax error in query.</td></tr>
                                <tr><td className="p-2 font-mono text-primary">FLUX_AUTH_REQUIRED</td><td className="p-2">Token missing/expired.</td></tr>
                                <tr><td className="p-2 font-mono text-primary">FLUX_RATE_LIMIT</td><td className="p-2">Rate limit exceeded.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
