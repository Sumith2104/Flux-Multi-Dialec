import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

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

        {/* 4 Quick Provisioning Cards */}
        <div>
          <Skeleton className="h-4 w-36 mb-3" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-border/80 bg-card/40 flex flex-col justify-between p-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-4/5 mb-3" />
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
            ))}
          </div>
        </div>

        {/* Workspaces Section 1 */}
        <div className="space-y-4">
          <div className="border-b border-border/60 pb-3 space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Workspaces Section 2 */}
        <div className="space-y-4 pt-2">
          <div className="border-b border-border/60 pb-3 space-y-1.5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card className="border-border/80 bg-card/40 p-6 flex flex-col justify-between space-y-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
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
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-32 rounded" />
        </div>
      </div>

      {/* 4 Stat / Metric Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((idx) => (
          <Card key={idx} className="p-4 border-border/80 bg-card/40 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </div>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="pt-4">
              <Skeleton className="h-10 w-full rounded" />
            </div>
          </Card>
        ))}
      </div>

      {/* 2 Main Dashboard Panels */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        <Card className="lg:col-span-8 p-6 border-border/80 bg-card/40 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
            <Skeleton className="h-8 w-28 rounded" />
          </div>
          <Skeleton className="h-64 w-full rounded" />
        </Card>

        <Card className="lg:col-span-4 p-6 border-border/80 bg-card/40 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3.5 w-48 max-w-full" />
            </div>
            <Skeleton className="h-7 w-16 rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/30 border border-border/40 space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
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
   3. TABLE EDITOR SKELETON
   ========================================================================== */
export function TableEditorSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background animate-in fade-in duration-300">
      
      {/* Sidebar: Schema Explorer */}
      <aside className="w-64 flex-shrink-0 border-r border-border/70 bg-card/20 flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        <Skeleton className="h-8 w-full rounded" />

        <div className="space-y-1.5 flex-1 pt-2">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div 
              key={idx} 
              className="flex items-center justify-between px-2.5 py-2 rounded bg-secondary/20 border border-transparent"
            >
              <div className="flex items-center gap-2 flex-1">
                <Skeleton className="h-3.5 w-3.5 rounded shrink-0" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="h-3.5 w-8 rounded" />
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
              <Skeleton className="h-4 w-4 rounded" />
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
          <div className="grid grid-cols-12 border-b border-border/80 bg-secondary/40 text-xs">
            <div className="col-span-1 p-2.5 border-r border-border/60 flex justify-center">
              <Skeleton className="h-3.5 w-3" />
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3.5 w-10 rounded" />
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3.5 w-10 rounded" />
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3.5 w-12 rounded" />
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3.5 w-12 rounded" />
            </div>
            <div className="col-span-2 p-2.5 border-r border-border/60 flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3.5 w-10 rounded" />
            </div>
            <div className="col-span-1 p-2.5 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
            </div>
          </div>

          {/* 10 Spreadsheet Grid Data Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((row) => (
              <div key={row} className="grid grid-cols-12 items-center py-2.5">
                <div className="col-span-1 p-2.5 border-r border-border/40 flex justify-center">
                  <Skeleton className="h-3.5 w-3" />
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
                  <Skeleton className="h-4 w-16 rounded" />
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
        <div className="h-10 border-t border-border/70 px-4 flex items-center justify-between bg-card/20">
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
   4. DATABASE SCHEMA / ERD SKELETON
   ========================================================================== */
export function DatabaseErdSkeleton() {
  return (
    <div className="h-full w-full relative overflow-hidden bg-background animate-in fade-in duration-300">
      
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
        
        {/* Table Node 1 */}
        <div className="w-72 rounded-xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md overflow-hidden transform -translate-y-8">
          <div className="p-3 bg-secondary/70 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3.5 w-12 rounded" />
          </div>
          <div className="divide-y divide-border/40 p-2 space-y-1">
            {[1, 2, 3, 4].map(col => (
              <div key={col} className="flex items-center justify-between py-1.5 px-1">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-3 rounded" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>

        {/* Table Node 2 */}
        <div className="w-72 rounded-xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md overflow-hidden transform translate-y-6">
          <div className="p-3 bg-secondary/70 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-3.5 w-12 rounded" />
          </div>
          <div className="divide-y divide-border/40 p-2 space-y-1">
            {[1, 2, 3, 4, 5].map(col => (
              <div key={col} className="flex items-center justify-between py-1.5 px-1">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-3 rounded" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ==========================================================================
   5. SQL QUERY STUDIO SKELETON
   ========================================================================== */
export function SqlStudioSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background animate-in fade-in duration-300">
      {/* Top Query Editor Header & Toolbar */}
      <div className="h-11 border-b border-border/70 px-4 flex items-center justify-between bg-card/30">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-24 rounded" />
          <Skeleton className="h-7 w-28 rounded" />
        </div>
      </div>

      {/* SQL Editor Area with gutter */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Line numbers gutter */}
        <div className="w-10 border-r border-border/50 bg-secondary/20 py-3 flex flex-col items-center space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <Skeleton key={n} className="h-3 w-3" />
          ))}
        </div>
        {/* Code statements placeholder */}
        <div className="flex-1 p-4 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>

      {/* Bottom Query Results Pane */}
      <div className="h-56 border-t border-border/70 flex flex-col bg-card/20">
        <div className="h-9 border-b border-border/60 px-4 flex items-center justify-between bg-secondary/30">
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-lg" />
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
                    <Skeleton className="h-4 w-4 rounded" />
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
              <Skeleton className="h-5 w-5 rounded" />
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
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
            <Skeleton className="h-9 w-full rounded" />
            <Skeleton className="h-9 w-full rounded" />
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
      {/* Top Header */}
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

      {/* Grid of Analytics Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 flex-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="border-border/80 bg-card/40 p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <div className="h-48 flex items-center justify-center p-2">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
