import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/* ==========================================================================
   1. PROJECTS & WORKSPACES SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function ProjectsPageSkeleton() {
  return (
    <div className="flex flex-col items-center justify-start min-h-full bg-background p-4 sm:p-8 animate-in fade-in duration-300 space-y-8">
      <div className="w-full max-w-7xl space-y-8">
        
        {/* Main & Sub Main Header */}
        <div className="border-b border-border/50 pb-6 space-y-2">
          <Skeleton className="h-8 w-64 sm:w-80" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        {/* Quick Provisioning Section - Main & Sub Main Lines */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-36" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-border/80 bg-card/40 p-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
              </Card>
            ))}
          </div>
        </div>

        {/* Workspaces Section 1 - Main & Sub Main */}
        <div className="space-y-4">
          <div className="border-b border-border/60 pb-3 space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/80 bg-card/40 p-6 space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Workspaces Section 2 - Main & Sub Main */}
        <div className="space-y-4 pt-2">
          <div className="border-b border-border/60 pb-3 space-y-1.5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <Card key={i} className="border-border/80 bg-card/40 p-6 space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ==========================================================================
   2. DASHBOARD PAGE SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function DashboardPageSkeleton() {
  return (
    <div className="container mx-auto px-0 space-y-6 animate-in fade-in duration-300">
      {/* Main & Sub Main Header */}
      <div className="space-y-2 pb-4 border-b border-border/50">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* 4 Stat Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((idx) => (
          <Card key={idx} className="p-5 border-border/80 bg-card/40 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3.5 w-36" />
          </Card>
        ))}
      </div>

      {/* 2 Main Dashboard Panels */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        <Card className="lg:col-span-8 p-6 border-border/80 bg-card/40 space-y-4">
          <div className="space-y-1.5 pb-3 border-b border-border/50">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-md" />
        </Card>

        <Card className="lg:col-span-4 p-6 border-border/80 bg-card/40 space-y-4">
          <div className="space-y-1.5 pb-3 border-b border-border/50">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-48 max-w-full" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/30 border border-border/40 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==========================================================================
   3. TABLE EDITOR SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function TableEditorSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background animate-in fade-in duration-300">
      
      {/* Sidebar: Schema Explorer */}
      <aside className="w-64 flex-shrink-0 border-r border-border/70 bg-card/20 flex flex-col p-3 gap-3">
        <div className="pb-2 border-b border-border/50 space-y-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-40" />
        </div>

        <div className="space-y-2 flex-1 pt-1">
          {[1, 2, 3, 4, 5, 6, 7].map((idx) => (
            <div key={idx} className="p-2 rounded bg-secondary/20 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main Canvas */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        
        {/* Top Header: Main & Sub Main */}
        <div className="h-14 border-b border-border/70 px-4 flex flex-col justify-center bg-card/30 space-y-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-56" />
        </div>

        {/* Data Table Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column Header Row */}
          <div className="grid grid-cols-12 border-b border-border/80 bg-secondary/40 py-2.5 px-3">
            <div className="col-span-1 border-r border-border/60 pr-2 flex justify-center"><Skeleton className="h-3.5 w-3" /></div>
            <div className="col-span-3 px-3 border-r border-border/60"><Skeleton className="h-4 w-24" /></div>
            <div className="col-span-3 px-3 border-r border-border/60"><Skeleton className="h-4 w-28" /></div>
            <div className="col-span-3 px-3 border-r border-border/60"><Skeleton className="h-4 w-20" /></div>
            <div className="col-span-2 pl-3"><Skeleton className="h-4 w-16" /></div>
          </div>

          {/* 10 Data Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((row) => (
              <div key={row} className="grid grid-cols-12 items-center py-3 px-3">
                <div className="col-span-1 border-r border-border/40 pr-2 flex justify-center"><Skeleton className="h-3.5 w-3" /></div>
                <div className="col-span-3 px-3 border-r border-border/40"><Skeleton className="h-3.5 w-3/4" /></div>
                <div className="col-span-3 px-3 border-r border-border/40"><Skeleton className="h-3.5 w-2/3" /></div>
                <div className="col-span-3 px-3 border-r border-border/40"><Skeleton className="h-3.5 w-1/2" /></div>
                <div className="col-span-2 pl-3"><Skeleton className="h-3.5 w-3/4" /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status Line - Main & Sub Main */}
        <div className="h-10 border-t border-border/70 px-4 flex items-center justify-between bg-card/20">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
      </main>

    </div>
  );
}

/* ==========================================================================
   4. DATABASE SCHEMA / ERD SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function DatabaseErdSkeleton() {
  return (
    <div className="h-full w-full relative overflow-hidden bg-background p-6 space-y-6 animate-in fade-in duration-300">
      {/* Main & Sub Main Header */}
      <div className="space-y-1.5 pb-4 border-b border-border/60">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* ERD Table Nodes */}
      <div className="flex items-center justify-center gap-12 p-8">
        {[1, 2].map((node) => (
          <div key={node} className="w-72 rounded-xl border border-border/80 bg-card/90 shadow-lg overflow-hidden space-y-3 p-4">
            <div className="space-y-1 pb-2 border-b border-border/60">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((col) => (
                <div key={col} className="flex justify-between items-center py-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   5. SQL QUERY STUDIO SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function SqlStudioSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background animate-in fade-in duration-300">
      {/* Main & Sub Main Header */}
      <div className="h-14 border-b border-border/70 px-4 flex flex-col justify-center bg-card/30 space-y-1">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3.5 w-60" />
      </div>

      {/* SQL Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-10 border-r border-border/50 bg-secondary/20 py-3 flex flex-col items-center space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Skeleton key={n} className="h-3 w-3" />
          ))}
        </div>
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Query Results Pane */}
      <div className="h-52 border-t border-border/70 flex flex-col bg-card/20 p-4 space-y-3">
        <div className="space-y-1 pb-2 border-b border-border/50">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-44" />
        </div>
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   6. STORAGE PAGE SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function StoragePageSkeleton() {
  return (
    <div className="max-w-full space-y-6 overflow-x-hidden pb-12 animate-in fade-in duration-300">
      {/* Main & Sub Main Header */}
      <div className="space-y-1.5 pb-4 border-b border-border/60">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Buckets + Files Panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[600px]">
        {/* Left Buckets Column */}
        <Card className="md:col-span-4 lg:col-span-3 border-border/80 bg-card/40 flex flex-col p-4 space-y-3">
          <div className="space-y-1 pb-2 border-b border-border/60">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div className="space-y-2 flex-1 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </Card>

        {/* Right Files Grid */}
        <Card className="md:col-span-8 lg:col-span-9 border-border/80 bg-card/40 flex flex-col p-5 space-y-4">
          <div className="space-y-1 pb-3 border-b border-border/60">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3.5 w-52" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 flex-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="p-3 rounded-lg border border-border/50 bg-secondary/20 space-y-2">
                <Skeleton className="h-28 w-full rounded" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
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
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function SettingsLimitsSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Card className="border-border/80 bg-card/40">
        <CardHeader className="space-y-1.5 pb-4 border-b border-border/50">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-3 w-72" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-3 w-64" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ==========================================================================
   8. SETTINGS GENERAL SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function SettingsGeneralSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-border/60 pb-4 space-y-1.5">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/80 bg-card/40 p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>

        <Card className="border-border/80 bg-card/40 p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==========================================================================
   9. API PAGE SKELETON
   Main and sub-main structure only (no button skeletons)
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
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        </Card>

        <Card className="border-border/80 bg-card/40 p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-4 rounded-lg bg-secondary/30 border border-border/40 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==========================================================================
   10. ANALYTICS DASHBOARD SKELETON
   Main and sub-main structure only (no button skeletons)
   ========================================================================== */
export function AnalyticsDashboardSkeleton() {
  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
      {/* Main & Sub Main Header */}
      <div className="space-y-1.5 border-b border-border/60 pb-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Grid of Analytics Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 flex-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="border-border/80 bg-card/40 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-1 pb-3 border-b border-border/50">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="h-44 flex items-center justify-center p-2">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
