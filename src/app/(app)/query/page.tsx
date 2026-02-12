
'use client';

import { useState, useContext, useEffect, useCallback } from 'react';
import { Play, Trash2, History as HistoryIcon, Sparkles, Layout, ChevronRight, ChevronLeft, Table2, ListRestart, Info, Database, AlertCircle, CheckCircle2, TerminalSquare, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { SqlEditor } from '@/components/sql-editor';
import { QueryResults } from '@/components/query-results';
import { QueryHistory, HistoryItem } from '@/components/query-history';

import { ProjectContext } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { generateSQLAction } from '@/actions/ai-sql-actions';

export default function QueryPage() {

  const [query, setQuery] = useState('SELECT * FROM your_table_name LIMIT 100;');
  const [queryResponse, setQueryResponse] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeResultsTab, setActiveResultsTab] = useState('results');

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const { project } = useContext(ProjectContext);
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem('queryHistory');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch { }
    }
  }, []);

  const addToHistory = (queryStr: string, success: boolean) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      query: queryStr,
      timestamp: Date.now(),
      success
    };

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

    setIsGeneratingAI(true);
    try {
      const result = await generateSQLAction(project.project_id, aiInput);

      if (result.success && result.query) {
        setQuery(result.query);
        toast({ title: "Query Generated", description: "Review the query in the editor." });
        setAiInput(''); // Clear input on success
      } else {
        toast({ variant: "destructive", title: "Generation Failed", description: result.error });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Failed to connect to AI service." });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleDirectExecute = async () => {
    if (!aiInput.trim()) return;
    if (!project?.project_id) {
      toast({ variant: 'destructive', title: 'Start a project first.' });
      return;
    }

    setIsGeneratingAI(true);
    try {
      const result = await generateSQLAction(project.project_id, aiInput);

      if (result.success && result.query) {
        setQuery(result.query);
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
      setIsGeneratingAI(false);
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
          <ResizablePanelGroup direction="horizontal" className="h-full w-full">

            {/* LEFT: SQL Editor */}
            <ResizablePanel defaultSize={70} minSize={40} className="flex flex-col border-r bg-[#1e1e2e]/40">
              <div className="h-10 flex items-center justify-between px-3 border-b bg-muted/20 shrink-0">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground/80">{project?.dialect || 'SQL'}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50 rotate-90" />
                  <span className="text-xs text-muted-foreground font-mono">Editor</span>
                </div>
                {/* Run button is inside SqlEditor usually, but we can put controls here too if needed */}
              </div>
              <div className="flex-grow overflow-hidden relative">
                <SqlEditor
                  query={query}
                  setQuery={setQuery}
                  onRun={handleRunQuery}
                  isGenerating={isExecuting}
                  results={queryResponse?.result}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* RIGHT: History & AI */}
            <ResizablePanel defaultSize={30} minSize={20} className="flex flex-col bg-muted/5 min-w-[250px]">
              <Tabs defaultValue="history" className="h-full flex flex-col">
                <div className="h-10 border-b flex items-center px-2 bg-transparent shrink-0">
                  <TabsList className="bg-transparent p-0 h-full gap-2">
                    <TabsTrigger value="history" className="h-8 text-xs px-3 data-[state=active]:bg-muted data-[state=active]:shadow-none rounded-md border border-transparent data-[state=active]:border-border/50">
                      <HistoryIcon className="h-3.5 w-3.5 mr-1.5" /> History
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="h-8 text-xs px-3 data-[state=active]:bg-muted data-[state=active]:shadow-none rounded-md border border-transparent data-[state=active]:border-border/50">
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Assistant
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="history" className="flex-grow overflow-hidden m-0 p-0 relative">
                  <div className="absolute inset-0 overflow-hidden flex flex-col">
                    <div className="p-2 border-b flex justify-between items-center bg-muted/10 shrink-0">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Recent Queries</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" onClick={clearHistory} title="Clear">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex-grow overflow-auto">
                      <QueryHistory
                        history={history}
                        onSelectQuery={setQuery}
                        onClearHistory={clearHistory}
                      />
                      {history.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground text-xs opacity-60">
                          No history yet.
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="ai" className="flex-grow overflow-hidden m-0 p-4 relative flex flex-col gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="h-4 w-4 text-primary" />
                      AI Query Assistant
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Describe what data you want to retrieve. The AI will generate the SQL query for you.
                    </p>
                  </div>

                  <div className="flex-grow bg-card border rounded-md p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                    <Textarea
                      placeholder="e.g. Show me all users who signed up last week..."
                      className="h-full min-h-[100px] border-0 focus-visible:ring-0 resize-none bg-transparent p-1 text-sm"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={handleGenerateSQL}
                      disabled={isGeneratingAI || !aiInput.trim()}
                    >
                      {isGeneratingAI ? <Sparkles className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                      Generate
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={handleDirectExecute}
                      disabled={isGeneratingAI || !aiInput.trim()}
                    >
                      {isGeneratingAI ? <Sparkles className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-2" />}
                      Execute
                    </Button>
                  </div>

                  <div className="text-[10px] text-muted-foreground text-center opacity-70">
                    AI can make mistakes. Review the generated query before running.
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
                  <div className="space-y-4 max-w-4xl mx-auto">
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
                  <div className="max-w-2xl mx-auto mt-8">
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
                  <Alert className="bg-green-500/10 border-green-500/20 text-green-600 max-w-2xl mx-auto mt-8">
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
