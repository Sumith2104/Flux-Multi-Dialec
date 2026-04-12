'use client';

import * as React from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Download, 
    Book, 
    Code2, 
    Webhook, 
    Database, 
    ShieldCheck, 
    Shield,
    Zap, 
    Copy, 
    Check, 
    ArrowRight,
    Terminal,
    HardDrive,
    AlertCircle,
    Info,
    Lock,
    Users,
    Eye,
    KeyRound
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

// --- Components ---

function CodeBlock({ code, language, title }: { code: string; language: string; title?: string }) {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative rounded-xl border bg-zinc-950 overflow-hidden my-4">
            {title && (
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
                    <span className="text-xs font-medium text-zinc-400 font-mono tracking-tight">{title}</span>
                    <button 
                        onClick={copyToClipboard}
                        className="text-zinc-500 hover:text-white transition-colors p-1"
                        title="Copy code"
                    >
                        {copied ? <Check className="h-4 w-4 text-orange-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                </div>
            )}
            <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
                <code className="text-zinc-300 antialiased">{code}</code>
            </pre>
            {!title && (
                <button 
                    onClick={copyToClipboard}
                    className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors bg-zinc-900/50 p-1.5 rounded-md opacity-0 group-hover:opacity-100"
                >
                    {copied ? <Check className="h-4 w-4 text-orange-500" /> : <Copy className="h-4 w-4" />}
                </button>
            )}
        </div>
    );
}

function Section({ id, title, icon: Icon, children, className }: { id: string; title: string; icon: any; children: React.ReactNode; className?: string }) {
    return (
        <section id={id} className={cn("scroll-mt-24 space-y-6 pt-6 first:pt-0", className)}>
            <div className="flex items-center gap-3 border-b-2 border-orange-500/10 pb-4">
                <div className="p-2.5 rounded-xl bg-orange-500/5 text-orange-500">
                    <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-white">{title}</h2>
            </div>
            <div className="space-y-4 text-zinc-400">
                {children}
            </div>
        </section>
    );
}

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState('getting-started');

    const sections = [
        { id: 'getting-started', label: '1. Getting Started', icon: Zap },
        { id: 'core-api', label: '2. Core SQL API', icon: Database },
        { id: 'sdks', label: '3. Language SDKs', icon: Code2 },
        { id: 'webhooks', label: '4. Webhooks', icon: Webhook },
        { id: 'storage', label: '5. Storage v2', icon: HardDrive },
        { id: 'realtime', label: '6. Real-time SSE', icon: Zap },
        { id: 'error-codes', label: '7. Error Codes', icon: AlertCircle },
        { id: 'governance', label: '8. Governance', icon: ShieldCheck },
        { id: 'rls-tutorial', label: '9. Row Level Security', icon: Shield },
    ];

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-10% 0% -80% 0%' }
        );

        sections.forEach((section) => {
            const el = document.getElementById(section.id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="flex flex-col min-h-screen bg-black text-zinc-300">
            {/* --- Navigation sidebar --- */}
            <aside className="fixed top-0 left-0 bottom-0 w-72 hidden lg:flex flex-col border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-md pt-24 pb-12 px-6 z-40">
                <div className="flex items-center gap-2 mb-10 px-2 group">
                    <Book className="h-5 w-5 text-orange-500 group-hover:rotate-12 transition-transform" />
                    <span className="font-bold text-white tracking-tight">Documentation</span>
                </div>
                
                <nav className="flex-1 space-y-1 overflow-y-auto">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => scrollTo(section.id)}
                            className={cn(
                                "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300",
                                activeSection === section.id 
                                    ? "bg-orange-500/10 text-orange-500 font-semibold border-l-2 border-orange-500 translate-x-1" 
                                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
                            )}
                        >
                            <section.icon className={cn("h-4 w-4", activeSection === section.id ? "text-orange-500" : "text-zinc-600")} />
                            {section.label}
                        </button>
                    ))}
                </nav>

                <div className="mt-auto pt-6 border-t border-zinc-800">
                    <Button variant="outline" className="w-full justify-start gap-2 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800" asChild>
                        <a href="/fluxbase-integration-guide.pdf" download>
                            <Download className="h-4 w-4 text-orange-500" />
                            Download PDF (v4.2)
                        </a>
                    </Button>
                </div>
            </aside>

            {/* --- Main Content --- */}
            <main className="lg:pl-72 flex-1 pt-12 lg:pt-0">
                <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24 lg:py-32 grid grid-cols-1 xl:grid-cols-12 gap-12">
                    
                    {/* Content Body */}
                    <div className="xl:col-span-8 space-y-24">
                        
                        <header className="space-y-6">
                            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-orange-500/80 hover:text-orange-500 transition-colors font-medium">
                                <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                                Back to Fluxbase Home
                            </Link>
                            <div className="space-y-2">
                                <h1 className="text-5xl lg:text-6xl font-black tracking-tight text-white antialiased">
                                    Integration <span className="text-orange-500">Guide</span>
                                </h1>
                                <p className="text-xl text-zinc-500 leading-relaxed max-w-2xl font-medium">
                                    Official technical reference for connecting your backend systems to Fluxbase. 
                                    Corrected for v4.2 with full language SDK support.
                                </p>
                            </div>
                        </header>

                        <Section id="getting-started" title="Getting Started" icon={Zap}>
                            <p>To connect your backend to Fluxbase, you need three core identifiers found in your <strong>Project Dashboard</strong>:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
                                {[
                                    { label: 'Project ID', desc: 'Secure UUID found in Settings', color: 'bg-blue-500/10 text-blue-400' },
                                    { label: 'API Key', desc: 'Bearer token created in Settings > Keys', color: 'bg-orange-500/10 text-orange-400' },
                                    { label: 'Connection URL', desc: 'The HTTP target for your region', color: 'bg-emerald-500/10 text-emerald-400' },
                                    { label: 'Real-time URL', desc: 'Persistent SSE sidecar target', color: 'bg-purple-500/10 text-purple-400' },
                                ].map((item, i) => (
                                    <div key={i} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
                                        <div className={cn("w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2", item.color)}>
                                            {item.label}
                                        </div>
                                        <p className="text-sm font-semibold text-zinc-200">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section id="core-api" title="Core SQL API" icon={Database}>
                            <div className="space-y-4">
                                <div className="bg-orange-500/5 border border-orange-500/20 p-5 rounded-2xl flex gap-4">
                                    <Info className="h-6 w-6 text-orange-500 shrink-0" />
                                    <p className="text-sm leading-relaxed text-orange-200/80">
                                        <strong>IMPORTANT:</strong> The API endpoint has been standardized. 
                                        Use <code>POST /api/execute-sql</code>. The request body uses the field <code>"query"</code>, 
                                        and rows are returned in <code>body.result.rows</code>.
                                    </p>
                                </div>
                                <div className="p-4 bg-zinc-900 border rounded-xl divide-y divide-zinc-800">
                                    <div className="py-2 flex justify-between">
                                        <span className="font-mono text-zinc-500">Method</span>
                                        <span className="font-bold text-orange-500">POST</span>
                                    </div>
                                    <div className="py-2 flex justify-between">
                                        <span className="font-mono text-zinc-500">Endpoint</span>
                                        <span className="font-mono text-white">/api/execute-sql</span>
                                    </div>
                                    <div className="py-2 flex justify-between">
                                        <span className="font-mono text-zinc-500">Auth</span>
                                        <span className="font-mono text-zinc-300">Bearer &lt;YOUR_API_KEY&gt;</span>
                                    </div>
                                </div>
                            </div>

                            <CodeBlock 
                                title="Request Body (JSON)"
                                language="json"
                                code={`{
  "projectId": "YOUR_PROJECT_ID",
  "query": "SELECT * FROM users LIMIT 10;"
}`}
                            />
                            
                            <CodeBlock 
                                title="Success Response (200 OK)"
                                language="json"
                                code={`{
  "success": true,
  "result": {
    "rows": [ { "id": 1, "name": "Alice" }, ... ],
    "columns": ["id", "name"],
    "message": null
  },
  "executionInfo": { "time": "12ms", "rowCount": 1 }
}`}
                            />
                        </Section>

                        <Section id="sdks" title="Language SDKs" icon={Code2}>
                            <p>Native integration examples for the most popular backend environments. No heavy libraries required — just standard HTTP clients.</p>
                            
                            <Tabs defaultValue="nodejs" className="w-full mt-6">
                                <TabsList className="flex flex-wrap h-auto gap-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl">
                                    {['Node.js', 'Python', 'Go', 'Rust', 'Java', 'PHP', 'Ruby', 'cURL'].map(lang => (
                                        <TabsTrigger 
                                            key={lang.toLowerCase().replace('.', '')} 
                                            value={lang.toLowerCase().replace('.', '')}
                                            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-xl px-4 py-2 transition-all"
                                        >
                                            {lang}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>

                                <div className="mt-8">
                                    <TabsContent value="nodejs">
                                        <CodeBlock language="typescript" title="index.js" code={`const FLUXBASE_URL = 'https://fluxbase.vercel.app/api/execute-sql';
const API_KEY = process.env.FLUXBASE_API_KEY;

async function runQuery(sql) {
  const res = await fetch(FLUXBASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${API_KEY}\`
    },
    body: JSON.stringify({
      projectId: process.env.PROJECT_ID,
      query: sql // field name is 'query'
    })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error.message);
  return json.result.rows; // NOT json.data
}

runQuery('SELECT * FROM users LIMIT 5').then(console.log);`} />
                                    </TabsContent>

                                    <TabsContent value="python">
                                        <CodeBlock language="python" title="main.py" code={`import os, requests
URL = 'https://fluxbase.vercel.app/api/execute-sql'
HEADERS = {'Authorization': f'Bearer {os.getenv("API_KEY")}'}

def get_users():
    payload = {'projectId': 'YOUR_ID', 'query': "SELECT * FROM users"}
    resp = requests.post(URL, json=payload, headers=HEADERS)
    data = resp.json()
    if not data.get('success'):
        raise Exception(data['error']['message'])
    return data['result']['rows'] # nested under 'result'

print(get_users())`} />
                                    </TabsContent>

                                    <TabsContent value="go">
                                        <CodeBlock language="go" title="main.go" code={`// Uses Go's standard library net/http
func runQuery(sql string) ([]map[string]interface{}, error) {
    body, _ := json.Marshal(map[string]string{
        "projectId": os.Getenv("PROJECT_ID"),
        "query":     sql,
    })
    req, _ := http.NewRequest("POST", "https://fluxbase.vercel.app/api/execute-sql", bytes.NewBuffer(body))
    req.Header.Set("Authorization", "Bearer "+os.Getenv("API_KEY"))
    req.Header.Set("Content-Type", "application/json")
    
    resp, _ := http.DefaultClient.Do(req)
    var result struct {
        Success bool \`json:"success"\`
        Result struct { Rows []map[string]interface{} \`json:"rows"\` } \`json:"result"\`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Result.Rows, nil
}`} />
                                    </TabsContent>

                                    <TabsContent value="rust">
                                        <CodeBlock language="rust" title="main.rs" code={`use serde_json::{json, Value};
// Cargo.toml: reqwest = { version = "0.12", features = ["json"] }

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let body = json!({
        "projectId": "YOUR_ID",
        "query": "SELECT * FROM users"
    });
    
    let resp: Value = client
        .post("https://fluxbase.vercel.app/api/execute-sql")
        .header("Authorization", format!("Bearer {}", "API_KEY"))
        .json(&body)
        .send().await?
        .json().await?;
        
    println!("{:#?}", resp["result"]["rows"]);
    Ok(())
}`} />
                                    </TabsContent>

                                    <TabsContent value="java">
                                        <CodeBlock language="java" title="Fluxbase.java" code={`// Simple Java 11+ HttpClient example
HttpClient client = HttpClient.newHttpClient();
String body = "{\\"projectId\\": \\"ID\\", \\"query\\": \\"SELECT * FROM users\\"}";

HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://fluxbase.vercel.app/api/execute-sql"))
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .header("Authorization", "Bearer " + API_KEY)
    .header("Content-Type", "application/json")
    .build();

HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());`} />
                                    </TabsContent>

                                    <TabsContent value="php">
                                        <CodeBlock language="php" title="api.php" code={`$url = 'https://fluxbase.vercel.app/api/execute-sql';
$payload = json_encode(['projectId' => 'ID', 'query' => 'SELECT * FROM users']);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
    ],
]);
$resp = json_decode(curl_exec($ch), true);
$rows = $resp['result']['rows']; // Standard response mapping`} />
                                    </TabsContent>

                                    <TabsContent value="ruby">
                                        <CodeBlock language="ruby" title="app.rb" code={`require 'uri', 'net/http', 'json'
FLUX_URL = URI('https://fluxbase.vercel.app/api/execute-sql')

def get_users(sql)
  http = Net::HTTP.new(FLUX_URL.host, FLUX_URL.port)
  http.use_ssl = true
  req = Net::HTTP::Post.new(FLUX_URL)
  req['Authorization'] = "Bearer #{ENV['API_KEY']}"
  req.body = { projectId: 'ID', query: sql }.to_json
  
  JSON.parse(http.request(req).body)['result']['rows']
end`} />
                                    </TabsContent>

                                    <TabsContent value="curl">
                                        <CodeBlock language="bash" title="Terminal" code={`curl -X POST "https://fluxbase.vercel.app/api/execute-sql" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "query": "SELECT * FROM users LIMIT 5"
  }'`} />
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </Section>

                        <Section id="webhooks" title="Webhooks" icon={Webhook}>
                            <p>Webhooks are outbound HTTP POST requests sent from Fluxbase to your app when data changes. Perfect for serverless environments (Vercel, AWS Lambda).</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 text-sm">
                                <div className="p-5 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-orange-500" /> Event Types
                                    </h4>
                                    <ul className="space-y-1 text-zinc-500">
                                        <li>• <code>row.inserted</code></li>
                                        <li>• <code>row.updated</code></li>
                                        <li>• <code>row.deleted</code></li>
                                    </ul>
                                </div>
                                <div className="p-5 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                                        < ShieldCheck className="h-4 w-4 text-emerald-500" /> Security
                                    </h4>
                                    <p className="text-zinc-500 leading-relaxed">
                                        Register a <strong>Secret</strong> to verify <code>X-Fluxbase-Signature</code> headers.
                                    </p>
                                </div>
                            </div>
                            
                            <CodeBlock title="Webhook Payload Example" language="json" code={`{
  "event_type": "row.inserted",
  "table_id": "orders",
  "data": {
    "new": { "id": 123, "amount": 50.0 },
    "old": null
  }
}`} />
                        </Section>

                        <Section id="storage" title="Storage v2" icon={HardDrive}>
                            <p>Secure AWS S3-backed file management with logically isolated buckets and short-lived expiration URLs.</p>
                            
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-white font-semibold mb-2">Upload File (Multipart)</h4>
                                    <CodeBlock language="bash" code={`curl -X POST "https://fluxbase.vercel.app/api/storage/upload" \\
  -H "Authorization: Bearer $API_KEY" \\
  -F "file=@/path/to/image.jpg" \\
  -F "bucketId=photos" \\
  -F "projectId=YOUR_PROJECT_ID"`} />
                                </div>

                                <div>
                                    <h4 className="text-white font-semibold mb-2">Generate Presigned URL</h4>
                                    <p className="text-sm mb-2 text-zinc-500">All files are private. Always fetch a signed URL for client-side rendering.</p>
                                    <CodeBlock language="bash" code={`GET /api/storage/url?s3Key=project_123/avatar.jpg&projectId=ID`} />
                                </div>
                            </div>
                        </Section>

                        <Section id="realtime" title="Real-time (WebSocket)" icon={Zap}>
                            <p>
                                Fluxbase uses a <strong>persistent WebSocket connection</strong> for all real-time events. 
                                Connect once and receive live row changes, schema updates, and custom broadcasts — 
                                automatically reconnecting with exponential backoff if the connection drops.
                            </p>

                            {/* How it works */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                                {[
                                    { icon: Zap, color: 'text-orange-400 bg-orange-500/10', title: 'Connect & Subscribe', desc: 'Open a single WebSocket connection and join a project room. All events for that project are multiplexed over one socket.' },
                                    { icon: Database, color: 'text-blue-400 bg-blue-500/10', title: 'Receive Events', desc: 'The server pushes db_event messages for row changes (INSERT/UPDATE/DELETE) and schema_update for DDL changes.' },
                                    { icon: ShieldCheck, color: 'text-emerald-400 bg-emerald-500/10', title: 'Auto-Reconnect', desc: 'Built-in exponential backoff (1s, 2s, 4s … up to 15s). Your listeners are re-registered automatically after reconnect.' },
                                ].map((item, i) => (
                                    <div key={i} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                                        <div className={`w-fit p-2 rounded-lg mb-3 ${item.color}`}><item.icon className="h-5 w-5" /></div>
                                        <h5 className="font-bold text-white text-sm mb-1">{item.title}</h5>
                                        <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Connection Setup */}
                            <h3 className="text-xl font-bold text-white mt-8 mb-2">Connection Setup</h3>
                            <p className="text-sm mb-2">Set <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-orange-300">NEXT_PUBLIC_WS_URL</code> in your environment to point to the realtime server.</p>
                            <CodeBlock language="bash" title=".env.local" code={`NEXT_PUBLIC_WS_URL=wss://fluxbase-realtime.onrender.com`} />

                            <Tabs defaultValue="js-rt" className="w-full mt-6">
                                <TabsList className="flex flex-wrap h-auto gap-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl">
                                    {[['JavaScript', 'js-rt'], ['Python', 'python-rt'], ['cURL / wscat', 'curl-rt']].map(([lang, val]) => (
                                        <TabsTrigger key={val} value={val} className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-xl px-4 py-2 transition-all">{lang}</TabsTrigger>
                                    ))}
                                </TabsList>
                                <div className="mt-6">
                                    <TabsContent value="js-rt">
                                        <CodeBlock language="typescript" title="realtime.js" code={`const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://fluxbase-realtime.onrender.com';
const PROJECT_ID = 'YOUR_PROJECT_ID';

const socket = new WebSocket(WS_URL);

socket.onopen = () => {
  // Join the project room to receive all events for this project
  socket.send(JSON.stringify({
    type: 'subscribe',
    roomId: \`project_\${PROJECT_ID}\`
  }));
};

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  // Row-level data change
  if (msg.type === 'db_event' && msg.payload) {
    const { table, operation, record } = msg.payload;
    console.log(\`[\${operation}] on \${table}:\`, record);
  }

  // Schema structural change (CREATE / DROP / ALTER)
  if (msg.payload?.event_type === 'schema_update') {
    console.log('Schema changed — refreshing explorer...');
    // e.g. trigger a re-fetch of your table list
  }
};

socket.onclose = () => console.log('WS closed. Will reconnect...');
socket.onerror = (err) => console.error('WS error:', err);`} />
                                    </TabsContent>
                                    <TabsContent value="python-rt">
                                        <CodeBlock language="python" title="realtime.py" code={`import json, asyncio, websockets

WS_URL = "wss://fluxbase-realtime.onrender.com"
PROJECT_ID = "YOUR_PROJECT_ID"

async def listen():
    async with websockets.connect(WS_URL) as ws:
        # Subscribe to the project room
        await ws.send(json.dumps({
            "type": "subscribe",
            "roomId": f"project_{PROJECT_ID}"
        }))
        print("Subscribed. Listening for events...")

        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "db_event":
                payload = msg.get("payload", {})
                print(f"[{payload.get('operation')}] {payload.get('table')}: {payload.get('record')}")
            elif msg.get("payload", {}).get("event_type") == "schema_update":
                print("Schema changed — trigger a schema refresh.")

asyncio.run(listen())`} />
                                    </TabsContent>
                                    <TabsContent value="curl-rt">
                                        <CodeBlock language="bash" title="Terminal (wscat)" code={`# Install wscat globally
npm install -g wscat

# Connect to the realtime server
wscat -c wss://fluxbase-realtime.onrender.com

# Then send this JSON to subscribe:
{"type":"subscribe","roomId":"project_YOUR_PROJECT_ID"}

# You will start receiving events like:
# {"type":"db_event","payload":{"operation":"INSERT","table":"orders","record":{...}}}`} />
                                    </TabsContent>
                                </div>
                            </Tabs>

                            {/* Event Types */}
                            <h3 className="text-xl font-bold text-white mt-10 mb-4">Event Reference</h3>
                            <div className="rounded-2xl border border-zinc-800 overflow-hidden text-sm">
                                <table className="w-full text-left border-collapse bg-zinc-950">
                                    <thead>
                                        <tr className="bg-zinc-900 border-b border-zinc-800">
                                            <th className="p-4 font-semibold text-white">msg.type</th>
                                            <th className="p-4 font-semibold text-white">payload.event_type / operation</th>
                                            <th className="p-4 font-semibold text-white">When it fires</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900">
                                        {[
                                            { type: 'db_event', event: 'operation: INSERT', when: 'A row was inserted via execute-sql or the Table Editor.' },
                                            { type: 'db_event', event: 'operation: UPDATE', when: 'A row was updated.' },
                                            { type: 'db_event', event: 'operation: DELETE', when: 'A row was deleted.' },
                                            { type: 'db_event', event: 'event_type: schema_update', when: 'A CREATE, DROP, ALTER, TRUNCATE or RENAME was executed — triggers a sidebar refresh for all clients.' },
                                            { type: 'subscribed', event: '—', when: 'Confirmation that you have joined the project room.' },
                                        ].map((row, i) => (
                                            <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                                                <td className="p-4 font-mono font-bold text-orange-500">{row.type}</td>
                                                <td className="p-4 font-mono text-blue-300 text-xs">{row.event}</td>
                                                <td className="p-4 text-zinc-400 text-xs">{row.when}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Schema sync callout */}
                            <div className="bg-blue-500/5 border border-blue-500/20 p-5 rounded-2xl flex gap-4 mt-6">
                                <Info className="h-6 w-6 text-blue-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-blue-300">Automatic Schema Sync</p>
                                    <p className="text-sm leading-relaxed text-blue-200/70">
                                        The Fluxbase Dashboard uses a <strong>Triple-Pass (1s → 4s → 10s)</strong> invalidation 
                                        strategy whenever a <code>schema_update</code> event is received. This guarantees the 
                                        Database Explorer sidebar reflects DDL changes across all connected sessions, even under 
                                        high-latency PostgreSQL catalog propagation.
                                    </p>
                                </div>
                            </div>
                        </Section>

                        <Section id="error-codes" title="Error Codes" icon={AlertCircle}>
                            <div className="rounded-2xl border border-zinc-800 overflow-hidden text-sm">
                                <table className="w-full text-left border-collapse bg-zinc-950">
                                    <thead>
                                        <tr className="bg-zinc-900 border-b border-zinc-800">
                                            <th className="p-4 font-semibold text-white">Code</th>
                                            <th className="p-4 font-semibold text-white">Status</th>
                                            <th className="p-4 font-semibold text-white">Meaning</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900">
                                        {[
                                            { code: 'AUTH_REQUIRED', status: '401', desc: 'Missing or invalid API key Bearer token.' },
                                            { code: 'SCOPE_MISMATCH', status: '403', desc: 'API key is scoped to a different organization.' },
                                            { code: 'RATE_LIMIT', status: '429', desc: '30 requests / 10s per project exceeded.' },
                                            { code: 'PROJECT_SUSPENDED', status: '403', desc: 'Organization lacks active subscription.' },
                                            { code: 'SQL_EXEC_ERROR', status: '200', desc: 'Syntactic error in SQL query string.' },
                                        ].map((err, i) => (
                                            <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                                                <td className="p-4 font-mono font-bold text-orange-500">{err.code}</td>
                                                <td className="p-4 text-zinc-500">{err.status}</td>
                                                <td className="p-4 text-zinc-300">{err.desc}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        <Section id="governance" title="Governance & Security" icon={ShieldCheck}>
                            <p>Fluxbase uses strict row-level security defaults. Every API request is verified against your shared environment policy.</p>
                            <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl">
                                <h4 className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5" /> Data Sovereignty
                                </h4>
                                <p className="text-sm leading-relaxed text-emerald-200/70">
                                    All databases are hosted in isolated AWS RDS instances within your chosen region. Fluxbase never inspects query data unless specifically requested for debugging.
                                </p>
                            </div>
                        </Section>

                        {/* ============================== RLS TUTORIAL ============================== */}
                        <Section id="rls-tutorial" title="Row Level Security" icon={Shield}>
                            <div className="bg-amber-500/5 border border-amber-500/20 p-5 rounded-2xl flex gap-4">
                                <Shield className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-sm leading-relaxed text-amber-200/80">
                                    <strong>Row Level Security (RLS)</strong> lets you define SQL expressions that are enforced at the <em>database engine</em> level — meaning your backend API can never return data that violates a policy, regardless of what query is sent.
                                </p>
                            </div>

                            {/* How it works */}
                            <div className="mt-6 space-y-3">
                                <h3 className="text-xl font-bold text-white">How RLS Works in Fluxbase</h3>
                                <p className="text-sm leading-relaxed">When a query runs, Fluxbase automatically injects the current user&apos;s identity into the PostgreSQL session before execution. Your policy expressions can then reference <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300">auth.uid()</code> to filter rows at the engine level.</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                                    {[
                                        { icon: KeyRound, color: 'text-blue-400 bg-blue-500/10', title: 'Auth Identity', desc: 'Your logged-in user ID is automatically injected into every query session via SET LOCAL.' },
                                        { icon: Lock, color: 'text-amber-400 bg-amber-500/10', title: 'Policy Check', desc: 'PostgreSQL evaluates your policy expression (e.g. user_id = auth.uid()) before returning any row.' },
                                        { icon: Eye, color: 'text-emerald-400 bg-emerald-500/10', title: 'Only Allowed Rows', desc: 'Rows that fail the policy are silently filtered out. No errors — just safe, scoped results.' },
                                    ].map((item, i) => (
                                        <div key={i} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                                            <div className={`w-fit p-2 rounded-lg mb-3 ${item.color}`}><item.icon className="h-5 w-5" /></div>
                                            <h5 className="font-bold text-white text-sm mb-1">{item.title}</h5>
                                            <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Step-by-step */}
                            <div className="mt-4 space-y-3">
                                <h3 className="text-xl font-bold text-white">Step-by-Step Setup</h3>
                                <div className="space-y-4">
                                    {[
                                        { step: '01', title: 'Open the RLS Dashboard', desc: 'Navigate to Database → Row Level Security in your project sidebar. You will see all your tables listed.' },
                                        { step: '02', title: 'Click "New Policy"', desc: 'Select the table, choose a command scope (ALL / SELECT / INSERT / UPDATE / DELETE), give it a name, and write your USING expression.' },
                                        { step: '03', title: 'Toggle the Policy ON', desc: 'Use the toggle switch next to any policy. This immediately executes ALTER TABLE ... ENABLE ROW LEVEL SECURITY and CREATE POLICY in your database.' },
                                        { step: '04', title: 'Test in the Table Editor', desc: 'Open the Table Editor and run a SELECT from your protected table. You will only see rows your user owns.' },
                                    ].map((item, i) => (
                                        <div key={i} className="flex gap-5 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
                                            <span className="text-2xl font-black text-orange-500/30 font-mono shrink-0">{item.step}</span>
                                            <div>
                                                <h5 className="font-bold text-white text-sm mb-1">{item.title}</h5>
                                                <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Policy examples */}
                            <div className="mt-6 space-y-6">
                                <h3 className="text-xl font-bold text-white">Common Policy Examples</h3>

                                <div>
                                    <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-blue-400" /><h4 className="font-semibold text-white text-sm">User Owns Their Rows</h4></div>
                                    <p className="text-xs text-zinc-500 mb-2">Classic ownership pattern. Apply to tables like <code className="bg-zinc-800 px-1 rounded">posts</code>, <code className="bg-zinc-800 px-1 rounded">orders</code>, or <code className="bg-zinc-800 px-1 rounded">profiles</code>.</p>
                                    <CodeBlock title="USING Expression" language="sql" code={`-- Only show rows that belong to the currently logged-in user\nuser_id = auth.uid()`} />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2"><Lock className="h-4 w-4 text-purple-400" /><h4 className="font-semibold text-white text-sm">Multi-Tenant SaaS (Org-scoped)</h4></div>
                                    <p className="text-xs text-zinc-500 mb-2">Scope access to an organisation. Set <code className="bg-zinc-800 px-1 rounded">auth.uid()</code> to the org ID at the API level.</p>
                                    <CodeBlock title="USING Expression" language="sql" code={`-- All members of the same organization can see the rows\norg_id = auth.uid()`} />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2"><Eye className="h-4 w-4 text-emerald-400" /><h4 className="font-semibold text-white text-sm">Public Read, Owner Write</h4></div>
                                    <p className="text-xs text-zinc-500 mb-2">Anyone can read, but only the author can write. Create <strong>two</strong> policies on the same table.</p>
                                    <CodeBlock title="Policy 1 — SELECT (public)" language="sql" code={`-- Anyone can read; set command to SELECT\ntrue`} />
                                    <CodeBlock title="Policy 2 — Write Ops (owner only)" language="sql" code={`-- Only the owner can mutate; set command to INSERT / UPDATE / DELETE\nauthor_id = auth.uid()`} />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2"><ShieldCheck className="h-4 w-4 text-red-400" /><h4 className="font-semibold text-white text-sm">Lock Down Everything</h4></div>
                                    <p className="text-xs text-zinc-500 mb-2">Complete lockdown — useful for internal audit tables. No API caller can read this table.</p>
                                    <CodeBlock title="USING Expression" language="sql" code={`-- Nobody gets access via the API\nfalse`} />
                                </div>
                            </div>

                            {/* Code examples */}
                            <div className="mt-6 space-y-4">
                                <h3 className="text-xl font-bold text-white">Using RLS from Your Backend</h3>
                                <p className="text-sm">RLS is completely transparent. Your existing API calls work as before — Fluxbase silently filters results based on the authenticated user. No changes to your query code needed.</p>

                                <Tabs defaultValue="js-rls" className="w-full mt-4">
                                    <TabsList className="flex flex-wrap h-auto gap-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl">
                                        {[['JavaScript', 'js-rls'], ['Python', 'python-rls'], ['cURL', 'curl-rls']].map(([lang, val]) => (
                                            <TabsTrigger key={val} value={val} className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-xl px-4 py-2 transition-all">{lang}</TabsTrigger>
                                        ))}
                                    </TabsList>
                                    <div className="mt-6">
                                        <TabsContent value="js-rls">
                                            <CodeBlock language="typescript" title="rls-query.js" code={`// No special code needed — the API key identifies the user.
// RLS automatically filters rows based on auth.uid() policies.

async function getMyPosts() {
  const res = await fetch('https://fluxbase.vercel.app/api/execute-sql', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.FLUXBASE_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: process.env.PROJECT_ID,
      // SELECT * — but RLS filters to ONLY rows where user_id = auth.uid()
      query: 'SELECT * FROM posts',
    }),
  });
  const json = await res.json();
  return json.result.rows; // Only YOUR posts — enforced at DB level
}`} />
                                        </TabsContent>
                                        <TabsContent value="python-rls">
                                            <CodeBlock language="python" title="rls_query.py" code={`import os, requests

URL = 'https://fluxbase.vercel.app/api/execute-sql'
HEADERS = {'Authorization': f'Bearer {os.getenv("FLUXBASE_API_KEY")}'}

def get_my_posts():
    # SELECT * — RLS enforces user_id = auth.uid() automatically.
    payload = {'projectId': os.getenv('PROJECT_ID'), 'query': 'SELECT * FROM posts'}
    resp = requests.post(URL, json=payload, headers=HEADERS)
    data = resp.json()
    if not data.get('success'):
        raise Exception(data['error']['message'])
    return data['result']['rows']  # Only rows owned by this user

print(get_my_posts())`} />
                                        </TabsContent>
                                        <TabsContent value="curl-rls">
                                            <CodeBlock language="bash" title="Terminal" code={`# Your API key determines who auth.uid() resolves to.
# RLS silently filters rows at the database level.
curl -X POST "https://fluxbase.vercel.app/api/execute-sql" \\
  -H "Authorization: Bearer $FLUXBASE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "query": "SELECT * FROM posts"
  }'
# Response only contains rows matching the RLS policy.`} />
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>

                            {/* Troubleshooting */}
                            <div className="mt-6 space-y-4">
                                <h3 className="text-xl font-bold text-white">Troubleshooting</h3>
                                <div className="rounded-2xl border border-zinc-800 overflow-hidden text-sm">
                                    <table className="w-full text-left border-collapse bg-zinc-950">
                                        <thead>
                                            <tr className="bg-zinc-900 border-b border-zinc-800">
                                                <th className="p-4 font-semibold text-white">Problem</th>
                                                <th className="p-4 font-semibold text-white">Cause</th>
                                                <th className="p-4 font-semibold text-white">Fix</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900">
                                            {[
                                                { prob: 'Query returns 0 rows', cause: 'Policy expression never matches', fix: 'Try setting expression to true temporarily to confirm RLS is the cause.' },
                                                { prob: 'Policy toggle fails', cause: 'Column in expression does not exist', fix: 'Ensure the column (e.g. user_id) exists in your table schema.' },
                                                { prob: 'Owner cannot see own rows', cause: 'Type mismatch (INT vs TEXT)', fix: 'Cast: user_id::text = auth.uid()' },
                                                { prob: 'Admin locked out', cause: 'FORCE ROW LEVEL SECURITY is active', fix: 'Run ALTER TABLE ... NO FORCE ROW LEVEL SECURITY from the SQL Editor.' },
                                            ].map((row, i) => (
                                                <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                                                    <td className="p-4 font-mono text-red-400 text-xs">{row.prob}</td>
                                                    <td className="p-4 text-zinc-500 text-xs">{row.cause}</td>
                                                    <td className="p-4 text-zinc-300 text-xs">{row.fix}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Section>

                        <div className="pt-12 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="space-y-1">
                                <h4 className="text-lg font-bold text-white">Still have questions?</h4>
                                <p className="text-sm text-zinc-500">Our engineers are available for architecture reviews.</p>
                            </div>
                            <Button className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-8 py-6 h-auto text-lg font-bold shadow-lg shadow-orange-500/20 group">
                                Email Support
                                <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>

                    </div>

                    {/* Right-Side Meta / Summary (Sticky) */}
                    <aside className="xl:col-span-4 hidden xl:block sticky top-32 h-fit space-y-8">
                        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-sm space-y-6">
                            <h4 className="font-bold text-white">Full Reference PDF</h4>
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                Prefer an offline copy? The 32-page high-fidelity PDF guide contains deep-dives on MySQL wire protocols and SDK internal logic.
                            </p>
                            <Button variant="outline" className="w-full justify-center gap-2 border-zinc-800 bg-zinc-900 text-white py-6 rounded-xl hover:bg-zinc-800" asChild>
                                <a href="/fluxbase-integration-guide.pdf" download>
                                    <Download className="h-5 w-5 text-orange-500" />
                                    Integration-Guide.pdf
                                </a>
                            </Button>
                        </div>

                        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/10 space-y-4">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Global Status</h4>
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-sm font-semibold text-zinc-300">All regions Operational</span>
                            </div>
                            <div className="pt-4 border-t border-zinc-800 text-[11px] text-zinc-600 font-mono">
                                Last Update: March 2026<br/>
                                API version: v4.2<br/>
                                Latency: ~2.4ms (US-East)
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
