import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  Database, 
  Table as TableIcon, 
  HardDrive, 
  Terminal, 
  Sparkles, 
  ShieldAlert, 
  Folder, 
  Key, 
  Layers, 
  Maximize2,
  Plus,
  Search,
  ArrowRight,
  Bot,
  Github
} from 'lucide-react';

/* ==========================================================================
   1. PROJECTS & WORKSPACES SKELETON
   ========================================================================== */
export function ProjectsPageSkeleton() {
  return (
    <div className="flex flex-col items-center justify-start min-h-full bg-background p-4 sm:p-8 animate-in fade-in duration-300 space-y-8">
      <div className="w-full max-w-7xl space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 sm:w-80" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="w-full md:w-72">
            <Skeleton className="h-9 w-full" />
          </div>
        </div>

        {/* 4 Quick Actions & Provisioning Cards */}
        <div>
          <Skeleton className="h-3.5 w-44 mb-3" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { badge: 'PostgreSQL', icon: Database, color: 'text-blue-400' },
              { badge: 'MySQL', icon: Database, color: 'text-orange-400' },
              { badge: 'MCP Integration', icon: Bot, color: 'text-purple-400' },
              { badge: 'Git Import', icon: Github, color: 'text-emerald-400' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <Card key={i} className="relative overflow-hidden border-border/80 bg-card/40 flex flex-col justify-between p-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 rounded-xl bg-secondary/80 border border-border/70 text-muted-foreground">
                        <Icon className={`h-6 w-6 ${item.color} opacity-70`} />
                      </div>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-5 w-4/5 mb-2" />
                    <div className="space-y-1.5 mt-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                  <div className="pt-6">
                    <Skeleton className="h-9 w-full rounded" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* PostgreSQL Workspaces Section */}
        <div className="space-y-4">
          <div className="border-b border-border/60 pb-3 space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <ProjectCardSkeleton key={i} dialect="PostgreSQL" dialectColor="bg-blue-500/10 border-blue-500/20 text-blue-400" />
            ))}
          </div>
        </div>

        {/* MySQL Workspaces Section */}
        <div className="space-y-4 pt-2">
          <div className="border-b border-border/60 pb-3 space-y-1.5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <ProjectCardSkeleton key={i} dialect="MySQL" dialectColor="bg-orange-500/10 border-orange-500/20 text-orange-400" />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function ProjectCardSkeleton({ dialect, dialectColor }: { dialect: string; dialectColor: string }) {
  return (
    <Card className="relative overflow-hidden border-border/80 bg-card/40 p-6 flex flex-col justify-between space-y-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-secondary/80 border border-border/70">
              <Database className="h-5 w-5 text-orange-400/70" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32" />
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${dialectColor}`}>
                  {dialect}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
                  Active
                </span>
              </div>
            </div>
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 mt-5 p-3 rounded-lg bg-secondary/30 border border-border/50">
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>

      {/* Action Buttons Footer */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
        <Skeleton className="h-8 w-full rounded" />
        <Skeleton className="h-8 w-full rounded" />
        <Skeleton className="h-8 w-full rounded" />
      </div>
    </Card>
  );
}

/* ==========================================================================
   2. DASHBOARD PAGE SKELETON
   ========================================================================== */
export function DashboardPageSkeleton() {
  return (
    <div className="container mx-auto px-0 space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-36" />
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-40"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-32 rounded" />
        </div>
      </div>

      {/* 4 Sparkline Analytics Cards in One Single Row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: API Calls */}
        <Card className="p-4 border-border/80 bg-card/40 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="h-14 flex items-end gap-1.5 pt-3">
            {[40, 65, 30, 80, 55, 90, 45, 70, 85, 60, 95, 75].map((h, idx) => (
              <div 
                key={idx} 
                className="flex-1 rounded-t bg-orange-500/20 skeleton-shimmer" 
                style={{ height: `${h}%` }} 
              />
            ))}
          </div>
        </Card>

        {/* Card 2: Real-Time Activity */}
        <Card className="p-4 border-border/80 bg-card/40 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-28" />
              <span className="h-2 w-2 rounded-full bg-emerald-500/80 animate-pulse" />
            </div>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="h-14 flex items-end gap-1.5 pt-3">
            {[50, 45, 60, 75, 55, 80, 65, 85, 70, 90, 80, 95].map((h, idx) => (
              <div 
                key={idx} 
                className="flex-1 rounded-t bg-orange-500/20 skeleton-shimmer" 
                style={{ height: `${h}%` }} 
              />
            ))}
          </div>
        </Card>

        {/* Card 3: Query Breakdown */}
        <Card className="p-4 border-border/80 bg-card/40 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-2 pt-3">
            <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden flex">
              <div className="w-[50%] bg-orange-500/60" />
              <div className="w-[30%] bg-blue-500/60" />
              <div className="w-[20%] bg-emerald-500/60" />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          </div>
        </Card>

        {/* Card 4: Live Sessions */}
        <Card className="p-4 border-border/80 bg-card/40 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-24" />
              <span className="h-2 w-2 rounded-full bg-emerald-500/80 animate-pulse" />
            </div>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="h-14 flex items-end gap-1.5 pt-3">
            {[30, 45, 55, 60, 70, 65, 80, 75, 85, 90, 85, 95].map((h, idx) => (
              <div 
                key={idx} 
                className="flex-1 rounded-t bg-emerald-500/20 skeleton-shimmer" 
                style={{ height: `${h}%` }} 
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Tables List Card */}
      <Card className="border-border/80 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-48 rounded" />
        </CardHeader>
        <CardContent>
          <div className="border border-border/60 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-secondary/50 border-b border-border/60 text-xs font-medium">
              <div className="col-span-4"><Skeleton className="h-4 w-24" /></div>
              <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
              <div className="col-span-4"><Skeleton className="h-4 w-32" /></div>
              <div className="col-span-2 text-right"><Skeleton className="h-4 w-16 ml-auto" /></div>
            </div>
            {/* Table Rows */}
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="grid grid-cols-12 gap-4 px-4 py-3.5 border-b border-border/40 items-center">
                <div className="col-span-4 flex items-center gap-2">
                  <TableIcon className="h-4 w-4 text-orange-400/60" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="col-span-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="col-span-4">
                  <Skeleton className="h-4 w-48" />
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  <Skeleton className="h-7 w-7 rounded" />
                  <Skeleton className="h-7 w-7 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==========================================================================
   3. TABLE EDITOR SKELETON
   ========================================================================== */
export function TableEditorSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background animate-in fade-in duration-300">
      
      {/* Sidebar: Schema Explorer */}
      <aside className="w-64 flex-shrink-0 border-r border-border/70 bg-card/20 flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-orange-400/70" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        <Skeleton className="h-8 w-full rounded" />

        <div className="space-y-1.5 flex-1 pt-2">
          {[
            { name: 'users', rows: '1.2k' },
            { name: 'orders', rows: '840' },
            { name: 'order_items', rows: '2.4k' },
            { name: 'products', rows: '310' },
            { name: 'audit_logs', rows: '12.8k' },
            { name: 'sessions', rows: '95' },
          ].map((table, idx) => (
            <div 
              key={idx} 
              className={`flex items-center justify-between px-2.5 py-2 rounded border ${
                idx === 0 
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' 
                  : 'border-transparent bg-secondary/20'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <TableIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono truncate">{table.name}</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {table.rows}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border/50">
          <Skeleton className="h-8 w-full rounded" />
        </div>
      </aside>

      {/* Main Canvas: Table Spreadsheet Grid */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        
        {/* Top Table Toolbar */}
        <div className="h-12 border-b border-border/70 px-4 flex items-center justify-between bg-card/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-orange-400" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded" />
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>

        {/* Data Table Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column Header Row */}
          <div className="grid grid-cols-12 border-b border-border/80 bg-secondary/60 text-xs font-mono font-medium">
            <div className="col-span-1 p-2.5 border-r border-border/60 text-center text-muted-foreground">#</div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Key className="h-3 w-3 text-amber-400" />
                <span className="font-semibold text-foreground">id</span>
              </div>
              <span className="text-[10px] text-muted-foreground px-1 bg-secondary rounded">uuid</span>
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <span className="font-semibold text-foreground">email</span>
              <span className="text-[10px] text-muted-foreground px-1 bg-secondary rounded">text</span>
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <span className="font-semibold text-foreground">full_name</span>
              <span className="text-[10px] text-muted-foreground px-1 bg-secondary rounded">varchar</span>
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <span className="font-semibold text-foreground">status</span>
              <span className="text-[10px] text-muted-foreground px-1 bg-secondary rounded">varchar</span>
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <span className="font-semibold text-foreground">metadata</span>
              <span className="text-[10px] text-muted-foreground px-1 bg-secondary rounded">jsonb</span>
            </div>
            <div className="col-span-1 p-2.5 flex items-center justify-between">
              <span className="font-semibold text-foreground">created_at</span>
            </div>
          </div>

          {/* 10 Spreadsheet Grid Data Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40 font-mono text-xs">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((row) => (
              <div key={row} className="grid grid-cols-12 items-center hover:bg-secondary/20">
                <div className="col-span-1 p-2.5 border-r border-border/40 text-center text-muted-foreground/60 select-none">
                  {row}
                </div>
                <div className="col-span-2 p-2.5 border-r border-border/40">
                  <Skeleton className="h-3.5 w-32" />
                </div>
                <div className="col-span-2 p-2.5 border-r border-border/40">
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="col-span-2 p-2.5 border-r border-border/40">
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <div className="col-span-2 p-2.5 border-r border-border/40">
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="col-span-2 p-2.5 border-r border-border/40">
                  <Skeleton className="h-3.5 w-20" />
                </div>
                <div className="col-span-1 p-2.5">
                  <Skeleton className="h-3.5 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status & Pagination Bar */}
        <div className="h-10 border-t border-border/70 px-4 flex items-center justify-between bg-card/20 text-xs font-mono text-muted-foreground">
          <Skeleton className="h-4 w-44" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16 rounded" />
            <Skeleton className="h-7 w-16 rounded" />
          </div>
        </div>

      </main>
    </div>
  );
}

/* ==========================================================================
   4. DATABASE ERD CANVAS SKELETON
   ========================================================================== */
export function DatabaseErdSkeleton() {
  return (
    <div className="h-full w-full relative overflow-hidden bg-background dot-grid-bg animate-in fade-in duration-300">
      
      {/* Top Floating Action Toolbar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-secondary/85 p-1.5 rounded-lg border border-border/70 backdrop-blur-md pointer-events-auto">
          <Skeleton className="h-7 w-32 rounded" />
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-24 rounded" />
        </div>

        <div className="flex items-center gap-2 bg-secondary/85 p-1.5 rounded-lg border border-border/70 backdrop-blur-md pointer-events-auto">
          <Skeleton className="h-7 w-24 rounded" />
          <Skeleton className="h-7 w-28 rounded" />
        </div>
      </div>

      {/* ERD Floating Table Nodes */}
      <div className="absolute inset-0 p-12 flex items-center justify-center gap-12 sm:gap-20 overflow-hidden">
        
        {/* Table Node 1: Users */}
        <div className="w-72 rounded-xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md overflow-hidden transform -translate-y-8">
          <div className="p-3 bg-secondary/70 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-semibold text-foreground font-mono">users</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">4 cols</span>
          </div>
          <div className="divide-y divide-border/40 font-mono text-xs p-2 space-y-1">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5">
                <Key className="h-3 w-3 text-amber-400" />
                <span className="text-foreground">id</span>
              </div>
              <span className="text-[10px] text-muted-foreground">uuid</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-foreground pl-4">email</span>
              <span className="text-[10px] text-muted-foreground">text</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-foreground pl-4">full_name</span>
              <span className="text-[10px] text-muted-foreground">varchar</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-foreground pl-4">created_at</span>
              <span className="text-[10px] text-muted-foreground">timestamp</span>
            </div>
          </div>
        </div>

        {/* Table Node 2: Orders */}
        <div className="w-72 rounded-xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md overflow-hidden transform translate-y-6">
          <div className="p-3 bg-secondary/70 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-orange-400" />
              <span className="text-xs font-semibold text-foreground font-mono">orders</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">5 cols</span>
          </div>
          <div className="divide-y divide-border/40 font-mono text-xs p-2 space-y-1">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5">
                <Key className="h-3 w-3 text-amber-400" />
                <span className="text-foreground">id</span>
              </div>
              <span className="text-[10px] text-muted-foreground">uuid</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-purple-400" />
                <span className="text-foreground">user_id</span>
              </div>
              <span className="text-[10px] text-muted-foreground">uuid (FK)</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-foreground pl-4">amount</span>
              <span className="text-[10px] text-muted-foreground">numeric</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-foreground pl-4">status</span>
              <span className="text-[10px] text-muted-foreground">varchar</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-foreground pl-4">created_at</span>
              <span className="text-[10px] text-muted-foreground">timestamp</span>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Controls Overlay */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-secondary/85 p-1.5 rounded-lg border border-border/70 backdrop-blur-md z-20">
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-7 w-7 rounded" />
      </div>

    </div>
  );
}

/* ==========================================================================
   5. SQL STUDIO SKELETON
   ========================================================================== */
export function SqlStudioSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background animate-in fade-in duration-300">
      {/* Top Query Editor Header & Toolbar */}
      <div className="h-11 border-b border-border/70 px-4 flex items-center justify-between bg-card/30">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-orange-400" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-24 rounded" />
          <Skeleton className="h-7 w-28 rounded" />
        </div>
      </div>

      {/* SQL Editor Area with line numbers */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Line numbers gutter */}
        <div className="w-12 border-r border-border/50 bg-secondary/30 py-3 text-center text-xs font-mono text-muted-foreground/40 space-y-2 select-none">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
            <div key={n}>{n}</div>
          ))}
        </div>
        {/* Code statements placeholder */}
        <div className="flex-1 p-4 space-y-3 font-mono">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 bg-blue-500/20" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-14 bg-blue-500/20" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 bg-blue-500/20" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-10 bg-blue-500/20" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-20 bg-blue-500/20" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-14 bg-blue-500/20" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>

      {/* Bottom Query Results Pane */}
      <div className="h-56 border-t border-border/70 flex flex-col bg-card/20">
        <div className="h-9 border-b border-border/60 px-4 flex items-center justify-between bg-secondary/40">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 p-4">
          <div className="grid grid-cols-4 gap-3 mb-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   6. STORAGE PAGE SKELETON
   ========================================================================== */
export function StoragePageSkeleton() {
  return (
    <div className="max-w-full space-y-4 overflow-x-hidden pb-12 animate-in fade-in duration-300">
      {/* Header & Metrics Strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-7 w-7 text-orange-400" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-44 rounded" />
          <Skeleton className="h-8 w-28 rounded" />
        </div>
      </div>

      {/* Buckets + Files Panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[650px]">
        {/* Left Buckets Column */}
        <Card className="md:col-span-4 lg:col-span-3 border-border/80 bg-card/40 flex flex-col p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-16 rounded" />
          </div>
          <Skeleton className="h-8 w-full rounded" />
          <div className="space-y-2 flex-1 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-2.5 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-orange-400/70" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-12 rounded" />
                </div>
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </Card>

        {/* Right Files Grid */}
        <Card className="md:col-span-8 lg:col-span-9 border-border/80 bg-card/40 flex flex-col p-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-orange-400" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-40 rounded" />
              <Skeleton className="h-8 w-16 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 flex-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="p-3 rounded-lg border border-border/50 bg-secondary/20 flex flex-col justify-between space-y-3">
                <Skeleton className="h-24 w-full rounded" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==========================================================================
   7. SETTINGS LIMITS SKELETON
   ========================================================================== */
export function SettingsLimitsSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Card className="border-border/80 bg-card/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <ShieldAlert className="h-8 w-8 text-orange-500 opacity-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-72" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
          <div className="pt-4 border-t border-border/60 flex justify-end">
            <Skeleton className="h-10 w-32 rounded" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==========================================================================
   8. SETTINGS GENERAL SKELETON
   ========================================================================== */
export function SettingsGeneralSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-border/60 pb-4 space-y-1.5">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/80 bg-card/40 p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-3 pt-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </Card>

        <Card className="border-border/80 bg-card/40 p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/50 flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/40 p-6 space-y-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-3 sm:grid-cols-3 pt-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ==========================================================================
   9. API PAGE SKELETON
   ========================================================================== */
export function ApiPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-border/60 pb-4 space-y-1.5">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-6">
        <Card className="border-border/80 bg-card/40 p-6 space-y-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <div className="space-y-3 pt-2">
            <Skeleton className="h-11 w-full rounded" />
            <Skeleton className="h-11 w-full rounded" />
            <Skeleton className="h-11 w-full rounded" />
          </div>
        </Card>

        <Card className="border-border/80 bg-card/40 p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==========================================================================
   10. ANALYTICS DASHBOARD SKELETON
   ========================================================================== */
export function AnalyticsDashboardSkeleton() {
  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/60 pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>

      {/* Analytics Tabs Strip */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Grid of Analytics Widget Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 flex-1">
        {[
          { title: 'API Requests Over Time', type: 'line' },
          { title: 'Query Execution Latency (ms)', type: 'bar' },
          { title: 'Read vs Write Operations', type: 'donut' },
          { title: 'Active Client Connections', type: 'area' },
          { title: 'Storage Volume Consumed', type: 'progress' },
          { title: 'Cache Hit Ratio (%)', type: 'metric' },
        ].map((w, idx) => (
          <Card key={idx} className="border-border/80 bg-card/40 p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <span className="text-xs font-semibold text-foreground font-mono">{w.title}</span>
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <div className="h-48 flex items-center justify-center p-2">
              {w.type === 'line' || w.type === 'area' ? (
                <div className="w-full h-full flex items-end gap-1.5 pt-4">
                  {[35, 50, 45, 60, 75, 55, 80, 70, 85, 90, 80, 95].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-orange-500/20 skeleton-shimmer" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : w.type === 'bar' ? (
                <div className="w-full h-full flex items-end gap-3 px-4 pt-4">
                  {[60, 85, 45, 95, 70, 80].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-blue-500/20 skeleton-shimmer" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 w-full">
                  <div className="h-28 w-28 rounded-full border-4 border-dashed border-orange-500/30 skeleton-shimmer flex items-center justify-center">
                    <Skeleton className="h-8 w-14" />
                  </div>
                  <Skeleton className="h-3 w-32" />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

