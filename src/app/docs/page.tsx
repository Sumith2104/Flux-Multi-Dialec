import * as React from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download } from 'lucide-react';

export default function DocsPage() {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pt-12 pb-24">
            <main className="max-w-4xl mx-auto w-full px-6 space-y-12">
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    &larr; Back to Home
                </Link>

                <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Fluxbase Documentation</h1>
                    <p className="text-lg text-muted-foreground">
                        Connect your applications directly to Fluxbase databases using standard HTTP REST or direct MySQL connections. No proprietary packages required.
                    </p>
                    <a
                        href="/fluxbase-integration-guide.pdf"
                        download="Fluxbase-Integration-Guide.pdf"
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                    >
                        <Download className="h-4 w-4" />
                        Download Integration Guide (PDF)
                    </a>
                </div>

                <section className="space-y-6">
                    <h2 className="text-2xl font-semibold border-b pb-2">1. Essential Requirements</h2>
                    <ul className="list-disc list-inside space-y-3 text-muted-foreground">
                        <li><strong className="text-foreground">Fluxbase Project:</strong> You must have an active project initialized safely in your dashboard.</li>
                        <li><strong className="text-foreground">Database Credentials:</strong> Obtain your project database URL and safe credentials from your dashboard settings.</li>
                        <li><strong className="text-foreground">REST API Token (Optional):</strong> If you prefer HTTP requests, you'll need the API Bearer Token available in the dashboard.</li>
                    </ul>
                </section>

                <section className="space-y-6">
                    <h2 className="text-2xl font-semibold border-b pb-2">2. Universal Language Setup (HTTP REST & MySQL)</h2>
                    <p className="text-muted-foreground">We deliberately do not force you to install a custom SDK package. You can interact with Fluxbase entirely via standard HTTP networking or official MySQL drivers.</p>

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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
                                <pre className="bg-card border p-4 rounded-xl overflow-x-auto text-sm text-card-foreground">
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
            </main>
        </div>
    );
}
