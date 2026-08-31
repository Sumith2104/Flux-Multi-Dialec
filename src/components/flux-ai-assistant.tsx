"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Volume2, VolumeX, ArrowUp, Zap, GripVertical, Play } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useContext } from "react";
import { ProjectContext } from "@/contexts/project-context";
import { createProjectAction } from "@/components/layout/actions";
import { cn } from "@/lib/utils";

// --- Types ---

type Message = {
  role: "user" | "assistant";
  content: string;
  pendingWorkflow?: { steps: WorkflowStep[] };
  hidden?: boolean;
  timestamp?: number;
};

type WorkflowStep = {
  type: "NAVIGATE" | "CLICK" | "TYPE" | "CONFIRM_ACTION" | "EXECUTE_SQL";
  path?: string;
  elementId?: string;
  value?: string;
  locator?: string;
  actionType?: "CREATE_PROJECT" | "INJECT_SQL";
  projectName?: string;
  dialect?: string;
  query?: string;
};

type ActiveWorkflow = {
  steps: WorkflowStep[];
  currentStepIndex: number;
};

// --- Constants ---

const MAX_MESSAGES = 50;
const MAX_STORAGE_BYTES = 512 * 1024;

// --- Workflow Parser ---

const parseWorkflow = (text: string): { steps: WorkflowStep[]; cleanText: string } => {
  const steps: WorkflowStep[] = [];

  const codeBlockRanges: [number, number][] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let cbMatch;
  while ((cbMatch = codeBlockRegex.exec(text)) !== null) {
    codeBlockRanges.push([cbMatch.index, cbMatch.index + cbMatch[0].length]);
  }

  const tagRegex = /\[(NAVIGATE|CLICK|TYPE|CONFIRM_ACTION):([^\]]*?)]/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const inCode = codeBlockRanges.some(([start, end]) => match!.index >= start && match!.index < end);
    if (inCode) continue;

    const type = match[1].toUpperCase();
    const argsStr = match[2];

    if (type === 'NAVIGATE') {
      let p = argsStr.trim().replace(/^<\/+/, '/').replace(/>+$/, '');
      if (!p.startsWith('/')) p = '/' + p;
      steps.push({ type: 'NAVIGATE', path: p });
    } else if (type === 'CLICK') {
      steps.push({ type: 'CLICK', elementId: argsStr.trim() });
    } else if (type === 'TYPE') {
      const colonIdx = argsStr.lastIndexOf(':');
      if (colonIdx !== -1) {
        steps.push({ type: 'TYPE', value: argsStr.substring(0, colonIdx).trim(), locator: argsStr.substring(colonIdx + 1).trim() });
      }
    } else if (type === 'CONFIRM_ACTION') {
      const parts = argsStr.split(':');
      const actionType = parts[0]?.toUpperCase();
      if (actionType === 'CREATE_PROJECT') {
        steps.push({ type: 'CONFIRM_ACTION', actionType: 'CREATE_PROJECT', projectName: parts[1]?.trim(), dialect: parts[2]?.trim() || 'postgresql' });
      } else if (actionType === 'INJECT_SQL') {
        let query = argsStr.substring(argsStr.indexOf(':') + 1).trim();
        if (!query || query.toLowerCase().includes('rawsqlquery')) {
          const sqlBlock = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
          if (sqlBlock?.[1]?.trim()) query = sqlBlock[1].trim().replace(/;+$/, '');
        }
        if (query && !query.toLowerCase().includes('rawsqlquery')) {
          steps.push({ type: 'CONFIRM_ACTION', actionType: 'INJECT_SQL', query });
        }
      }
    } else if (type === 'EXECUTE_SQL') {
      let query = argsStr.trim();
      if (!query || query.toLowerCase().includes('rawsqlquery')) {
        const sqlBlock = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
        if (sqlBlock?.[1]?.trim()) query = sqlBlock[1].trim().replace(/;+$/, '');
      }
      if (query && !query.toLowerCase().includes('rawsqlquery')) {
        steps.push({ type: 'EXECUTE_SQL', query });
      }
    }
  }

  const cleanText = text.replace(/\[(?:NAVIGATE|CLICK|TYPE|CONFIRM_ACTION)[^\]]*?]/g, '').trim();
  return { steps, cleanText };
};

// --- Helpers ---

const isDestructiveSql = (q: string) => /^(\s*\/\*)?(\s*DROP\s|\s*TRUNCATE\s|\s*DELETE\s+FROM\s|\s*ALTER\s+.*\s+(DROP|RENAME))/i.test(q);

const AiIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor" />
    <path d="M19 4L19.8 6.2L22 7L19.8 7.8L19 10L18.2 7.8L16 7L18.2 6.2L19 4Z" fill="currentColor" />
    <path d="M5 16L5.8 18.2L8 19L5.8 19.8L5 22L4.2 19.8L2 19L4.2 18.2L5 16Z" fill="currentColor" />
  </svg>
);

// --- Component ---

export function FluxAiAssistant({ userId, isOpen, onOpenChange }: { userId: string; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { project, setProject } = useContext(ProjectContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const isRestored = useRef(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState("glm");
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflow | null>(null);
  const [autoPilotActive, setAutoPilotActive] = useState(false);
  const [autoPilotGoal, setAutoPilotGoal] = useState("");
  const [triggerCheckin, setTriggerCheckin] = useState(0);
  const [panelWidth, setPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);

  // --- Panel resize ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('flux_ai_panel_width');
    if (saved) { const w = parseInt(saved, 10); if (!isNaN(w) && w >= 340 && w <= 1200) setPanelWidth(w); }
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(340, Math.min(window.innerWidth - ev.clientX, Math.min(950, window.innerWidth - 20)));
      setPanelWidth(w);
      localStorage.setItem('flux_ai_panel_width', String(w));
    };
    const onUp = () => { setIsResizing(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // --- Message persistence ---

  const STORAGE_VERSION = 4;
  const storageKey = `flux_ai_messages_v${STORAGE_VERSION}_${userId}_${project?.project_id || 'none'}`;
  const prevProjectIdRef = useRef(project?.project_id);

  // Reset messages only when project *changes*, not on initial mount
  useEffect(() => {
    if (prevProjectIdRef.current === project?.project_id) return;
    prevProjectIdRef.current = project?.project_id;
    isRestored.current = false;
    setMessages([]);
    setActiveWorkflow(null);
    setAutoPilotActive(false);
    setAutoPilotGoal("");
    try { localStorage.removeItem("flux_active_workflow"); localStorage.removeItem("flux_autopilot_goal"); localStorage.removeItem("flux_autopilot_active"); localStorage.removeItem("flux_autopilot_pending_checkin"); } catch {}
  }, [project?.project_id]);

  // Bust stale data from previous component versions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('flux_ai_messages_') && !k.includes(`_v${STORAGE_VERSION}_`)) localStorage.removeItem(k);
    }
    localStorage.removeItem('flux_active_workflow');
    localStorage.removeItem('flux_autopilot_active');
    localStorage.removeItem('flux_autopilot_goal');
    localStorage.removeItem('flux_autopilot_pending_checkin');
  }, []);

  useEffect(() => {
    if (isRestored.current) return;
    const saved = localStorage.getItem(storageKey);
    let parsed: Message[] = [];
    if (saved) { try { parsed = JSON.parse(saved); } catch { parsed = []; } parsed = Array.isArray(parsed) ? parsed.filter((m: any) => m && typeof m.content === 'string') : []; }
    setMessages(parsed.length > 0 ? parsed : [{ role: "assistant", content: "Hi! I'm Flux AI. I can write SQL, create tables, analyze data, and navigate the app for you. What do you need?", timestamp: Date.now() }]);
    isRestored.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!isRestored.current) return;
    const trimmed = messages.slice(-MAX_MESSAGES);
    const serialized = JSON.stringify(trimmed);
    localStorage.setItem(storageKey, serialized.length < MAX_STORAGE_BYTES ? serialized : JSON.stringify(messages.slice(-10)));
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, storageKey]);

  // --- Auto-pilot state ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAutoPilotActive(localStorage.getItem("flux_autopilot_active") === "true");
    setAutoPilotGoal(localStorage.getItem("flux_autopilot_goal") || "");
  }, []);

  const requestAutopilotCheckin = useCallback((msg?: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('flux_autopilot_pending_checkin', 'true');
    if (msg) localStorage.setItem('flux_autopilot_checkin_message', msg);
    else localStorage.removeItem('flux_autopilot_checkin_message');
    setTriggerCheckin(p => p + 1);
  }, []);

  const toggleAutoPilot = () => {
    const next = !autoPilotActive;
    setAutoPilotActive(next);
    if (typeof window === 'undefined') return;
    localStorage.setItem("flux_autopilot_active", next ? "true" : "false");
    if (!next) { localStorage.removeItem('flux_autopilot_goal'); localStorage.removeItem('flux_autopilot_pending_checkin'); localStorage.removeItem('flux_autopilot_checkin_message'); setAutoPilotGoal(""); }
  };

  // --- Model selection ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem("flux_ai_selected_model");
    if (saved) setSelectedModel(saved);
  }, []);

  const handleModelChange = (model: string) => { setSelectedModel(model); localStorage.setItem("flux_ai_selected_model", model); };

  // --- Voice ---

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*#_~`]|(\[.*?\]\(.*?\))/g, "").trim();
    if (!clean) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Google US English") || v.lang === 'en-US') || voices[0];
    if (preferred) utt.voice = preferred;
    window.speechSynthesis.speak(utt);
  }, [voiceEnabled]);

  // --- Schema cache invalidation ---

  useEffect(() => {
    const handler = () => { fetch('/api/ai-chat', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project?.project_id }) }).catch(() => {}); };
    window.addEventListener('flux:schema-change', handler);
    return () => window.removeEventListener('flux:schema-change', handler);
  }, [project?.project_id]);

  // --- Workflow state ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('flux_active_workflow');
    if (saved) { try { setActiveWorkflow(JSON.parse(saved)); } catch { localStorage.removeItem('flux_active_workflow'); } }
  }, [pathname]);

  // --- Workflow runner ---

  const advanceWorkflow = useCallback(() => {
    if (!activeWorkflow) return;
    const nextIdx = activeWorkflow.currentStepIndex + 1;
    const updated = { ...activeWorkflow, currentStepIndex: nextIdx };
    if (nextIdx >= activeWorkflow.steps.length) {
      localStorage.removeItem('flux_active_workflow');
      setActiveWorkflow(null);
      if (typeof window !== 'undefined' && localStorage.getItem("flux_autopilot_active") === "true") requestAutopilotCheckin();
    } else {
      localStorage.setItem('flux_active_workflow', JSON.stringify(updated));
      setActiveWorkflow(updated);
    }
  }, [activeWorkflow, requestAutopilotCheckin]);

  const handleWorkflowError = useCallback((errorMessage: string) => {
    localStorage.removeItem('flux_active_workflow');
    setActiveWorkflow(null);
    if (typeof window !== 'undefined' && localStorage.getItem("flux_autopilot_active") === "true") {
      const goal = localStorage.getItem("flux_autopilot_goal") || "";
      requestAutopilotCheckin(`System: Previous action failed: "${errorMessage}". Goal: "${goal}". Self-correct and propose a fix. Do not give up.`);
      setMessages(prev => [...prev, { role: "assistant", content: `Action failed: ${errorMessage}`, timestamp: Date.now() }]);
    } else {
      if (typeof window !== 'undefined') { localStorage.removeItem('flux_autopilot_goal'); localStorage.removeItem('flux_autopilot_active'); localStorage.removeItem('flux_autopilot_pending_checkin'); setAutoPilotActive(false); setAutoPilotGoal(""); }
    }
  }, [requestAutopilotCheckin]);

  const lastNavigatedPath = useRef<string | null>(null);
  const recentNavPaths = useRef<string[]>([]);

  useEffect(() => {
    if (!activeWorkflow?.steps.length) return;
    const { steps, currentStepIndex } = activeWorkflow;
    if (currentStepIndex >= steps.length) { localStorage.removeItem('flux_active_workflow'); setActiveWorkflow(null); return; }

    const step = steps[currentStepIndex];
    let interval: NodeJS.Timeout | null = null;
    const cleanup = () => { if (interval) { clearInterval(interval); interval = null; } };

    if (step.type === 'NAVIGATE' && step.path) {
      let finalPath = step.path;
      if (project?.project_id && !finalPath.includes('projectId')) finalPath += `${finalPath.includes('?') ? '&' : '?'}projectId=${project.project_id}`;
      recentNavPaths.current.push(finalPath.replace(/\?.*$/, ""));
      if (recentNavPaths.current.length > 8) recentNavPaths.current = recentNavPaths.current.slice(-8);
      const pathCounts = recentNavPaths.current.reduce((a: Record<string,number>, p: string) => { a[p] = (a[p] || 0) + 1; return a; }, {} as Record<string,number>);
      if (Object.values(pathCounts).some(c => c >= 3)) { setMessages(prev => [...prev, { role: "assistant", content: "Auto-Pilot stopped - navigation loop detected.", timestamp: Date.now() }]); toggleAutoPilot(); setActiveWorkflow(null); localStorage.removeItem("flux_active_workflow"); return; }
      if (lastNavigatedPath.current === finalPath) { advanceWorkflow(); return; }
      const targetUrl = new URL(finalPath, window.location.origin);
      if (window.location.pathname === targetUrl.pathname) { advanceWorkflow(); return; }
      lastNavigatedPath.current = finalPath;
      const nextIdx = currentStepIndex + 1;
      if (nextIdx >= steps.length) localStorage.removeItem('flux_active_workflow');
      else localStorage.setItem('flux_active_workflow', JSON.stringify({ ...activeWorkflow, currentStepIndex: nextIdx }));
      setActiveWorkflow(null);
      router.push(finalPath);
    }
    else if (step.type === 'CLICK' && step.elementId) {
      const start = Date.now();
      interval = setInterval(() => {
        const els = Array.from(document.querySelectorAll('button, a, [role="button"], [type="submit"]')).reverse();
        const target = els.find(el => (el.textContent || '').trim().toLowerCase().includes(step.elementId!.toLowerCase())) as HTMLElement;
        if (target) { cleanup(); simulateClick(target, advanceWorkflow); }
        else if (Date.now() - start > 10000) { cleanup(); handleWorkflowError(`Element not found: ${step.elementId}`); }
      }, 200);
    }
    else if (step.type === 'TYPE' && step.value && step.locator) {
      const start = Date.now();
      interval = setInterval(() => {
        const isMonaco = /sql|query|editor/i.test(step.locator!);
        const editor = (window as any)._currentMonacoEditor;
        if (isMonaco && editor) { cleanup(); simulateTypeMonaco(editor, step.value!, advanceWorkflow); return; }
        const inputs = Array.from(document.querySelectorAll('input, textarea')) as (HTMLInputElement | HTMLTextAreaElement)[];
        const target = inputs.find(el => {
          const fields = [(el.placeholder || ''), (el.name || ''), (el.id || ''), (el.getAttribute('aria-label') || '')].map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
          const c = step.locator!.toLowerCase().replace(/[^a-z0-9]/g, '');
          return fields.some(f => f && (f.includes(c) || c.includes(f)));
        });
        if (target) { cleanup(); simulateTypeNative(target, step.value!, advanceWorkflow); }
        else if (Date.now() - start > 10000) { cleanup(); handleWorkflowError(`Input not found: ${step.locator}`); }
      }, 200);
    }
    else if (step.type === 'CONFIRM_ACTION') {
      if (step.actionType === 'CREATE_PROJECT' && step.projectName) {
        setMessages(prev => [...prev, { role: "assistant", content: `Creating project **${step.projectName}**...`, timestamp: Date.now() }]);
        const fd = new FormData(); fd.append('projectName', step.projectName); fd.append('dialect', step.dialect || 'postgresql'); fd.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
        createProjectAction(fd).then(result => {
          if (result.success && result.project) { setProject(result.project); setMessages(prev => [...prev.filter(m => typeof m.content === 'string' && !m.content.includes('Creating project')), { role: "assistant", content: `Created and switched to **${step.projectName}**.`, timestamp: Date.now() }]); advanceWorkflow(); }
          else handleWorkflowError(result.error || 'Unknown error');
        }).catch(err => handleWorkflowError(err.message || err));
      }
      else if (step.actionType === 'INJECT_SQL' && step.query) {
        // Navigate to /query page first, then inject SQL into the editor
        const queryPath = `/query${project?.project_id ? `?projectId=${project.project_id}` : ''}`;
        const sql = step.query;

        if (!window.location.pathname.includes('/query')) {
          // Navigate to query page, SQL will be injected after mount via localStorage + event
          try { localStorage.setItem('flux_pending_sql_inject', JSON.stringify({ query: sql, projectId: project?.project_id, timestamp: Date.now() })); } catch {}
          const nextIdx = currentStepIndex + 1;
          if (nextIdx >= steps.length) localStorage.removeItem('flux_active_workflow');
          else localStorage.setItem('flux_active_workflow', JSON.stringify({ ...activeWorkflow, currentStepIndex: nextIdx }));
          setActiveWorkflow(null);
          router.push(queryPath);
        } else {
          // Already on query page - dispatch event directly
          window.dispatchEvent(new CustomEvent('flux:inject-sql', { detail: { query: sql, projectId: project?.project_id } }));
          setMessages(prev => [...prev, { role: "assistant", content: `Query loaded into the SQL editor. Press **Ctrl+Enter** to execute.`, timestamp: Date.now() }]);
          advanceWorkflow();
        }
      }
    }

    else if (step.type === 'EXECUTE_SQL' && step.query) {
      // Run safe (read-only) SQL directly and display results in chat
      fetch('/api/ai-chat/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: step.query, projectId: project?.project_id })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const { columns, rows, rowCount, truncated } = data;
          let tableMd = '';
          if (columns && columns.length > 0 && rows && rows.length > 0) {
            const header = '| ' + columns.join(' | ') + ' |';
            const sep = '| ' + columns.map(() => '---').join(' | ') + ' |';
            const bodyRows = rows.map((r: any) => '| ' + columns.map((c: string) => String(r[c] ?? 'NULL')).join(' | ') + ' |');
            tableMd = header + '\n' + sep + '\n' + bodyRows.join('\n');
          }
          const resultMsg = `**Query results** (${rowCount} row${rowCount === 1 ? '' : 's'}${truncated ? ', showing first 50' : ''}):\n\n${tableMd || 'No rows returned.'}`;
          setMessages(prev => [...prev, { role: 'assistant', content: resultMsg, timestamp: Date.now() }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `Query error: ${data.error}`, timestamp: Date.now() }]);
        }
        advanceWorkflow();
      })
      .catch(err => {
        setMessages(prev => [...prev, { role: 'assistant', content: `Failed to execute: ${err.message || err}`, timestamp: Date.now() }]);
        handleWorkflowError(err.message || err);
      });
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkflow, pathname, project, autoPilotActive, advanceWorkflow, handleWorkflowError]);

  // --- DOM Simulation Helpers ---

  const simulateClick = (el: HTMLElement, onDone?: () => void) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const orig = el.style.boxShadow; el.style.boxShadow = '0 0 15px 5px rgba(249,115,22,0.5)'; el.style.transition = 'box-shadow 0.3s';
      setTimeout(() => { el.click(); el.style.boxShadow = orig; if (onDone) onDone(); }, 300);
    }, 400);
  };

  const simulateTypeMonaco = (editor: any, value: string, onDone?: () => void) => {
    editor.updateOptions({ quickSuggestions: false, suggestOnTriggerCharacters: false });
    let i = 0;
    const tick = () => { if (i <= value.length) { editor.setValue(value.substring(0, i++)); setTimeout(tick, 30); } else { editor.updateOptions({ quickSuggestions: { other: true, comments: false, strings: true }, suggestOnTriggerCharacters: true }); onDone?.(); } };
    tick();
  };

  const simulateTypeNative = (el: HTMLInputElement | HTMLTextAreaElement, value: string, onDone?: () => void) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const orig = el.style.boxShadow; el.style.boxShadow = '0 0 15px 5px rgba(249,115,22,0.5)'; el.style.transition = 'box-shadow 0.3s'; el.focus();
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = (proto as any)['value'];
      const setter = typeof desc === 'object' && desc !== null && 'set' in desc ? (desc as any).set : undefined;
      let i = 0;
      const tick = () => {
        if (el && i <= value.length) {
          if (setter) setter.call(el, value.substring(0, i)); else el.value = value.substring(0, i);
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          i++; if (i <= value.length) setTimeout(tick, 30); else setTimeout(() => { el.style.boxShadow = orig; onDone?.(); }, 500);
        } else { onDone?.(); }
      };
      tick();
    }, 400);
  };

  // --- Send Message ---

  const handleSend = useCallback(async (e?: React.FormEvent, overrideMsg?: string) => {
    if (e) e.preventDefault();
    const msg = overrideMsg || input.trim();
    if (!msg.trim() || isTyping) return;

    if (!overrideMsg) { setInput(""); if (autoPilotActive && !localStorage.getItem("flux_autopilot_goal")) { localStorage.setItem("flux_autopilot_goal", msg); setAutoPilotGoal(msg); } }

    const isHidden = !!overrideMsg && msg.startsWith("System:");
    setMessages(prev => [...prev, { role: "user", content: msg, hidden: isHidden, timestamp: Date.now() }]);
    setIsTyping(true);

    const currentMsgs = [...messages, { role: "user" as const, content: msg, hidden: isHidden }];
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;

    const getScreenContext = () => {
      if (typeof window === 'undefined') return undefined;
      try {
        const params = new URLSearchParams(window.location.search);
        const activeTable = params.get('tableName') || params.get('tableId') || document.querySelector('[data-current-table]')?.getAttribute('data-current-table') || undefined;
        const cols = Array.from(document.querySelectorAll('th, [role="columnheader"]')).map(el => el.textContent?.trim() || '').filter(Boolean).slice(0, 20);
        const rowCount = document.querySelector('[data-total-rows]')?.getAttribute('data-total-rows');
        const activeError = document.querySelector('[role="alert"]')?.textContent?.trim() || undefined;
        return { activeTable, visibleColumns: cols, rowCount: rowCount ? parseInt(rowCount, 10) : undefined, activeError: activeError?.slice(0, 150) };
      } catch { return undefined; }
    };

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ messages: currentMsgs, currentPath: pathname, model: selectedModel, activeProject: project ? { project_id: project.project_id, display_name: project.display_name, dialect: project.dialect, timezone: project.timezone } : null, screenContext: getScreenContext() }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();

      if (data.success) {
        const { steps, cleanText } = parseWorkflow(data.text);
        const hasOnlyNavSteps = steps.length > 0 && steps.every(s => s.type === 'NAVIGATE') && !cleanText.trim();
        if (autoPilotActive && hasOnlyNavSteps) { setMessages(prev => [...prev, { role: "assistant", content: "Auto-Pilot stopped - AI is looping without making progress.", timestamp: Date.now() }]); toggleAutoPilot(); return; }

        setMessages(prev => [...prev, { role: "assistant", content: cleanText, pendingWorkflow: steps.length > 0 ? { steps } : undefined, timestamp: Date.now() }]);
        if (steps.length > 0) { const wf: ActiveWorkflow = { steps, currentStepIndex: 0 }; localStorage.setItem('flux_active_workflow', JSON.stringify(wf)); setActiveWorkflow(wf); }
        else { localStorage.removeItem('flux_autopilot_goal'); setAutoPilotGoal(""); }
        speak(cleanText);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || 'Something went wrong. Try again.', timestamp: Date.now() }]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setMessages(prev => [...prev, { role: "assistant", content: 'Connection issue. Try again.', timestamp: Date.now() }]);
    } finally { setIsTyping(false); }
  }, [input, isTyping, messages, pathname, selectedModel, project, autoPilotActive, speak]);

  // --- Auto-pilot checkin loop ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pending = localStorage.getItem("flux_autopilot_pending_checkin") === "true";
    const active = localStorage.getItem("flux_autopilot_active") === "true";
    const goal = localStorage.getItem("flux_autopilot_goal") || "";
    if (!pending || !active || !goal || isTyping) return;
    localStorage.removeItem('flux_autopilot_pending_checkin');
    const timer = setTimeout(() => { handleSend(undefined, `System: Previous actions completed. Current page: "${window.location.pathname}". Next step for goal: "${goal}"? If achieved, say "Goal accomplished."`); }, 2500);
    return () => clearTimeout(timer);
  }, [pathname, isTyping, triggerCheckin, handleSend]);

  // --- Cleanup on unmount ---

  useEffect(() => { return () => { abortRef.current?.abort(); if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel(); }; }, []);

  // --- Markdown Renderer ---

  const stripActionTags = (text: string) => text
    .replace(/\[(?:NAVIGATE|CLICK|TYPE|CONFIRM_ACTION|EXECUTE_SQL)[^\]]*\]/g, '')
    .replace(/^ACTIONS:\s*$/mi, '')
    .replace(/^\s*[-•]\s*(?:Go to|Click|Type|Create|Head to|Load|Run)\s+.*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const formatText = (text: string) => {
    if (typeof text !== 'string') return <span />;
    text = stripActionTags(text);
    const inline = (s: string) => {
      if (!s) return null;
      const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
      return parts.map((part: string, i: number) => {
        if (!part) return null;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11.5px] text-foreground border border-border/60">{part.slice(1, -1)}</code>;
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i} className="italic text-foreground/80">{part.slice(1, -1)}</em>;
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">{linkMatch[1]}</a>;
        return <span key={i}>{part}</span>;
      });
    };
    const lines = text.split('\n');
    const els: React.ReactNode[] = [];
    let inCode = false, codeLines: string[] = [], codeLang = '';
    lines.forEach((line, i) => {
      if (line.startsWith('```')) {
        if (!inCode) { inCode = true; codeLang = line.slice(3).trim(); codeLines = []; }
        else { els.push(<div key={`c${i}`} className="my-2 rounded-md border border-border/60 overflow-hidden text-[11.5px]">{codeLang && <div className="px-3 py-1.5 bg-muted/80 border-b border-border/60 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">{codeLang}</div>}<pre className="bg-muted/40 px-3 py-2.5 overflow-x-auto font-mono leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">{codeLines.join('\n')}</pre></div>); inCode = false; codeLines = []; codeLang = ''; }
        return;
      }
      if (inCode) { codeLines.push(line); return; }
      const hMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) { const lvl = hMatch[1].length; const cls = lvl === 1 ? 'text-base font-bold' : lvl === 2 ? 'text-sm font-semibold' : 'text-xs font-semibold'; els.push(<p key={i} className={`mb-1.5 ${cls}`}>{inline(hMatch[2])}</p>); return; }
      if (line.match(/^[-•]\s/)) { els.push(<div key={i} className="flex gap-2 mb-1"><span className="mt-1.5 w-1 h-1 rounded-full bg-current shrink-0 opacity-50" /><span>{inline(line.slice(2))}</span></div>); return; }
      if (line.match(/^\d+\.\s/)) { const num = line.match(/^(\d+)\./)?.[1]; els.push(<div key={i} className="flex gap-2 mb-1"><span className="shrink-0 text-muted-foreground font-mono text-[11px] mt-0.5">{num}.</span><span>{inline(line.replace(/^\d+\.\s/, ''))}</span></div>); return; }
      if (!line.trim()) { els.push(<div key={i} className="h-1.5" />); return; }
      els.push(<p key={i} className="mb-1 last:mb-0 break-words leading-relaxed">{inline(line)}</p>);
    });
    return els;
  };

  // --- Render ---

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onOpenChange(false)} className="fixed inset-0 z-40 bg-black/20" />
          <motion.div
            initial={{ opacity: 0, x: 400 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 400 }}
            transition={{ duration: 0.25, type: 'spring', bounce: 0.1 }}
            style={{ width: `${panelWidth}px`, maxWidth: 'calc(100vw - 20px)' }}
            className={cn("fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-card border-l border-border shadow-2xl transition-none", isResizing && "select-none")}
          >
            <div onMouseDown={handleResizeStart} className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50 z-50 transition-colors flex items-center justify-center group" title="Drag to resize">
              <div className="w-1 h-10 rounded-full bg-border/80 group-hover:bg-primary transition-colors flex items-center justify-center"><GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" /></div>
            </div>

            <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-border bg-card/95">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20"><AiIcon size={13} className="text-primary" /><span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-card" /></div>
                <div><p className="text-sm font-semibold text-foreground leading-none">Flux AI</p><p className="text-[10.5px] text-muted-foreground mt-0.5">Autonomous agent</p></div>
              </div>
              <div className="flex items-center gap-0.5">
                <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} className="h-7 px-1.5 mr-1.5 rounded border border-border bg-background text-[10.5px] font-medium text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[130px] truncate shadow-sm opacity-90" title="AI Model"><option value="glm">GLM 5.2</option></select>
                <button onClick={() => setVoiceEnabled(v => !v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title={voiceEnabled ? 'Mute' : 'Unmute'}>{voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
                <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X size={15} /></button>
              </div>
            </div>

            {autoPilotActive && autoPilotGoal && (
              <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <div className="flex items-center gap-2 truncate"><Zap size={13} className="animate-bounce shrink-0 fill-current text-amber-500" /><span className="truncate">Auto-Pilot: &quot;{autoPilotGoal}&quot;</span></div>
                <button onClick={toggleAutoPilot} className="text-[10px] uppercase font-bold text-amber-500 hover:underline shrink-0 ml-2">Stop</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
              {messages.filter(m => !m.hidden).map((msg, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (<div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center mb-0.5"><AiIcon size={10} className="text-primary" /></div>)}
                  <div className={`text-[13px] leading-relaxed ${msg.role === 'user' ? 'max-w-[88%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2.5 shadow-sm' : 'w-full max-w-[96%] bg-secondary/60 border border-border/50 text-foreground rounded-2xl rounded-bl-sm px-3.5 py-2.5'}`}>
                    {formatText(msg.content)}
                    {msg.pendingWorkflow && (
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Actions:</p>
                        <div className="space-y-1 pl-1">
                          {msg.pendingWorkflow.steps.map((s, si) => (
                            <div key={si} className="text-xs flex items-center gap-1.5 text-foreground/85">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              <span className="leading-tight">
                                {s.type === 'NAVIGATE' && `Go to ${s.path}`}
                                {s.type === 'CLICK' && `Click "${s.elementId}"`}
                                {s.type === 'TYPE' && `Type into "${s.locator}"`}
                                {s.type === 'CONFIRM_ACTION' && s.actionType === 'CREATE_PROJECT' && `Create project "${s.projectName}"`}
                                {s.type === 'CONFIRM_ACTION' && s.actionType === 'INJECT_SQL' && (
                                  <span className={isDestructiveSql(s.query || '') ? 'text-red-400' : ''}>
                                    {isDestructiveSql(s.query || '') ? '⚠ ' : ''}Load into editor: {(s.query || '').slice(0, 50)}{(s.query || '').length > 50 ? '...' : ''}
                                  </span>
                                )}
                                {s.type === 'EXECUTE_SQL' && (
                                  <span className="text-emerald-400">▸ {(s.query || '').slice(0, 55)}{(s.query || '').length > 55 ? '...' : ''}</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {isTyping && (<motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 justify-start"><div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center"><AiIcon size={10} className="text-primary" /></div><div className="bg-secondary/60 border border-border/50 rounded-2xl rounded-bl-sm px-3.5 py-3 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} /></div></motion.div>)}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 px-4 py-3 border-t border-border bg-card/95">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..." className="flex-1 h-9 bg-secondary/50 border border-border rounded-lg px-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all" disabled={isTyping} autoFocus />
                <button type="button" onClick={toggleAutoPilot} className={`h-9 px-3 shrink-0 flex items-center justify-center rounded-lg border text-xs font-semibold gap-1.5 transition-all ${autoPilotActive ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20' : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`} title="Toggle Auto-Pilot"><Zap size={14} className={autoPilotActive ? 'animate-pulse fill-current text-amber-500' : ''} /><span className="hidden sm:inline">Auto-Pilot</span></button>
                <button type="submit" disabled={!input.trim() || isTyping} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"><ArrowUp size={15} strokeWidth={2.5} /></button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
