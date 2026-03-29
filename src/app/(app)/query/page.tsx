'use client';

import { useGlobalAlert } from '@/components/global-alert-provider';

import { useState, useContext, useEffect, useCallback } from 'react';
import { Play, Trash2, History as HistoryIcon, Sparkles, Layout, ChevronRight, ChevronLeft, Table2, ListRestart, Info, Database, AlertCircle, CheckCircle2, TerminalSquare, Bot, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { SqlEditor } from '@/components/sql-editor';
import { QueryResults } from '@/components/query-results';
import { QueryHistory, HistoryItem } from '@/components/query-history';
import { SchemaExplorer } from '@/components/schema-explorer';
import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { generateSQLAction } from '@/actions/ai-sql-actions';

export default function QueryPage() {

  const [query, setQuery] = useState('SELECT * FROM your_table_name LIMIT 100;');
  const [isQueryLoaded, setIsQueryLoaded] = useState(false);
  const [queryResponse, setQueryResponse] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeResultsTab, setActiveResultsTab] = useState('results');

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isGeneratingSQL, setIsGeneratingSQL] = useState(false);
  const [isExecutingAI, setIsExecutingAI] = useState(false);

  const { project } = useContext(ProjectContext);
  const { toast } = useToast();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile(); // Check right away on mount
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!project?.project_id) {
      setHistory([]);
      return;
    }
    const saved = localStorage.getItem(`queryHistory_${project.project_id}`);
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch { }
    } else {
      setHistory([]);
    }
  }, [project?.project_id]);

  // Persist Editor Query
  useEffect(() => {
    if (!project?.project_id) {
      setQuery('SELECT * FROM your_table_name LIMIT 100;');
      setIsQueryLoaded(true);
      return;
    }
    setIsQueryLoaded(false);
    const savedQuery = localStorage.getItem(`sqlQuery_${project.project_id}`);
    if (savedQuery !== null) {
      setQuery(savedQuery);
    } else {
      setQuery('SELECT * FROM your_table_name LIMIT 100;');
    }
    setIsQueryLoaded(true);
  }, [project?.project_id]);

  useEffect(() => {
    if (isQueryLoaded && project?.project_id) {
      localStorage.setItem(`sqlQuery_${project.project_id}`, query);
    }
  }, [query, isQueryLoaded, project?.project_id]);

  const addToHistory = (queryStr: string, success: boolean) => {
    if (!project?.project_id) return;
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      query: queryStr,
      timestamp: Date.now(),
      success
    };

    setHistory(prev => {
      const newHistory = [newItem, ...prev].slice(0, 50);
      localStorage.setItem(`queryHistory_${project.project_id}`, JSON.stringify(newHistory));
      return newHistory;
    });
  };


  const { showConfirm } = useGlobalAlert();

  // ...

  const clearHistory = async () => {
    if (!project?.project_id) return;
    const confirmed = await showConfirm('Are you sure you want to clear all query history?', {
      title: 'Clear History',
      variant: 'destructive',
      confirmText: 'Clear History'
    });

    if (confirmed) {
      setHistory([]);
      localStorage.removeItem(`queryHistory_${project.project_id}`);
    }
  };

  const handleRunQuery = useCallback(async (queryOverride?: string | React.MouseEvent) => {

    const queryToExecute = typeof queryOverride === 'string' ? queryOverride : query;

    if (!queryToExecute.trim()) {
      toast({ variant: 'destructive', title: 'Query cannot be empty' });
      return;
    }

    setIsExecuting(true);
    setQueryResponse(null);
    setActiveResultsTab('results');

    try {
      const response = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project?.project_id, query: queryToExecute })
      });

      const data = await response.json();
      addToHistory(queryToExecute, data.success);
      setQueryResponse(data);

      if (!data.success) {
        setActiveResultsTab('messages');
      }

    } catch (e: any) {
      setQueryResponse({
        success: false,
        error: { message: e.message, code: 'NETWORK_ERROR' }
      });
      addToHistory(queryToExecute, false);
      setActiveResultsTab('messages');
    }

    setIsExecuting(false);

  }, [query, project, toast]);

  const handleGenerateSQL = async () => {
    if (!aiInput.trim()) return;
    if (!project?.project_id) {
      toast({ variant: 'destructive', title: 'Start a project first.' });
      return;
    }

    setIsGeneratingSQL(true);
    try {
      const result = await generateSQLAction(project.project_id, aiInput);

      if (result.success && result.query) {
        setQuery(result.query);
        if (result.isDangerous) {
            toast({ variant: "destructive", title: "Dangerous Query Flagged", description: result.warning || "Please review carefully." });
        } else {
            toast({ title: "Query Generated", description: "Review the query in the editor." });
        }
        setAiInput(''); // Clear input on success
      } else {
        toast({ variant: "destructive", title: "Generation Failed", description: result.error });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Failed to connect to AI service." });
    } finally {
      setIsGeneratingSQL(false);
    }
  };

  const handleDirectExecute = async () => {
    if (!aiInput.trim()) return;
    if (!project?.project_id) {
      toast({ variant: 'destructive', title: 'Start a project first.' });
      return;
    }

    setIsExecutingAI(true);
    try {
      const result = await generateSQLAction(project.project_id, aiInput);

      if (result.success && result.query) {
        setQuery(result.query);
        
        if (result.isDangerous) {
            const confirmed = await showConfirm(
                `WARNING: ${result.warning || 'This query modifies or deletes data.'}\n\nDo you want to proceed and execute this query anyway?`, 
                {
                    title: 'Dangerous Query Flagged',
                    confirmText: 'Execute Anyway',
                    variant: 'destructive'
                }
            );
            if (!confirmed) {
                toast({ title: "Execution Cancelled", description: "The query was populated in the editor but not executed." });
                setAiInput('');
                return;
            }
        }

        toast({ title: "Query Generated & Executed", description: "Executing query..." });
        setAiInput('');
        // Execute immediately with the new query
        handleRunQuery(result.query);
      } else {
        toast({ variant: "destructive", title: "Generation Failed", description: result.error });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Failed to connect to AI service." });
    } finally {
      setIsExecutingAI(false);
    }
  };

  return (
    <div className="h-[calc(100vh-57px)] w-full p-2 bg-background">
      <ResizablePanelGroup
        direction="vertical"
        className="h-full w-full rounded-md border bg-card shadow-sm overflow-hidden"
        key="layout-v1-vertical" // Force re-render if direction changed and wasn't picked up
      >

        {/* === TOP ROW: Editor (Left) | History/AI (Right) === */}
        <ResizablePanel defaultSize={60} minSize={30} className="flex flex-col">
          <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="h-full w-full">

            {/* 1. LEFT SIDEBAR: Schema Explorer */}
            <ResizablePanel defaultSize={20} minSize={15} className="flex flex-col border-r bg-muted/5 min-w-[200px]">
              <SchemaExplorer projectId={project?.project_id} onInsertQuery={setQuery} />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 2. MAIN: SQL Editor */}
            <ResizablePanel defaultSize={55} minSize={30} className="flex flex-col border-r bg-muted/5">
              <div className="h-10 flex items-center justify-between px-3 border-b bg-muted/20 shrink-0">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground/80">{project?.dialect || 'SQL'}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50 rotate-90" />
                  <span className="text-xs text-muted-foreground font-mono">Editor</span>
                </div>
                {/* Advanced Editor Toolbar Placeholder */}
                <div className="flex items-center gap-2">
                  {/* Toolbars will be mounted here in the next step */}
                </div>
              </div>
              <div className="flex-grow overflow-hidden relative">
                <SqlEditor
                  projectId={project?.project_id}
                  query={query}
                  setQuery={setQuery}
                  onRun={handleRunQuery}
                  isGenerating={isExecuting}
                  results={queryResponse?.result}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 3. RIGHT: History & AI */}
            <ResizablePanel
              defaultSize={30}
              minSize={20}
              className="flex flex-col min-h-0 bg-muted/5 min-w-[250px]"
            >
              <Tabs
                defaultValue="history"
                className="flex flex-col h-full min-h-0"
              >
                {/* Tabs Header */}
                <div className="h-10 border-b flex items-center px-2 shrink-0">
                  <TabsList className="bg-transparent p-0 h-full gap-2">
                    <TabsTrigger value="history" className="h-8 text-xs px-3">
                      <HistoryIcon className="h-3.5 w-3.5 mr-1.5" />
                      History
                    </TabsTrigger>

                    <TabsTrigger value="ai" className="h-8 text-xs px-3">
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      AI Assistant
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* HISTORY CONTENT */}
                <TabsContent
                  value="history"
                  className="flex-1 min-h-0 m-0 p-0 data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <div className="flex items-center justify-between p-2 border-b shrink-0">
                    <h3 className="text-xs font-medium px-2 py-1 text-muted-foreground">Recent Queries</h3>
                    {history.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive px-2"
                        onClick={clearHistory}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Clear
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 p-2">
                    <QueryHistory
                      history={history}
                      onSelectQuery={setQuery}
                      onClearHistory={clearHistory}
                    />
                  </div>
                </TabsContent>

                {/* AI CONTENT */}
                <TabsContent
                  value="ai"
                  className="flex-1 min-h-0 p-4"
                >
                  <div className="h-full flex flex-col gap-4">
                    <Textarea
                      placeholder="Describe your query..."
                      className="flex-1 resize-none"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                    />

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={handleGenerateSQL}
                        disabled={isGeneratingSQL || isExecutingAI || !aiInput.trim()}
                      >
                        {isGeneratingSQL ? <MoreHorizontal className="h-4 w-4 mr-2 animate-pulse" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                        {isGeneratingSQL ? "Generating..." : "Generate"}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={handleDirectExecute}
                        disabled={isGeneratingSQL || isExecutingAI || !aiInput.trim()}
                      >
                        {isExecutingAI ? <MoreHorizontal className="h-4 w-4 mr-2 animate-pulse" /> : <Play className="h-3.5 w-3.5 mr-2" />}
                        {isExecutingAI ? "Executing..." : "Execute"}
                      </Button>
                    </div>

                    <div className="text-[10px] text-muted-foreground text-center opacity-70">
                      AI can make mistakes. Review the generated query before running.
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </ResizablePanel>


          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* === BOTTOM ROW: Results (Full Width) === */}
        <ResizablePanel defaultSize={40} minSize={20} className="flex flex-col bg-background">
          <Tabs value={activeResultsTab} onValueChange={setActiveResultsTab} className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 border-b bg-muted/10 shrink-0 h-10">
              <TabsList className="bg-transparent p-0 h-full gap-2">
                <TabsTrigger value="results" className="h-full px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs text-muted-foreground data-[state=active]:text-foreground font-medium">
                  Results
                </TabsTrigger>
                <TabsTrigger value="explanation" className="h-full px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs text-muted-foreground data-[state=active]:text-foreground font-medium">
                  Explanation
                </TabsTrigger>
                <TabsTrigger value="messages" className="h-full px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs text-muted-foreground data-[state=active]:text-foreground font-medium">
                  Messages  {queryResponse?.success === false && <Badge variant="destructive" className="ml-1 h-3.5 w-3.5 p-0 text-[8px] flex items-center justify-center rounded-full">!</Badge>}
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {queryResponse?.executionInfo && (
                  <span className="flex items-center gap-1 font-mono text-[10px] opacity-70">
                    <Info className="h-3 w-3" />
                    {queryResponse.executionInfo.time} / {queryResponse.executionInfo.rowCount} rows
                  </span>
                )}
              </div>
            </div>

            <div className="flex-grow overflow-hidden relative bg-muted/5">
              <TabsContent value="results" className="h-full m-0 p-0 absolute inset-0">
                {queryResponse?.success ? (
                  <QueryResults results={queryResponse.result} error={null} isGenerating={false} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 opacity-40">
                    <Table2 className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm font-medium">Execute a query to view results</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="explanation" className="h-full m-0 p-4 overflow-auto absolute inset-0">
                {queryResponse?.explanation ? (
                  <div className="space-y-4 w-full">
                    <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
                      {queryResponse.explanation.map((line: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-2.5 border-b last:border-0 border-border/40 hover:bg-muted/50 font-mono text-xs">
                          <span className="text-muted-foreground w-6 text-right select-none opacity-50">{i + 1}</span>
                          <span className="text-foreground/90">{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-60">
                    <ListRestart className="h-8 w-8 mb-2 opacity-20" />
                    No execution plan available
                  </div>
                )}
              </TabsContent>

              <TabsContent value="messages" className="h-full m-0 p-4 overflow-auto absolute inset-0">
                {queryResponse?.error ? (
                  <div className="w-full mt-4">
                    <Alert variant="destructive" className="border-red-900/50 bg-red-900/10 shadow-sm text-red-500">
                      <AlertCircle className="h-5 w-5" />
                      <AlertTitle className="font-mono text-sm font-bold flex items-center gap-2">
                        Execution Failed
                      </AlertTitle>
                      <AlertDescription className="mt-3">
                        <div className="font-mono text-sm p-3 bg-red-950/30 rounded border border-red-900/30">
                          {queryResponse.error.message}
                        </div>
                        {queryResponse.error.hint && (
                          <div className="mt-4 flex gap-2 text-xs opacity-90">
                            <span className="font-bold uppercase tracking-wider shrink-0">Suggestion:</span>
                            <span>{queryResponse.error.hint}</span>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : queryResponse?.result?.message ? (
                  <Alert className="bg-green-500/10 border-green-500/20 text-green-600 w-full mt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertTitle className="font-medium">Success</AlertTitle>
                    </div>
                    <AlertDescription className="mt-2 font-mono text-sm pl-6 opacity-90">
                      {queryResponse.result.message}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-60">
                    <TerminalSquare className="h-8 w-8 mb-2 opacity-20" />
                    No active messages
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  );
}
