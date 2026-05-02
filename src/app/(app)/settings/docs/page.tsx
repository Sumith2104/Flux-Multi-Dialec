'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Download, ExternalLink, Copy, Check, Info, AlertCircle,
    Database, Code2, Globe, HardDrive, Webhook, Shield, Users, KeyRound, Zap,
    Book, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// â”€â”€â”€ Code Block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CodeBlock({ code, title }: { code: string; title?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="group relative my-4 w-full max-w-full overflow-hidden rounded-lg border border-border bg-card">
            {title && (
                <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary px-3 py-2.5 sm:px-4">
                    <span className="truncate font-mono text-xs font-medium text-muted-foreground">{title}</span>
                    <button onClick={copy} className="text-muted-foreground/75 hover:text-white transition-colors p-1 rounded">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                </div>
            )}
            <pre className="mobile-scroll p-3 text-[12px] leading-relaxed font-mono sm:p-4 sm:text-[13px]">
                <code className="text-foreground/85">{code}</code>
            </pre>
            {!title && (
                <button onClick={copy} className="absolute top-3 right-3 text-muted-foreground/75 hover:text-white bg-secondary/85 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            )}
        </div>
    );
}

function Callout({ type = 'info', children }: { type?: 'info' | 'warning'; children: React.ReactNode }) {
    const styles = {
        info: 'bg-blue-500/5 border-blue-500/20 text-blue-300',
        warning: 'bg-amber-500/5 border-amber-500/20 text-amber-300',
    }[type];
    const Icon = type === 'warning' ? AlertCircle : Info;
    return (
        <div className={cn('flex max-w-full gap-3 rounded-lg border p-4 text-sm leading-relaxed', styles)}>
            <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-80" />
            <div className="text-muted-foreground">{children}</div>
        </div>
    );
}

function Endpoint({ method, path }: { method: 'GET' | 'POST' | 'DELETE' | 'PATCH'; path: string }) {
    const colors = {
        GET: 'text-emerald-400 bg-emerald-500/10',
        POST: 'text-orange-400 bg-orange-500/10',
        DELETE: 'text-red-400 bg-red-500/10',
        PATCH: 'text-blue-400 bg-blue-500/10',
    }[method];
    return (
        <div className="my-3 flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary p-3 font-mono text-sm sm:gap-3">
            <span className={cn('px-2 py-0.5 rounded font-bold text-xs', colors)}>{method}</span>
            <span className="break-anywhere text-foreground/85">{path}</span>
        </div>
    );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) {
    return (
        <section id={id} className="max-w-full scroll-mt-24 space-y-5 sm:scroll-mt-28 sm:space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 shrink-0">
                    <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
                {children}
            </div>
        </section>
    );
}

// â”€â”€â”€ Nav Sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NAV_SECTIONS = [
    { id: 'getting-started', label: 'Getting Started', icon: Zap },
    { id: 'authentication', label: 'Authentication', icon: KeyRound },
    { id: 'core-api', label: 'Core SQL API', icon: Database },
    { id: 'sdks', label: 'Language SDKs', icon: Code2 },
    { id: 'realtime', label: 'Real-time (WebSocket)', icon: Globe },
    { id: 'storage', label: 'Storage v2', icon: HardDrive },
    { id: 'team-api', label: 'Team & Invitations', icon: Users },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'error-codes', label: 'Error Codes', icon: AlertCircle },
    { id: 'rls-tutorial', label: 'Row Level Security', icon: Shield },
];

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SettingsDocsPage() {
    const router = useRouter();
    const [activeSection, setActiveSection] = useState('getting-started');

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) setActiveSection(entry.target.id);
                });
            },
            { rootMargin: '-10% 0% -80% 0%', threshold: 0 }
        );
        NAV_SECTIONS.forEach((s) => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

    return (
        <div className="docs-mobile-safe fixed inset-0 z-50 flex max-w-full overflow-hidden bg-background text-foreground/85">

            {/* â”€â”€ Sidebar â”€â”€ */}
            <aside className="w-64 shrink-0 hidden lg:flex flex-col border-r border-border/70 bg-card/80 backdrop-blur-lg pt-6 pb-8 px-4">
                {/* Back button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 px-2 py-1.5 mb-6 rounded-lg text-muted-foreground/75 hover:text-foreground/90 hover:bg-muted/70 transition-all text-sm group w-fit"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                    Back to Settings
                </button>

                <div className="flex items-center gap-2 mb-8 px-2">
                    <div className="p-1.5 rounded-lg bg-orange-500/10">
                        <Book className="h-4 w-4 text-orange-400" />
                    </div>
                    <span className="font-bold text-white text-sm tracking-tight">Documentation</span>
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono font-bold">v4.2</span>
                </div>

                <nav className="flex-1 overflow-y-auto space-y-0.5 pr-1">
                    {NAV_SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => scrollTo(s.id)}
                            className={cn(
                                'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200',
                                activeSection === s.id
                                    ? 'bg-orange-500/10 text-orange-400 font-semibold'
                                    : 'text-muted-foreground/75 hover:text-foreground/90 hover:bg-muted/60'
                            )}
                        >
                            <s.icon className={cn('h-3.5 w-3.5 shrink-0', activeSection === s.id ? 'text-orange-400' : 'text-muted-foreground/55')} />
                            {s.label}
                        </button>
                    ))}
                </nav>

                <div className="mt-6 pt-6 border-t border-border space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-border bg-secondary/70 text-foreground/85 hover:bg-muted text-xs" asChild>
                        <a href="/fluxbase-integration-guide.pdf" download>
                            <Download className="h-3.5 w-3.5 text-orange-400" /> Download PDF Guide
                        </a>
                    </Button>
                    <Link href="/docs" target="_blank" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground/55 hover:text-foreground/85 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" /> Open Standalone Page
                    </Link>
                </div>
            </aside>

            {/* â”€â”€ Mobile top bar â”€â”€ */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-popover/95 backdrop-blur border-b border-border">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-white text-sm">
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <span className="font-bold text-white text-sm">Documentation</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono">v4.2</span>
            </div>

            {/* â”€â”€ Scrollable Content â”€â”€ */}
            <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="mx-auto w-full max-w-4xl px-5 py-20 sm:px-8 lg:px-12 lg:py-16">

                    {/* Hero */}
                    <header className="mb-12 max-w-full space-y-4 sm:mb-16 sm:max-w-2xl">
                        <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                            Integration <span className="text-orange-400">Guide</span>
                        </h1>
                        <p className="text-base text-muted-foreground/75 leading-relaxed">
                            Complete API reference for Fluxbase â€” covering authentication, SQL execution, real-time events, file storage, team management, and row-level security.
                        </p>
                        <div className="flex max-w-full flex-wrap items-center gap-2 pt-1 sm:gap-3">
                            {[
                                { label: 'v4.2', color: 'bg-orange-500/10 text-orange-400' },
                                { label: 'PostgreSQL', color: 'bg-blue-500/10 text-blue-400' },
                                { label: 'REST + WebSocket', color: 'bg-purple-500/10 text-purple-400' },
                            ].map(b => (
                                <span key={b.label} className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider', b.color)}>{b.label}</span>
                            ))}
                        </div>
                    </header>

                    <div className="max-w-full space-y-16 sm:space-y-24">

                        {/* â”€â”€ 1. Getting Started â”€â”€ */}
                        <Section id="getting-started" title="Getting Started" icon={Zap}>
                            <p>Every Fluxbase integration needs three values from your <strong className="text-foreground/90">Project Settings</strong>:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                {[
                                    { label: 'API Key', desc: 'Bearer token from Settings â†’ API Keys.', color: 'text-orange-400 bg-orange-500/10' },
                                    { label: 'Project ID', desc: 'Unique identifier visible in the URL and Settings.', color: 'text-blue-400 bg-blue-500/10' },
                                    { label: 'Base URL', desc: 'https://fluxbase.vercel.app â€” all REST endpoints.', color: 'text-emerald-400 bg-emerald-500/10' },
                                    { label: 'WebSocket URL', desc: 'wss://fluxbase-realtime-2bcf.onrender.com', color: 'text-purple-400 bg-purple-500/10' },
                                ].map((item) => (
                                    <div key={item.label} className="p-4 rounded-lg border border-border bg-secondary/60 space-y-1.5">
                                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest', item.color)}>{item.label}</span>
                                        <p className="text-sm text-foreground/85">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                            <CodeBlock title=".env.local" code={`FLUXBASE_API_KEY=flx_live_xxxxxxxxxxxxxxxxxxxx
FLUXBASE_PROJECT_ID=51c04beb753a42f3
NEXT_PUBLIC_WS_URL=wss://fluxbase-realtime.onrender.com`} />
                            <Callout type="warning">
                                <strong>Never expose your API key on the client side.</strong> Always call Fluxbase from server-side code and keep your key in server-only environment variables.
                            </Callout>
                        </Section>

                        {/* â”€â”€ 2. Authentication â”€â”€ */}
                        <Section id="authentication" title="Authentication" icon={KeyRound}>
                            <p>All REST API requests must include an <code className="text-orange-300 bg-muted px-1.5 py-0.5 rounded text-xs">Authorization</code> header with a valid Bearer token.</p>
                            <CodeBlock title="Required Header" code={`Authorization: Bearer flx_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json`} />
                            <h3 className="text-base font-bold text-white mt-4">API Key Scopes</h3>
                            <div className="rounded-lg border border-border overflow-hidden text-sm">
                                <table className="w-full text-left bg-card">
                                    <thead><tr className="bg-secondary border-b border-border text-xs uppercase tracking-wide text-muted-foreground/75"><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Use For</th></tr></thead>
                                    <tbody className="divide-y divide-border/60">
                                        {[
                                            { scope: 'read', access: 'SELECT only', rec: 'Dashboards, public APIs' },
                                            { scope: 'readwrite', access: 'SELECT, INSERT, UPDATE', rec: 'Backend services' },
                                            { scope: 'admin', access: 'Full DDL + DML access', rec: 'Migration & init scripts' },
                                        ].map(r => (
                                            <tr key={r.scope} className="hover:bg-secondary/70">
                                                <td className="px-4 py-3 font-mono text-orange-400 text-xs">{r.scope}</td>
                                                <td className="px-4 py-3 text-foreground/85 text-xs">{r.access}</td>
                                                <td className="px-4 py-3 text-muted-foreground/75 text-xs">{r.rec}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        {/* â”€â”€ 3. Core SQL API â”€â”€ */}
                        <Section id="core-api" title="Core SQL API" icon={Database}>
                            <p>Execute any SQL statement against your project database via a single endpoint.</p>
                            <Endpoint method="POST" path="/api/execute-sql" />
                            <CodeBlock title="Request Body" code={`{
  "projectId": "YOUR_PROJECT_ID",
  "query": "SELECT * FROM users LIMIT 10;"
}`} />
                            <CodeBlock title="Success Response (200)" code={`{
  "success": true,
  "result": {
    "rows": [{ "id": 1, "name": "Alice", "email": "alice@example.com" }],
    "columns": ["id", "name", "email"],
    "rowCount": 1
  },
  "executionInfo": { "time": "11ms", "operation": "SELECT" }
}`} />
                            <Callout type="warning">
                                SQL errors return HTTP <strong>200</strong> with <code className="text-xs">success: false</code>. Always check the <code className="text-xs">success</code> field â€” never rely solely on HTTP status codes.
                            </Callout>
                        </Section>

                        {/* â”€â”€ 4. Language SDKs â”€â”€ */}
                        <Section id="sdks" title="Language SDKs" icon={Code2}>
                            <p>No official SDK required â€” Fluxbase is a plain HTTP API. Copy a snippet for your stack.</p>
                            <Tabs defaultValue="nodejs" className="w-full mt-4">
                                <TabsList className="flex flex-wrap h-auto gap-1.5 bg-secondary border border-border p-1.5 rounded-lg">
                                    {[['Node.js', 'nodejs'], ['Python', 'python'], ['Go', 'go'], ['Rust', 'rust'], ['Java', 'java'], ['PHP', 'php'], ['Ruby', 'ruby'], ['cURL', 'curl']].map(([lang, val]) => (
                                        <TabsTrigger key={val} value={val} className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-all">{lang}</TabsTrigger>
                                    ))}
                                </TabsList>
                                <div className="mt-4">
                                    <TabsContent value="nodejs"><CodeBlock title="fluxbase.js" code={`const BASE = 'https://fluxbase.vercel.app';
const KEY  = process.env.FLUXBASE_API_KEY;
const PROJ = process.env.FLUXBASE_PROJECT_ID;

async function query(sql, params = []) {
  const res = await fetch(\`\${BASE}/api/execute-sql\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${KEY}\` },
    body: JSON.stringify({ projectId: PROJ, query: sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  return data.result.rows;
}

const users = await query('SELECT * FROM users WHERE active = $1', [true]);`} /></TabsContent>

                                    <TabsContent value="python"><CodeBlock title="fluxbase.py" code={`import os, requests

BASE    = 'https://fluxbase.vercel.app'
HEADERS = { 'Authorization': f'Bearer {os.getenv("FLUXBASE_API_KEY")}', 'Content-Type': 'application/json' }

def query(sql, params=None):
    payload = {'projectId': os.getenv('FLUXBASE_PROJECT_ID'), 'query': sql}
    if params: payload['params'] = params
    data = requests.post(f'{BASE}/api/execute-sql', json=payload, headers=HEADERS).json()
    if not data['success']:
        raise Exception(data['error']['message'])
    return data['result']['rows']

users = query('SELECT * FROM users WHERE active = $1', [True])`} /></TabsContent>

                                    <TabsContent value="go"><CodeBlock title="fluxbase.go" code={`func Query(sql string) ([]map[string]any, error) {
    body, _ := json.Marshal(map[string]any{
        "projectId": os.Getenv("FLUXBASE_PROJECT_ID"),
        "query":     sql,
    })
    req, _ := http.NewRequest("POST", "https://fluxbase.vercel.app/api/execute-sql", bytes.NewBuffer(body))
    req.Header.Set("Authorization", "Bearer "+os.Getenv("FLUXBASE_API_KEY"))
    req.Header.Set("Content-Type", "application/json")
    resp, _ := http.DefaultClient.Do(req)
    var result struct {
        Success bool \`json:"success"\`
        Result  struct { Rows []map[string]any \`json:"rows"\` } \`json:"result"\`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Result.Rows, nil
}`} /></TabsContent>

                                    <TabsContent value="rust"><CodeBlock title="main.rs" code={`// Cargo.toml: reqwest = { version = "0.12", features = ["json"] }
use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let resp: Value = reqwest::Client::new()
        .post("https://fluxbase.vercel.app/api/execute-sql")
        .header("Authorization", format!("Bearer {}", std::env::var("FLUXBASE_API_KEY")?))
        .json(&json!({ "projectId": std::env::var("FLUXBASE_PROJECT_ID")?, "query": "SELECT * FROM users LIMIT 5" }))
        .send().await?.json().await?;
    println!("{:#}", resp["result"]["rows"]);
    Ok(())
}`} /></TabsContent>

                                    <TabsContent value="java"><CodeBlock title="FluxbaseClient.java" code={`public class FluxbaseClient {
    public static String query(String sql) throws Exception {
        String body = String.format("{\"projectId\":\"%s\",\"query\":\"%s\"}",
            System.getenv("FLUXBASE_PROJECT_ID"), sql);
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create("https://fluxbase.vercel.app/api/execute-sql"))
            .header("Authorization", "Bearer " + System.getenv("FLUXBASE_API_KEY"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).body();
    }
}`} /></TabsContent>

                                    <TabsContent value="php"><CodeBlock title="Fluxbase.php" code={`<?php
function fluxQuery(string $sql): array {
    $ch = curl_init('https://fluxbase.vercel.app/api/execute-sql');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['projectId' => $_ENV['FLUXBASE_PROJECT_ID'], 'query' => $sql]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $_ENV['FLUXBASE_API_KEY']],
    ]);
    $resp = json_decode(curl_exec($ch), true); curl_close($ch);
    if (!$resp['success']) throw new RuntimeException($resp['error']['message']);
    return $resp['result']['rows'];
}`} /></TabsContent>

                                    <TabsContent value="ruby"><CodeBlock title="fluxbase.rb" code={`def flux_query(sql)
  uri  = URI('https://fluxbase.vercel.app/api/execute-sql')
  http = Net::HTTP.new(uri.host, uri.port).tap { |h| h.use_ssl = true }
  req  = Net::HTTP::Post.new(uri)
  req['Authorization'] = "Bearer #{ENV['FLUXBASE_API_KEY']}"
  req.body = { projectId: ENV['FLUXBASE_PROJECT_ID'], query: sql }.to_json
  data = JSON.parse(http.request(req).body)
  raise data.dig('error', 'message') unless data['success']
  data['result']['rows']
end`} /></TabsContent>

                                    <TabsContent value="curl"><CodeBlock title="Terminal" code={`curl -X POST "https://fluxbase.vercel.app/api/execute-sql" \\
  -H "Authorization: Bearer $FLUXBASE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId":"YOUR_PROJECT_ID","query":"SELECT * FROM users LIMIT 10"}'`} /></TabsContent>
                                </div>
                            </Tabs>
                        </Section>

                        {/* â”€â”€ 5. Real-time â”€â”€ */}
                        <Section id="realtime" title="Real-time (WebSocket)" icon={Globe}>
                            <p>Subscribe to live database events over a persistent WebSocket with built-in exponential-backoff reconnection.</p>
                            <CodeBlock title=".env.local" code={`NEXT_PUBLIC_WS_URL=wss://fluxbase-realtime.onrender.com`} />
                            <Tabs defaultValue="js-rt" className="w-full">
                                <TabsList className="flex flex-wrap h-auto gap-1.5 bg-secondary border border-border p-1.5 rounded-lg">
                                    {[['JavaScript', 'js-rt'], ['Python', 'python-rt'], ['wscat CLI', 'wscat-rt']].map(([l, v]) => (
                                        <TabsTrigger key={v} value={v} className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-all">{l}</TabsTrigger>
                                    ))}
                                </TabsList>
                                <div className="mt-4">
                                    <TabsContent value="js-rt"><CodeBlock title="realtime.js" code={`const WS  = process.env.NEXT_PUBLIC_WS_URL ?? 'wss://fluxbase-realtime.onrender.com';
const PID = 'YOUR_PROJECT_ID';
let delay = 1000;

function connect() {
  const socket = new WebSocket(WS);
  socket.onopen = () => {
    delay = 1000;
    socket.send(JSON.stringify({ type: 'subscribe', roomId: \`project_\${PID}\` }));
  };
  socket.onmessage = ({ data }) => {
    const { type, payload } = JSON.parse(data);
    if (type === 'db_event') {
      console.log(\`[\${payload.operation}] \${payload.table}\`, payload.record);
    }
    if (payload?.event_type === 'schema_update') {
      console.log('Schema changed â€” refresh table list.');
    }
  };
  socket.onclose = () => { setTimeout(connect, delay); delay = Math.min(delay * 2, 15000); };
}
connect();`} /></TabsContent>
                                    <TabsContent value="python-rt"><CodeBlock title="realtime.py" code={`import json, asyncio, websockets

async def listen():
    delay = 1
    while True:
        try:
            async with websockets.connect("wss://fluxbase-realtime.onrender.com") as ws:
                delay = 1
                await ws.send(json.dumps({"type":"subscribe","roomId":"project_YOUR_PROJECT_ID"}))
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("type") == "db_event":
                        p = msg["payload"]
                        print(f"[{p['operation']}] {p['table']}: {p.get('record')}")
        except Exception:
            await asyncio.sleep(delay); delay = min(delay * 2, 15)

asyncio.run(listen())`} /></TabsContent>
                                    <TabsContent value="wscat-rt"><CodeBlock title="Terminal" code={`npm install -g wscat
wscat -c wss://fluxbase-realtime.onrender.com

# Subscribe:
{"type":"subscribe","roomId":"project_YOUR_PROJECT_ID"}

# Events arrive:
{"type":"db_event","payload":{"operation":"INSERT","table":"orders","record":{...}}}`} /></TabsContent>
                                </div>
                            </Tabs>

                            <div className="rounded-lg border border-border overflow-hidden text-sm mt-4">
                                <table className="w-full text-left bg-card">
                                    <thead><tr className="bg-secondary border-b border-border text-xs uppercase tracking-wide text-muted-foreground/75"><th className="px-4 py-3">msg.type</th><th className="px-4 py-3">payload detail</th><th className="px-4 py-3">When it fires</th></tr></thead>
                                    <tbody className="divide-y divide-border/60">
                                        {[
                                            { type: 'subscribed', detail: 'â€”', when: 'Subscription confirmed.' },
                                            { type: 'db_event', detail: 'operation: INSERT', when: 'Row inserted via SQL or Table Editor.' },
                                            { type: 'db_event', detail: 'operation: UPDATE', when: 'Row modified.' },
                                            { type: 'db_event', detail: 'operation: DELETE', when: 'Row deleted.' },
                                            { type: 'db_event', detail: 'event_type: schema_update', when: 'DDL executed (CREATE / DROP / ALTER).' },
                                        ].map((r, i) => (
                                            <tr key={i} className="hover:bg-secondary/70">
                                                <td className="px-4 py-3 font-mono font-bold text-orange-400 text-xs">{r.type}</td>
                                                <td className="px-4 py-3 font-mono text-blue-300 text-xs">{r.detail}</td>
                                                <td className="px-4 py-3 text-muted-foreground text-xs">{r.when}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        {/* â”€â”€ 6. Storage â”€â”€ */}
                        <Section id="storage" title="Storage v2" icon={HardDrive}>
                            <p>AWS S3-backed file storage â€” private by default, with logically isolated buckets and short-lived pre-signed URLs.</p>

                            <h3 className="text-base font-bold text-white mt-2">Bucket Management</h3>
                            <div className="rounded-lg border border-border overflow-hidden text-sm">
                                <table className="w-full text-left bg-card">
                                    <thead><tr className="bg-secondary border-b border-border text-xs uppercase tracking-wide text-muted-foreground/75"><th className="px-4 py-3">Method</th><th className="px-4 py-3">Endpoint</th><th className="px-4 py-3">Action</th></tr></thead>
                                    <tbody className="divide-y divide-border/60">
                                        {[
                                            { m: 'GET', path: '/api/storage/buckets?projectId=â€¦', action: 'List buckets + sizes' },
                                            { m: 'POST', path: '/api/storage/buckets', action: 'Create a bucket' },
                                            { m: 'PATCH', path: '/api/storage/buckets', action: 'Rename a bucket' },
                                            { m: 'DELETE', path: '/api/storage/buckets', action: 'Delete bucket (must be empty)' },
                                        ].map(r => {
                                            const colors: Record<string, string> = { GET: 'text-emerald-400 bg-emerald-500/10', POST: 'text-orange-400 bg-orange-500/10', PATCH: 'text-blue-400 bg-blue-500/10', DELETE: 'text-red-400 bg-red-500/10' };
                                            return (
                                                <tr key={r.m + r.path} className="hover:bg-secondary/70">
                                                    <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded font-bold text-xs font-mono', colors[r.m])}>{r.m}</span></td>
                                                    <td className="px-4 py-3 font-mono text-foreground/85 text-xs">{r.path}</td>
                                                    <td className="px-4 py-3 text-muted-foreground/75 text-xs">{r.action}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <CodeBlock title="POST /api/storage/buckets" code={`{ "projectId": "YOUR_PROJECT_ID", "name": "profile-photos", "isPublic": false }
// Name: lowercase alphanumeric, hyphens, underscores, 1â€“63 chars`} />

                            <h3 className="text-base font-bold text-white mt-6">File Operations</h3>
                            <div className="rounded-lg border border-border overflow-hidden text-sm">
                                <table className="w-full text-left bg-card">
                                    <thead><tr className="bg-secondary border-b border-border text-xs uppercase tracking-wide text-muted-foreground/75"><th className="px-4 py-3">Method</th><th className="px-4 py-3">Endpoint</th><th className="px-4 py-3">Action</th></tr></thead>
                                    <tbody className="divide-y divide-border/60">
                                        {[
                                            { m: 'POST', path: '/api/storage/upload', action: 'Upload (multipart/form-data)' },
                                            { m: 'GET', path: '/api/storage/files?bucketId=â€¦&projectId=â€¦', action: 'List files in bucket' },
                                            { m: 'GET', path: '/api/storage/url?s3Key=â€¦&projectId=â€¦', action: '15-min pre-signed URL (accepts s3Key, fileId, or id)' },
                                            { m: 'DELETE', path: '/api/storage/files', action: 'Delete file (S3 + DB)' },
                                        ].map(r => {
                                            const colors: Record<string, string> = { GET: 'text-emerald-400 bg-emerald-500/10', POST: 'text-orange-400 bg-orange-500/10', DELETE: 'text-red-400 bg-red-500/10' };
                                            return (
                                                <tr key={r.m + r.path} className="hover:bg-secondary/70">
                                                    <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded font-bold text-xs font-mono', colors[r.m])}>{r.m}</span></td>
                                                    <td className="px-4 py-3 font-mono text-foreground/85 text-xs">{r.path}</td>
                                                    <td className="px-4 py-3 text-muted-foreground/75 text-xs">{r.action}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <CodeBlock title="Upload â€” required form fields" code={`curl -X POST "https://fluxbase.vercel.app/api/storage/upload" \\
  -H "Authorization: Bearer $FLUXBASE_API_KEY" \\
  -F "file=@avatar.jpg" \\       # binary file
  -F "bucketId=profile-photos" \\ # bucket UUID or name
  -F "projectId=YOUR_PROJECT_ID"`} />

                            <CodeBlock title="Upload Response" code={`{
  "success": true,
  "file": { "id": "uuid", "name": "avatar.jpg", "s3_key": "proj/bucket/avatar.jpg",
            "size": 204800, "mime_type": "image/jpeg" }
}`} />

                            <CodeBlock title="Delete File â€” Request Body" code={`{
  "fileId": "uuid-from-upload",
  "s3Key": "YOUR_PROJECT_ID/bucket-uuid/avatar.jpg",
  "projectId": "YOUR_PROJECT_ID"
}`} />
                        </Section>

                        {/* â”€â”€ 7. Team â”€â”€ */}
                        <Section id="team-api" title="Team & Invitations" icon={Users}>
                            <p>Manage collaborators and role-based invitations. Requires admin privileges.</p>
                            <h3 className="text-base font-bold text-white">List Members & Invites</h3>
                            <Endpoint method="GET" path="/api/team?projectId=YOUR_PROJECT_ID" />
                            <h3 className="text-base font-bold text-white mt-4">Send an Invitation</h3>
                            <Endpoint method="POST" path="/api/team" />
                            <CodeBlock title="Request Body" code={`{ "projectId": "YOUR_PROJECT_ID", "email": "user@company.com", "role": "developer" }`} />
                            <div className="rounded-lg border border-border overflow-hidden text-sm">
                                <table className="w-full text-left bg-card">
                                    <thead><tr className="bg-secondary border-b border-border text-xs uppercase tracking-wide text-muted-foreground/75"><th className="px-4 py-3">Role</th><th className="px-4 py-3">Permissions</th></tr></thead>
                                    <tbody className="divide-y divide-border/60">
                                        {[
                                            { role: 'admin', perms: 'Full access â€” members, settings, billing, data.' },
                                            { role: 'developer', perms: 'Read/write data & schema. No billing/member management.' },
                                            { role: 'viewer', perms: 'Read-only access to data and dashboard.' },
                                        ].map(r => (
                                            <tr key={r.role} className="hover:bg-secondary/70">
                                                <td className="px-4 py-3 font-mono text-orange-400 text-xs">{r.role}</td>
                                                <td className="px-4 py-3 text-muted-foreground text-xs">{r.perms}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <h3 className="text-base font-bold text-white mt-4">Accept / Reject Invitation</h3>
                            <Endpoint method="POST" path="/api/team/invites/accept" />
                            <CodeBlock title="Request Body" code={`{ "inviteId": "inv_xyz", "status": "accepted" }`} />
                            <h3 className="text-base font-bold text-white mt-4">Remove a Member</h3>
                            <Endpoint method="DELETE" path="/api/team?projectId=YOUR_PROJECT_ID&userId=usr_abc" />
                            <Callout type="info">
                                Invitations are email-case-insensitive. Sending a new invite automatically resets any previous pending, accepted, or rejected state.
                            </Callout>
                        </Section>

                        {/* â”€â”€ 8. Webhooks â”€â”€ */}
                        <Section id="webhooks" title="Webhooks" icon={Webhook}>
                            <p>Outbound HTTP POST sent to your server when data events occur.</p>
                            <CodeBlock title="Webhook Payload" code={`{
  "event_type": "row.inserted",
  "project_id": "YOUR_PROJECT_ID",
  "table_id": "orders",
  "timestamp": "2026-04-14T12:00:00.000Z",
  "data": { "new": { "id": 123, "amount": 59.99 }, "old": null }
}`} />
                            <CodeBlock title="Verify Signature (Node.js)" code={`import crypto from 'crypto';
const sig      = req.headers['x-fluxbase-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.FLUXBASE_WEBHOOK_SECRET)
  .update(rawBody).digest('hex');
if (sig !== expected) return res.status(401).send('Unauthorized');`} />
                        </Section>

                        {/* â”€â”€ 9. Error Codes â”€â”€ */}
                        <Section id="error-codes" title="Error Codes" icon={AlertCircle}>
                            <div className="rounded-lg border border-border overflow-hidden text-sm">
                                <table className="w-full text-left bg-card">
                                    <thead><tr className="bg-secondary border-b border-border text-xs uppercase tracking-wide text-muted-foreground/75"><th className="px-4 py-3">Status</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Fix</th></tr></thead>
                                    <tbody className="divide-y divide-border/60">
                                        {[
                                            { s: '401', code: 'AUTH_REQUIRED', fix: 'Add Authorization: Bearer <key> header.' },
                                            { s: '401', code: 'TOKEN_EXPIRED', fix: 'Re-authenticate to get a fresh token.' },
                                            { s: '403', code: 'SCOPE_MISMATCH', fix: 'API key is not scoped to this project.' },
                                            { s: '403', code: 'INSUFFICIENT_PERMISSIONS', fix: 'Admin role required for this action.' },
                                            { s: '403', code: 'PROJECT_SUSPENDED', fix: 'Check your billing plan status.' },
                                            { s: '404', code: 'PROJECT_NOT_FOUND', fix: 'Verify your projectId value.' },
                                            { s: '404', code: 'USER_NOT_FOUND', fix: 'Invitee must have a Fluxbase account.' },
                                            { s: '429', code: 'RATE_LIMIT', fix: '50 requests per 10s â€” use exponential backoff.' },
                                            { s: '503', code: 'DATABASE_CONNECTION_ERROR', fix: 'Transient DB issue â€” retry with backoff.' },
                                            { s: '200', code: 'SQL_EXEC_ERROR', fix: 'Check error.details for the Postgres error.' },
                                        ].map((e, i) => (
                                            <tr key={i} className="hover:bg-secondary/70">
                                                <td className="px-4 py-3 text-muted-foreground/75 font-mono text-xs">{e.s}</td>
                                                <td className="px-4 py-3 font-mono font-bold text-orange-400 text-xs">{e.code}</td>
                                                <td className="px-4 py-3 text-muted-foreground text-xs">{e.fix}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>

                        {/* â”€â”€ 10. RLS â”€â”€ */}
                        <Section id="rls-tutorial" title="Row Level Security" icon={Shield}>
                            <Callout type="warning">
                                RLS enforces access rules at the database engine level â€” your API can never return data that violates a policy, regardless of the SQL sent.
                            </Callout>
                            <div className="space-y-3 mt-4">
                                {[
                                    { step: '01', t: 'Open RLS Dashboard', d: 'Database â†’ Row Level Security. All tables are listed.' },
                                    { step: '02', t: 'Create a Policy', d: 'Choose command scope (ALL / SELECT / INSERTâ€¦) and write a USING expression.' },
                                    { step: '03', t: 'Enable the Policy', d: 'Toggle ON â†’ runs ALTER TABLE â€¦ ENABLE ROW LEVEL SECURITY.' },
                                    { step: '04', t: 'Test It', d: 'Run SELECT * from the SQL Editor â€” only allowed rows appear.' },
                                ].map(item => (
                                    <div key={item.step} className="flex gap-4 p-4 rounded-lg border border-border bg-secondary/50">
                                        <span className="text-xl font-black text-orange-500/30 font-mono shrink-0 mt-0.5">{item.step}</span>
                                        <div>
                                            <h5 className="font-semibold text-white text-sm mb-1">{item.t}</h5>
                                            <p className="text-xs text-muted-foreground/75">{item.d}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <h3 className="text-base font-bold text-white mt-6">Common Patterns</h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'User owns their rows', code: `user_id = auth.uid()` },
                                    { label: 'Org-scoped (multi-tenant)', code: `org_id = auth.uid()` },
                                    { label: 'Public read', code: `true` },
                                    { label: 'Full lockdown', code: `false` },
                                    { label: 'Type cast fix', code: `user_id::text = auth.uid()` },
                                ].map(item => (
                                    <div key={item.label}>
                                        <p className="text-xs text-muted-foreground/75 mb-1">{item.label}</p>
                                        <CodeBlock code={item.code} />
                                    </div>
                                ))}
                            </div>
                        </Section>

                        {/* Footer */}
                        <div className="pt-12 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-base font-bold text-white">Need more?</p>
                                <p className="text-sm text-muted-foreground/75">Open the full standalone documentation page.</p>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" className="border-border bg-secondary text-foreground/85 hover:bg-muted rounded-lg" asChild>
                                    <a href="/fluxbase-integration-guide.pdf" download><Download className="h-4 w-4 mr-2 text-orange-400" />PDF Guide</a>
                                </Button>
                                <Button className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold shadow-lg shadow-orange-500/20" asChild>
                                    <Link href="/docs" target="_blank"><ExternalLink className="h-4 w-4 mr-2" />Full Docs</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
