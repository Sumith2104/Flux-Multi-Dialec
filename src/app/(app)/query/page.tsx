'use client';

import { useState, useContext, useEffect, useCallback } from 'react';
import { Bot, Play, Trash2, History as HistoryIcon, Layout, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SqlEditor } from '@/components/sql-editor';
import { QueryResults } from '@/components/query-results';
import { QueryHistory, HistoryItem } from '@/components/query-history';
import { BackButton } from '@/components/back-button';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { getTablesForProject, Table as DbTable } from '@/lib/data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export default function QueryPage() {
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // Mobile drawer
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop sidebar
  const [query, setQuery] = useState('SELECT * FROM your_table_name LIMIT 100;');

  // Structured Response State
  const [queryResponse, setQueryResponse] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [tables, setTables] = useState<DbTable[]>([]);
  const [activeTab, setActiveTab] = useState('results');

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const { project } = useContext(ProjectContext);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchSchema() {
      if (project) {
        const projectTables = await getTablesForProject(project.project_id);
        setTables(projectTables);
      }
    }
    fetchSchema();
  }, [project]);

  // Load History
  useEffect(() => {
    const saved = localStorage.getItem('queryHistory');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { }
    }
  }, []);

  const addToHistory = (queryStr: string, success: boolean) => {
    const newItem: HistoryItem = { id: crypto.randomUUID(), query: queryStr, timestamp: Date.now(), success };
    // Use functional update to ensure we have the latest history in closure if needed, though simpler here
    setHistory(prev => {
      const newHistory = [newItem, ...prev].slice(0, 50);
      localStorage.setItem('queryHistory', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    if (confirm('Clear all history?')) {
      setHistory([]);
      localStorage.removeItem('queryHistory');
    }
  };

  const handleRunQuery = useCallback(async () => {
    const queryToExecute = query.trim();
    if (!queryToExecute) {
      toast({ variant: 'destructive', title: 'Error', description: 'Query cannot be empty.' });
      return;
    }
    if (!project) {
      toast({ variant: 'destructive', title: 'Error', description: 'No project selected.' });
      return;
    }

    setIsExecuting(true);
    setQueryResponse(null);
    setActiveTab('results');

    try {
      const response = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.project_id, query: queryToExecute }),
      });

      const data = await response.json();

      addToHistory(queryToExecute, data.success);

      if (data.success) {
        setQueryResponse(data);
      } else {
        setQueryResponse(data);
        setActiveTab('messages');
      }

    } catch (e: any) {
      console.error("Failed to execute query:", e);
      setQueryResponse({
        success: false,
        error: { message: e.message || "An unexpected network error occurred.", code: 'NETWORK_ERROR' }
      });
      setActiveTab('messages');
      addToHistory(queryToExecute, false);
    } finally {
      setIsExecuting(false);
    }
  }, [query, project, toast]); // Dependency on history removed as we use functional update now

  const handleResetDatabase = async () => {
    if (!project) return;
    if (!confirm('Are you certain you want to reset the database? This will delete ALL tables and data.')) return;

    try {
      const res = await fetch('/api/reset-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.project_id })
      });
      if (!res.ok) throw new Error('Failed to reset');
      toast({ title: 'Success', description: 'Database has been reset.' });
      setTables([]);
      setQueryResponse(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to reset database.' });
    }
  };

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-4">
          <BackButton />
          <h1 className="text-xl font-bold">SQL Editor</h1>
          {project?.dialect && <Badge variant="secondary" className="uppercase">{project.dialect}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetDatabase} className="text-destructive hover:text-destructive hidden sm:flex">
            <Trash2 className="mr-2 h-4 w-4" /> Reset DB
          </Button>

          {/* Mobile History Toggle */}
          <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden">
                <HistoryIcon className="mr-2 h-4 w-4" /> History
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Query History</SheetTitle>
              </SheetHeader>
              <div className="h-full py-4">
                <QueryHistory history={history} onSelectQuery={setQuery} onClearHistory={clearHistory} />
              </div>
            </SheetContent>
          </Sheet>

          {/* Desktop Sidebar Toggle */}
          <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>

          <Sheet open={isAiAssistantOpen} onOpenChange={setIsAiAssistantOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Bot className="mr-2 h-4 w-4" />
                AI Help
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle>AI Assistant</SheetTitle>
              </SheetHeader>
              <div className="py-4">
                <Alert>
                  <Bot className="h-4 w-4" />
                  <AlertTitle>Start coding!</AlertTitle>
                  <AlertDescription>
                    I can help you write queries for {project?.dialect || 'SQL'}.
                  </AlertDescription>
                </Alert>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="flex-grow flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-grow flex gap-4 p-4 overflow-hidden h-full w-full">

          <ResizablePanelGroup direction="horizontal" className="h-full w-full border rounded-lg">
            <ResizablePanel defaultSize={75} className="flex flex-col gap-4 p-2">
              {/* Editor Top */}
              <ResizablePanelGroup direction="vertical">
                <ResizablePanel defaultSize={40} className="border rounded-md bg-card flex flex-col">
                  <div className="p-2 border-b flex justify-between items-center bg-muted/20 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">Editor</span>
                    <Button size="sm" onClick={handleRunQuery} disabled={isExecuting} className="h-7 text-xs">
                      <Play className="mr-2 h-3 w-3" /> {isExecuting ? 'Running...' : 'Run (Ctrl+Enter)'}
                    </Button>
                  </div>
                  <div className="flex-grow overflow-hidden">
                    <SqlEditor
                      onRun={handleRunQuery}
                      query={query}
                      setQuery={setQuery}
                      isGenerating={isExecuting}
                      results={queryResponse?.result || {}}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={60} className="border rounded-md bg-card flex flex-col mt-2">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                    <div className="flex items-center justify-between px-4 border-b bg-muted/20 shrink-0">
                      <TabsList className="bg-transparent p-0 h-10">
                        <TabsTrigger value="results" className="data-[state=active]:bg-background rounded-none border-b-2 border-transparent data-[state=active]:border-primary transition-none h-10 px-4">
                          Results
                        </TabsTrigger>
                        <TabsTrigger value="explanation" className="data-[state=active]:bg-background rounded-none border-b-2 border-transparent data-[state=active]:border-primary transition-none h-10 px-4">
                          Explanation
                        </TabsTrigger>
                        <TabsTrigger value="messages" className="data-[state=active]:bg-background rounded-none border-b-2 border-transparent data-[state=active]:border-primary transition-none h-10 px-4">
                          Messages {queryResponse?.success === false && <Badge variant="destructive" className="ml-2 h-4 px-1">!</Badge>}
                        </TabsTrigger>
                      </TabsList>
                      {queryResponse?.executionInfo && (
                        <div className="text-xs text-muted-foreground hidden sm:block">
                          {queryResponse.executionInfo.time} • {queryResponse.executionInfo.rowCount} rows
                        </div>
                      )}
                    </div>

                    <div className="flex-grow overflow-hidden relative">
                      <TabsContent value="results" className="h-full m-0 p-0 absolute inset-0">
                        {queryResponse?.success ? (
                          <QueryResults
                            results={queryResponse.result}
                            error={null}
                            isGenerating={false}
                          />
                        ) : (
                          <div className="p-8 text-center text-muted-foreground h-full flex items-center justify-center">
                            {queryResponse?.success === false ? "Query failed." : "Run a query to see results."}
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="explanation" className="h-full m-0 p-4 overflow-auto absolute inset-0">
                        {queryResponse?.explanation ? (
                          <div className="space-y-4">
                            <h3 className="text-sm font-semibold mb-2">Query Execution Plan</h3>
                            <ul className="space-y-2">
                              {queryResponse.explanation.map((line: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm p-2 rounded hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                                  <span className="bg-primary/10 text-primary font-mono text-xs h-5 w-5 flex items-center justify-center rounded-full shrink-0 mt-0.5">{i + 1}</span>
                                  <span>{line}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No explanation available.</div>
                        )}
                      </TabsContent>
                      <TabsContent value="messages" className="h-full m-0 p-4 overflow-auto absolute inset-0">
                        {queryResponse?.error ? (
                          <Alert variant="destructive">
                            <AlertTitle className="font-mono text-base">{queryResponse.error.code}</AlertTitle>
                            <AlertDescription>
                              <p className="font-mono text-sm mb-4 mt-2">{queryResponse.error.message}</p>
                              {queryResponse.error.hint && (
                                <div className="mt-2 text-sm bg-destructive/10 p-3 rounded border border-destructive/20">
                                  <strong>💡 Hint:</strong> {queryResponse.error.hint}
                                </div>
                              )}
                            </AlertDescription>
                          </Alert>
                        ) : queryResponse?.result?.message ? (
                          <Alert className="bg-primary/5 border-primary/20">
                            <AlertTitle className="text-primary">Success</AlertTitle>
                            <AlertDescription>{queryResponse.result.message}</AlertDescription>
                          </Alert>
                        ) : (
                          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No messages.</div>
                        )}
                      </TabsContent>
                    </div>
                  </Tabs>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            {isSidebarOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="hidden lg:flex flex-col bg-card border rounded-md">
                  <QueryHistory
                    history={history}
                    onSelectQuery={setQuery}
                    onClearHistory={clearHistory}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>

        </div>
      </div>
    </div>
  );
}
