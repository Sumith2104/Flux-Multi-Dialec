'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal,
    Database,
    Activity,
    HardDrive,
    Code2,
    Play,
    Sparkles,
    Check,
    Copy,
    ArrowRight,
    Search,
    Shield,
    KeyRound,
    FileText,
    Image as ImageIcon,
    Archive,
    Radio,
    Clock,
    Zap,
    Table as TableIcon,
    RefreshCw,
    Layers,
    Cpu,
    ExternalLink,
    ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ErdCanvas } from '@/components/custom-erd/erd-canvas';
import { type Table, type Column, type Constraint } from '@/lib/data';

// --- SQL PLAYGROUND PRESETS ---
const SQL_PRESETS = [
    {
        id: 'users',
        name: 'Active Enterprise Users',
        sql: `SELECT id, name, email, plan, queries_count, status \nFROM users \nWHERE plan = 'Enterprise' AND status = 'active'\nORDER BY queries_count DESC LIMIT 4;`,
        columns: ['id', 'name', 'email', 'plan', 'queries_count', 'status'],
        rows: [
            { id: 'usr_9410', name: 'Sophia Chen', email: 'sophia@linear.app', plan: 'Enterprise', queries_count: '142,890', status: 'active' },
            { id: 'usr_9411', name: 'Marcus Vance', email: 'marcus@stripe.com', plan: 'Enterprise', queries_count: '118,450', status: 'active' },
            { id: 'usr_9412', name: 'Elena Rostova', email: 'elena@scale.ai', plan: 'Enterprise', queries_count: '98,200', status: 'active' },
            { id: 'usr_9413', name: 'David Kim', email: 'david@cursor.sh', plan: 'Enterprise', queries_count: '84,120', status: 'active' },
        ],
        execTime: '0.48ms',
        rowCount: 4
    },
    {
        id: 'retention',
        name: 'Cohort Aggregation',
        sql: `SELECT date_trunc('month', created_at) AS cohort,\n       COUNT(*) AS new_workspaces,\n       ROUND(AVG(storage_used_mb), 2) AS avg_storage_mb\nFROM workspaces\nGROUP BY 1 ORDER BY 1 DESC LIMIT 4;`,
        columns: ['cohort', 'new_workspaces', 'avg_storage_mb'],
        rows: [
            { cohort: '2026-08-01', new_workspaces: '1,420', avg_storage_mb: '482.50 MB' },
            { cohort: '2026-07-01', new_workspaces: '1,190', avg_storage_mb: '420.10 MB' },
            { cohort: '2026-06-01', new_workspaces: '940', avg_storage_mb: '365.80 MB' },
            { cohort: '2026-05-01', new_workspaces: '780', avg_storage_mb: '310.40 MB' },
        ],
        execTime: '0.72ms',
        rowCount: 4
    },
    {
        id: 'vector',
        name: 'HNSW Vector Cosine Distance',
        sql: `SELECT document_id, title, cosine_similarity(embedding, $1) AS score\nFROM document_embeddings\nWHERE cosine_similarity(embedding, $1) > 0.85\nORDER BY score DESC LIMIT 3;`,
        columns: ['document_id', 'title', 'score'],
        rows: [
            { document_id: 'doc_882', title: 'PostgreSQL Real-time WAL Replication Guide', score: '0.9421' },
            { document_id: 'doc_883', title: 'Zero-Downtime Schema Migration Strategies', score: '0.9104' },
            { document_id: 'doc_884', title: 'Optimizing Tenant Connection Pool Pooling', score: '0.8876' },
        ],
        execTime: '1.14ms',
        rowCount: 3
    }
];

// --- FULL REAL ERD DATA (Same models as used in database page) ---
const DEMO_ERD_TABLES: Table[] = [
    { table_id: 'tbl_users', project_id: 'demo', table_name: 'users', description: 'User authentication and profile accounts', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { table_id: 'tbl_workspaces', project_id: 'demo', table_name: 'workspaces', description: 'Tenant workspaces and permissions', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { table_id: 'tbl_projects', project_id: 'demo', table_name: 'projects', description: 'Database projects and configurations', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { table_id: 'tbl_subscriptions', project_id: 'demo', table_name: 'subscriptions', description: 'Subscription plans and billing', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { table_id: 'tbl_audit_logs', project_id: 'demo', table_name: 'audit_logs', description: 'Security and compliance audit records', created_at: '2026-01-01', updated_at: '2026-01-01' }
];

const DEMO_ERD_COLUMNS: Column[] = [
    // users
    { column_id: 'col_u1', table_id: 'tbl_users', column_name: 'id', data_type: 'uuid' as any, is_primary_key: true, is_nullable: false },
    { column_id: 'col_u2', table_id: 'tbl_users', column_name: 'email', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_u3', table_id: 'tbl_users', column_name: 'display_name', data_type: 'varchar' as any, is_primary_key: false, is_nullable: true },
    { column_id: 'col_u4', table_id: 'tbl_users', column_name: 'role', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_u5', table_id: 'tbl_users', column_name: 'created_at', data_type: 'timestamp' as any, is_primary_key: false, is_nullable: false },

    // workspaces
    { column_id: 'col_w1', table_id: 'tbl_workspaces', column_name: 'id', data_type: 'uuid' as any, is_primary_key: true, is_nullable: false },
    { column_id: 'col_w2', table_id: 'tbl_workspaces', column_name: 'owner_id', data_type: 'uuid' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_w3', table_id: 'tbl_workspaces', column_name: 'name', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_w4', table_id: 'tbl_workspaces', column_name: 'slug', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },

    // projects
    { column_id: 'col_p1', table_id: 'tbl_projects', column_name: 'id', data_type: 'uuid' as any, is_primary_key: true, is_nullable: false },
    { column_id: 'col_p2', table_id: 'tbl_projects', column_name: 'workspace_id', data_type: 'uuid' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_p3', table_id: 'tbl_projects', column_name: 'name', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_p4', table_id: 'tbl_projects', column_name: 'dialect', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_p5', table_id: 'tbl_projects', column_name: 'is_active', data_type: 'boolean' as any, is_primary_key: false, is_nullable: false },

    // subscriptions
    { column_id: 'col_s1', table_id: 'tbl_subscriptions', column_name: 'id', data_type: 'uuid' as any, is_primary_key: true, is_nullable: false },
    { column_id: 'col_s2', table_id: 'tbl_subscriptions', column_name: 'workspace_id', data_type: 'uuid' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_s3', table_id: 'tbl_subscriptions', column_name: 'plan_tier', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_s4', table_id: 'tbl_subscriptions', column_name: 'period_end', data_type: 'timestamp' as any, is_primary_key: false, is_nullable: false },

    // audit_logs
    { column_id: 'col_a1', table_id: 'tbl_audit_logs', column_name: 'id', data_type: 'uuid' as any, is_primary_key: true, is_nullable: false },
    { column_id: 'col_a2', table_id: 'tbl_audit_logs', column_name: 'workspace_id', data_type: 'uuid' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_a3', table_id: 'tbl_audit_logs', column_name: 'actor_id', data_type: 'uuid' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_a4', table_id: 'tbl_audit_logs', column_name: 'action', data_type: 'varchar' as any, is_primary_key: false, is_nullable: false },
    { column_id: 'col_a5', table_id: 'tbl_audit_logs', column_name: 'ip_address', data_type: 'varchar' as any, is_primary_key: false, is_nullable: true },
];

const DEMO_ERD_CONSTRAINTS: Constraint[] = [
    // Primary keys
    { constraint_id: 'pk_users', table_id: 'tbl_users', type: 'PRIMARY KEY', column_names: 'id' },
    { constraint_id: 'pk_workspaces', table_id: 'tbl_workspaces', type: 'PRIMARY KEY', column_names: 'id' },
    { constraint_id: 'pk_projects', table_id: 'tbl_projects', type: 'PRIMARY KEY', column_names: 'id' },
    { constraint_id: 'pk_subscriptions', table_id: 'tbl_subscriptions', type: 'PRIMARY KEY', column_names: 'id' },
    { constraint_id: 'pk_audit_logs', table_id: 'tbl_audit_logs', type: 'PRIMARY KEY', column_names: 'id' },

    // Foreign keys
    { constraint_id: 'fk_workspaces_owner', table_id: 'tbl_workspaces', type: 'FOREIGN KEY', column_names: 'owner_id', referenced_table_id: 'tbl_users', referenced_column_names: 'id' },
    { constraint_id: 'fk_projects_workspace', table_id: 'tbl_projects', type: 'FOREIGN KEY', column_names: 'workspace_id', referenced_table_id: 'tbl_workspaces', referenced_column_names: 'id' },
    { constraint_id: 'fk_subscriptions_workspace', table_id: 'tbl_subscriptions', type: 'FOREIGN KEY', column_names: 'workspace_id', referenced_table_id: 'tbl_workspaces', referenced_column_names: 'id' },
    { constraint_id: 'fk_audit_workspace', table_id: 'tbl_audit_logs', type: 'FOREIGN KEY', column_names: 'workspace_id', referenced_table_id: 'tbl_workspaces', referenced_column_names: 'id' },
    { constraint_id: 'fk_audit_actor', table_id: 'tbl_audit_logs', type: 'FOREIGN KEY', column_names: 'actor_id', referenced_table_id: 'tbl_users', referenced_column_names: 'id' },
];

// --- REAL-TIME TRAFFIC / CDC EVENTS ---
const INITIAL_TRAFFIC_EVENTS = [
    { id: 1, type: 'INSERT', table: 'users', query: 'INSERT INTO users (id, email) VALUES ($1, $2)', region: 'us-east-1', latency: '0.34ms', time: 'Just now' },
    { id: 2, type: 'UPDATE', table: 'projects', query: 'UPDATE projects SET status = $1 WHERE id = $2', region: 'eu-central-1', latency: '0.41ms', time: '1s ago' },
    { id: 3, type: 'SELECT', table: 'tables_meta', query: 'SELECT * FROM tables_meta WHERE project_id = $1', region: 'ap-south-1', latency: '0.22ms', time: '2s ago' },
    { id: 4, type: 'INSERT', table: 'audit_logs', query: 'INSERT INTO audit_logs (action, actor_id) VALUES ($1, $2)', region: 'us-east-1', latency: '0.29ms', time: '3s ago' },
    { id: 5, type: 'DELETE', table: 'sessions', query: 'DELETE FROM sessions WHERE expires_at < NOW()', region: 'us-west-2', latency: '0.51ms', time: '4s ago' },
];

// --- STORAGE BUCKET OBJECTS ---
const STORAGE_FILES = [
    { name: 'user_avatars_archive.tar.gz', bucket: 'public-assets', type: 'archive', size: '24.8 MB', updated: '2026-08-30', cdnUrl: 'https://cdn.fluxbase.dev/assets/avatars.tar.gz' },
    { name: 'q3_financial_compliance_report.pdf', bucket: 'secure-reports', type: 'pdf', size: '4.2 MB', updated: '2026-08-28', cdnUrl: 'https://cdn.fluxbase.dev/reports/q3_compliance.pdf' },
    { name: 'prod_database_backup_20260831.sql', bucket: 'automated-backups', type: 'sql', size: '184.6 MB', updated: '2026-08-31', cdnUrl: 'https://cdn.fluxbase.dev/backups/prod_backup.sql' },
    { name: 'hero_landing_vector_mesh.svg', bucket: 'media-assets', type: 'image', size: '142 KB', updated: '2026-08-25', cdnUrl: 'https://cdn.fluxbase.dev/media/mesh.svg' },
    { name: 'enterprise_contract_template.docx', bucket: 'secure-reports', type: 'doc', size: '890 KB', updated: '2026-08-19', cdnUrl: 'https://cdn.fluxbase.dev/reports/contract.docx' }
];

// --- SDK CODE SAMPLES ---
const CODE_SNIPPETS: Record<string, { lang: string; code: string }> = {
    typescript: {
        lang: 'TypeScript',
        code: `import { createClient } from '@fluxbase/sdk';

const flux = createClient({
  projectId: process.env.FLUXBASE_PROJECT_ID,
  apiKey: process.env.FLUXBASE_API_KEY,
});

// Query tables with end-to-end type safety
const { data, error } = await flux
  .from('users')
  .select('id, name, email, plan')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(20);

// Subscribe to real-time database changes
flux.channel('users-channel')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    console.log('New user joined:', payload.new);
  })
  .subscribe();`
    },
    python: {
        lang: 'Python',
        code: `from fluxbase import FluxbaseClient
import os

client = FluxbaseClient(
    project_id=os.environ.get("FLUXBASE_PROJECT_ID"),
    api_key=os.environ.get("FLUXBASE_API_KEY")
)

# Execute type-safe queries
response = client.table("users") \\
    .select("id, name, email, plan") \\
    .eq("status", "active") \\
    .order("created_at", descending=True) \\
    .limit(20) \\
    .execute()

for user in response.data:
    print(f"User: {user['name']} ({user['email']})")`
    },
    curl: {
        lang: 'cURL / REST API',
        code: `curl -X GET "https://api.fluxbase.dev/v1/projects/$PROJECT_ID/tables/users/rows?pageSize=20&status=eq.active" \\
  -H "Authorization: Bearer $FLUXBASE_API_KEY" \\
  -H "Content-Type: application/json"`
    }
};

export default function InteractiveShowcase() {
    const [activeTab, setActiveTab] = useState<'sql' | 'schema' | 'traffic' | 'storage' | 'sdk'>('sql');

    // SQL Playground State
    const [selectedPreset, setSelectedPreset] = useState(SQL_PRESETS[0]);
    const [editableSql, setEditableSql] = useState(SQL_PRESETS[0].sql);
    const [isExecutingSql, setIsExecutingSql] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    // Traffic State
    const [trafficEvents, setTrafficEvents] = useState(INITIAL_TRAFFIC_EVENTS);

    // SDK State
    const [selectedSdk, setSelectedSdk] = useState<'typescript' | 'python' | 'curl'>('typescript');
    const [isCopied, setIsCopied] = useState(false);

    // Sync SQL text when preset changes
    const handleSelectPreset = (preset: typeof SQL_PRESETS[0]) => {
        setSelectedPreset(preset);
        setEditableSql(preset.sql);
    };

    const handleRunQuery = () => {
        setIsExecutingSql(true);
        setTimeout(() => {
            setIsExecutingSql(false);
        }, 220);
    };

    const handleAiGenerate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiPrompt.trim()) return;
        setIsGeneratingAi(true);
        setTimeout(() => {
            setEditableSql(`-- Generated via Fluxbase AI for: "${aiPrompt}"\nSELECT u.id, u.name, u.email, COUNT(p.id) AS project_count\nFROM users u\nLEFT JOIN projects p ON p.owner_id = u.id\nWHERE u.role = 'developer'\nGROUP BY u.id, u.name, u.email\nHAVING COUNT(p.id) > 2\nORDER BY project_count DESC;`);
            setIsGeneratingAi(false);
            setAiPrompt('');
        }, 400);
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(CODE_SNIPPETS[selectedSdk].code);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 1800);
    };

    // Simulate real-time incoming traffic ticker
    useEffect(() => {
        if (activeTab !== 'traffic') return;
        const interval = setInterval(() => {
            const types = ['SELECT', 'INSERT', 'UPDATE'];
            const tables = ['users', 'workspaces', 'projects', 'audit_logs'];
            const regions = ['us-east-1', 'eu-central-1', 'ap-south-1', 'us-west-2'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const randomTable = tables[Math.floor(Math.random() * tables.length)];
            const randomRegion = regions[Math.floor(Math.random() * regions.length)];
            const randomLat = (Math.random() * 0.4 + 0.18).toFixed(2) + 'ms';

            const newEvent = {
                id: Date.now(),
                type: randomType,
                table: randomTable,
                query: `${randomType} FROM ${randomTable} WHERE id = $1`,
                region: randomRegion,
                latency: randomLat,
                time: 'Just now'
            };

            setTrafficEvents(prev => [newEvent, ...prev.slice(0, 4)]);
        }, 2500);

        return () => clearInterval(interval);
    }, [activeTab]);

    return (
        <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
            {/* Section Header */}
            <div className="text-center space-y-3 mb-8 sm:mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/80 bg-muted/40 text-muted-foreground text-xs font-mono">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span>Interactive Platform Sandbox</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                    Experience Fluxbase in Real Time
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
                    Explore live queries, inspect custom ERD canvas diagrams, watch real-time CDC traffic streams, and browse storage without leaving this page.
                </p>
            </div>

            {/* Navigation Tab Bar */}
            <div className="flex items-center justify-start sm:justify-center overflow-x-auto pb-2 sm:pb-0 mb-6 gap-2 scrollbar-none">
                <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-card/80 border border-border/70 backdrop-blur-xl shadow-lg">
                    <button
                        type="button"
                        onClick={() => setActiveTab('sql')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                            activeTab === 'sql'
                                ? 'bg-primary text-primary-foreground shadow-md font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    >
                        <Terminal className="h-3.5 w-3.5" />
                        <span>Live SQL Studio</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('schema')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                            activeTab === 'schema'
                                ? 'bg-primary text-primary-foreground shadow-md font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    >
                        <Database className="h-3.5 w-3.5" />
                        <span>Schema & ERD</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('traffic')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                            activeTab === 'traffic'
                                ? 'bg-primary text-primary-foreground shadow-md font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    >
                        <Radio className="h-3.5 w-3.5" />
                        <span>Live Traffic & CDC</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('storage')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                            activeTab === 'storage'
                                ? 'bg-primary text-primary-foreground shadow-md font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    >
                        <HardDrive className="h-3.5 w-3.5" />
                        <span>Storage & Assets</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('sdk')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                            activeTab === 'sdk'
                                ? 'bg-primary text-primary-foreground shadow-md font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    >
                        <Code2 className="h-3.5 w-3.5" />
                        <span>API & SDK</span>
                    </button>
                </div>
            </div>

            {/* Showcase Stage Frame */}
            <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden relative">
                {/* Stage Header Info Bar */}
                <div className="h-11 px-4 sm:px-6 bg-muted/40 border-b border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                        </div>
                        <span className="font-mono text-[11px] ml-2 text-foreground/80">
                            {activeTab === 'sql' && 'fluxbase_production > interactive_sql_console'}
                            {activeTab === 'schema' && 'fluxbase_production > custom_erd_canvas'}
                            {activeTab === 'traffic' && 'fluxbase_production > real_time_cdc_telemetry'}
                            {activeTab === 'storage' && 'fluxbase_production > s3_compatible_storage_browser'}
                            {activeTab === 'sdk' && 'fluxbase_production > type_safe_sdk_client'}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                            Active Connection
                        </span>
                    </div>
                </div>

                {/* TAB 1: LIVE SQL STUDIO */}
                {activeTab === 'sql' && (
                    <div className="p-4 sm:p-6 space-y-5">
                        {/* Query Preset Switcher & AI Generator Bar */}
                        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                            {/* Preset Buttons */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground font-mono mr-1">Presets:</span>
                                {SQL_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => handleSelectPreset(preset)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                                            selectedPreset.id === preset.id
                                                ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                                                : 'bg-muted/50 text-muted-foreground hover:text-foreground border border-border/40'
                                        }`}
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>

                            {/* Natural Language Prompt */}
                            <form onSubmit={handleAiGenerate} className="flex items-center gap-1.5">
                                <Input
                                    type="text"
                                    placeholder="Ask AI: e.g. Find developers with >2 projects"
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    className="h-8 text-xs font-mono w-full md:w-64 bg-background/80"
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={isGeneratingAi || !aiPrompt.trim()}
                                    className="h-8 text-xs font-medium shrink-0 bg-primary/90 hover:bg-primary"
                                >
                                    {isGeneratingAi ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                                    Ask AI
                                </Button>
                            </form>
                        </div>

                        {/* SQL Editor Area */}
                        <div className="relative rounded-xl border border-border/70 bg-black/70 p-4 font-mono text-xs overflow-hidden">
                            <textarea
                                value={editableSql}
                                onChange={(e) => setEditableSql(e.target.value)}
                                rows={4}
                                className="w-full bg-transparent text-foreground/90 resize-none focus:outline-none custom-scrollbar font-mono leading-relaxed"
                                spellCheck={false}
                            />
                            <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-2">
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                    <span>Dialect: PostgreSQL 16</span>
                                    <span>•</span>
                                    <span>Execution Plan: Cached</span>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={handleRunQuery}
                                    disabled={isExecutingSql}
                                    className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5"
                                >
                                    {isExecutingSql ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                                    Execute Query
                                </Button>
                            </div>
                        </div>

                        {/* Results Grid */}
                        <div className="rounded-xl border border-border/70 overflow-hidden bg-background/50">
                            <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/50 text-xs font-mono text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Executed in <strong className="text-foreground">{selectedPreset.execTime}</strong></span>
                                </div>
                                <span>{selectedPreset.rowCount} rows returned</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs font-mono">
                                    <thead>
                                        <tr className="border-b border-border/50 bg-muted/20 text-muted-foreground">
                                            {selectedPreset.columns.map((col) => (
                                                <th key={col} className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedPreset.rows.map((row, idx) => (
                                            <tr key={idx} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                                                {selectedPreset.columns.map((col) => (
                                                    <td key={col} className="px-4 py-2.5 text-foreground/90 whitespace-nowrap">
                                                        {col === 'status' ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                {row[col]}
                                                            </span>
                                                        ) : col === 'plan' ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                                                {row[col]}
                                                            </span>
                                                        ) : (
                                                            row[col]
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: EXACT APP ERD CANVAS COMPONENT */}
                {activeTab === 'schema' && (
                    <div className="p-4 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Interactive Database ERD Canvas</h3>
                                <p className="text-xs text-muted-foreground">
                                    Drag table nodes, explore foreign key relationship curves, zoom, pan, and toggle auto-layouts.
                                </p>
                            </div>
                            <Badge variant="secondary" className="font-mono text-xs">
                                5 Tables • 5 Foreign Keys
                            </Badge>
                        </div>

                        {/* Interactive ERD Canvas Component (Identical to Database Page) */}
                        <div className="w-full h-[540px] rounded-xl border border-border/70 overflow-hidden relative bg-black/40 shadow-inner">
                            <ErdCanvas
                                tables={DEMO_ERD_TABLES}
                                columns={DEMO_ERD_COLUMNS}
                                constraints={DEMO_ERD_CONSTRAINTS}
                                projectId="landing-demo"
                            />
                        </div>
                    </div>
                )}

                {/* TAB 3: LIVE TRAFFIC & CDC */}
                {activeTab === 'traffic' && (
                    <div className="p-4 sm:p-6 space-y-6">
                        {/* Traffic Telemetry Metrics Bar */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div className="p-3 rounded-xl border border-border/70 bg-secondary/20">
                                <div className="text-[11px] text-muted-foreground font-mono">Global Queries / Sec</div>
                                <div className="text-xl font-bold text-foreground font-mono mt-1">48,250 QPS</div>
                                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">+14% vs last hour</div>
                            </div>
                            <div className="p-3 rounded-xl border border-border/70 bg-secondary/20">
                                <div className="text-[11px] text-muted-foreground font-mono">P99 Edge Latency</div>
                                <div className="text-xl font-bold text-foreground font-mono mt-1">3.8 ms</div>
                                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">Optimal routing</div>
                            </div>
                            <div className="p-3 rounded-xl border border-border/70 bg-secondary/20">
                                <div className="text-[11px] text-muted-foreground font-mono">Active Connection Pool</div>
                                <div className="text-xl font-bold text-foreground font-mono mt-1">128 / 500</div>
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Pooled via PgBouncer</div>
                            </div>
                            <div className="p-3 rounded-xl border border-border/70 bg-secondary/20">
                                <div className="text-[11px] text-muted-foreground font-mono">CDC Replication Lag</div>
                                <div className="text-xl font-bold text-foreground font-mono mt-1">0.12 ms</div>
                                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">Zero lag stream</div>
                            </div>
                        </div>

                        {/* Live Event Stream Ticker */}
                        <div className="rounded-xl border border-border/70 bg-black/60 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/50 text-xs font-mono">
                                <div className="flex items-center gap-2">
                                    <Radio className="h-3.5 w-3.5 text-red-400 animate-pulse" />
                                    <span className="font-semibold text-foreground">Live Transaction Feed (CDC)</span>
                                </div>
                                <span className="text-muted-foreground text-[11px]">Streaming live events</span>
                            </div>

                            <div className="divide-y divide-border/30 font-mono text-xs">
                                <AnimatePresence>
                                    {trafficEvents.map((evt) => (
                                        <motion.div
                                            key={evt.id}
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="px-4 py-2.5 flex items-center justify-between hover:bg-muted/20 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    evt.type === 'INSERT'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                        : evt.type === 'UPDATE'
                                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                }`}>
                                                    {evt.type}
                                                </span>
                                                <span className="text-foreground/90 font-medium">{evt.query}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                                                <span className="hidden sm:inline font-mono">{evt.region}</span>
                                                <span className="text-emerald-400 font-medium">{evt.latency}</span>
                                                <span>{evt.time}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 4: STORAGE & ASSETS */}
                {activeTab === 'storage' && (
                    <div className="p-4 sm:p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">S3-Compatible Object Store</h3>
                                <p className="text-xs text-muted-foreground">Manage media, exports, and automated database backups with global CDN edge delivery.</p>
                            </div>
                            <Badge variant="secondary" className="font-mono text-xs">
                                214.2 MB / 100 GB Used
                            </Badge>
                        </div>

                        {/* Files List Table */}
                        <div className="rounded-xl border border-border/70 overflow-hidden bg-background/50">
                            <table className="w-full text-left text-xs font-mono">
                                <thead>
                                    <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                                        <th className="px-4 py-2.5 font-semibold text-[11px] uppercase">Object Name</th>
                                        <th className="px-4 py-2.5 font-semibold text-[11px] uppercase">Bucket</th>
                                        <th className="px-4 py-2.5 font-semibold text-[11px] uppercase">Size</th>
                                        <th className="px-4 py-2.5 font-semibold text-[11px] uppercase">Updated</th>
                                        <th className="px-4 py-2.5 font-semibold text-[11px] uppercase text-right">CDN URL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {STORAGE_FILES.map((file) => (
                                        <tr key={file.name} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-2.5 font-medium text-foreground flex items-center gap-2">
                                                {file.type === 'image' && <ImageIcon className="h-3.5 w-3.5 text-blue-400" />}
                                                {file.type === 'pdf' && <FileText className="h-3.5 w-3.5 text-red-400" />}
                                                {file.type === 'sql' && <Database className="h-3.5 w-3.5 text-emerald-400" />}
                                                {file.type === 'archive' && <Archive className="h-3.5 w-3.5 text-amber-400" />}
                                                {file.type === 'doc' && <FileText className="h-3.5 w-3.5 text-purple-400" />}
                                                <span>{file.name}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{file.bucket}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{file.size}</td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{file.updated}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(file.cdnUrl)}
                                                    className="inline-flex items-center gap-1 text-primary hover:underline text-[11px]"
                                                >
                                                    <span>Copy CDN Link</span>
                                                    <Copy className="h-3 w-3" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB 5: SDK & CODE CLIENT */}
                {activeTab === 'sdk' && (
                    <div className="p-4 sm:p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedSdk('typescript')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                                        selectedSdk === 'typescript'
                                            ? 'bg-primary text-primary-foreground font-semibold'
                                            : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    TypeScript
                                </button>
                                <button
                                    onClick={() => setSelectedSdk('python')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                                        selectedSdk === 'python'
                                            ? 'bg-primary text-primary-foreground font-semibold'
                                            : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Python
                                </button>
                                <button
                                    onClick={() => setSelectedSdk('curl')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                                        selectedSdk === 'curl'
                                            ? 'bg-primary text-primary-foreground font-semibold'
                                            : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    cURL / REST
                                </button>
                            </div>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCopyCode}
                                className="h-8 text-xs font-medium gap-1.5 border-border/70"
                            >
                                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                {isCopied ? 'Copied' : 'Copy Snippet'}
                            </Button>
                        </div>

                        {/* Code Block Container */}
                        <div className="rounded-xl border border-border/70 bg-black/80 p-4 font-mono text-xs overflow-x-auto text-foreground/90 leading-relaxed custom-scrollbar">
                            <pre>
                                <code>{CODE_SNIPPETS[selectedSdk].code}</code>
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
