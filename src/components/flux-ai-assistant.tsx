"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Volume2, VolumeX, ArrowUp, Zap, GripVertical } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useContext } from "react";
import { ProjectContext } from "@/contexts/project-context";
import { createProjectAction } from "@/components/layout/actions";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  pendingWorkflow?: {
    steps: WorkflowStep[];
  };
  hidden?: boolean;
};

type WorkflowStep = {
  type: "NAVIGATE" | "CLICK" | "TYPE" | "CONFIRM_ACTION";
  path?: string;
  elementId?: string;
  value?: string;
  locator?: string;
  actionType?: "CREATE_PROJECT" | "EXECUTE_SQL";
  projectName?: string;
  dialect?: string;
  query?: string;
};

type ActiveWorkflow = {
  steps: WorkflowStep[];
  currentStepIndex: number;
};

const parseWorkflow = (text: string): { steps: WorkflowStep[], cleanText: string } => {
    const steps: WorkflowStep[] = [];
    let cleanText = text;
    
    const regex = /\[(NAVIGATE|CLICK|TYPE|CONFIRM_ACTION):([\s\S]*?)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const type = match[1].toUpperCase();
        const argsStr = match[2];
        
        if (type === 'NAVIGATE') {
            steps.push({ type: 'NAVIGATE', path: argsStr.trim() });
        } else if (type === 'CLICK') {
            steps.push({ type: 'CLICK', elementId: argsStr.trim() });
        } else if (type === 'TYPE') {
            const colonIdx = argsStr.lastIndexOf(':');
            if (colonIdx !== -1) {
                const value = argsStr.substring(0, colonIdx).trim();
                const locator = argsStr.substring(colonIdx + 1).trim();
                steps.push({ type: 'TYPE', value, locator });
            }
        } else if (type === 'CONFIRM_ACTION') {
            const parts = argsStr.split(':');
            const actionType = parts[0].toUpperCase();
            if (actionType === 'CREATE_PROJECT') {
                steps.push({
                    type: 'CONFIRM_ACTION',
                    actionType: 'CREATE_PROJECT',
                    projectName: parts[1]?.trim(),
                    dialect: parts[2]?.trim() || 'postgresql'
                });
            } else if (actionType === 'EXECUTE_SQL') {
                let query = argsStr.substring(argsStr.indexOf(':') + 1).trim();
                
                // Fallback: If model outputted placeholder "RawSQLQuery", extract the actual SQL from markdown blocks
                if (!query || query.toLowerCase().includes('rawsqlquery') || query === 'RawSQL' || query === '"RawSQLQuery"') {
                    const sqlBlockMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
                    if (sqlBlockMatch && sqlBlockMatch[1].trim()) {
                        query = sqlBlockMatch[1].trim().replace(/;+$/, '');
                    }
                }

                if (query && !query.toLowerCase().includes('rawsqlquery')) {
                    steps.push({
                        type: 'CONFIRM_ACTION',
                        actionType: 'EXECUTE_SQL',
                        query
                    });
                }
            }
        }
    }
    
    cleanText = text.replace(/\[(?:NAVIGATE|CLICK|TYPE|CONFIRM_ACTION):[\s\S]*?\]/gi, '').trim();
    return { steps, cleanText };
};

const AiIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/>
    <path d="M19 4L19.8 6.2L22 7L19.8 7.8L19 10L18.2 7.8L16 7L18.2 6.2L19 4Z" fill="currentColor"/>
    <path d="M5 16L5.8 18.2L8 19L5.8 19.8L5 22L4.2 19.8L2 19L4.2 18.2L5 16Z" fill="currentColor"/>
  </svg>
);

export function FluxAiAssistant({ userId, isOpen, onOpenChange }: { userId: string; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { project, setProject } = useContext(ProjectContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const isRestored = useRef(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("glm");
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflow | null>(null);
  const [autoPilotActive, setAutoPilotActive] = useState<boolean>(false);
  const [autoPilotGoal, setAutoPilotGoal] = useState<string>("");
  const [triggerCheckin, setTriggerCheckin] = useState(0);

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState<number>(420);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedWidth = localStorage.getItem('flux_ai_panel_width');
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= 340 && parsed <= 1200) {
          setPanelWidth(parsed);
        }
      }
    }
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
      const clamped = Math.max(340, Math.min(newWidth, Math.min(950, window.innerWidth - 20)));
      setPanelWidth(clamped);
      localStorage.setItem('flux_ai_panel_width', clamped.toString());
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const requestAutopilotCheckin = (messageOverride?: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('flux_autopilot_pending_checkin', 'true');
      if (messageOverride) {
        localStorage.setItem('flux_autopilot_checkin_message', messageOverride);
      } else {
        localStorage.removeItem('flux_autopilot_checkin_message');
      }
      setTriggerCheckin(prev => prev + 1);
    }
  };

  // Load autopilot settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const active = localStorage.getItem("flux_autopilot_active") === "true";
      const goal = localStorage.getItem("flux_autopilot_goal") || "";
      setAutoPilotActive(active);
      setAutoPilotGoal(goal);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isOpen]);

  const toggleAutoPilot = () => {
    const newVal = !autoPilotActive;
    setAutoPilotActive(newVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("flux_autopilot_active", newVal ? "true" : "false");
      if (!newVal) {
        localStorage.removeItem("flux_autopilot_goal");
        localStorage.removeItem("flux_autopilot_pending_checkin");
        setAutoPilotGoal("");
      }
    }
  };

  // Load selected model from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem("flux_ai_selected_model");
      if (savedModel !== "glm") {
        setSelectedModel("glm");
        localStorage.setItem("flux_ai_selected_model", "glm");
      } else {
        setSelectedModel("glm");
      }
    }
  }, []);

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    let activeSocket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isUnmounting = false;

    const connectWs = () => {
      if (isUnmounting) return;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const getCookie = (name: string) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
          return null;
        };
        const sessionToken = getCookie("session");
        const tokenParam = sessionToken ? `?token=${sessionToken}` : "";
        const wsUrl = `${protocol}//${window.location.hostname}:4000${tokenParam}`;
        console.log(`[Assistant WS] Connecting to websocket server...`);
        
        const socket = new WebSocket(wsUrl);
        activeSocket = socket;
        socketRef.current = socket;

        socket.onopen = () => {
          console.log("[Assistant WS] Realtime chat stream connected");
        };

        socket.onclose = () => {
          socketRef.current = null;
          if (!isUnmounting && isOpen) {
            reconnectTimer = setTimeout(connectWs, 5000);
          }
        };

        socket.onerror = (err) => {
          console.warn("[Assistant WS] Connection error:", err);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'chat_token') {
              setIsTyping(false); // Hide standard loading dots once we start receiving text
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMsg, content: lastMsg.content + data.token }
                  ];
                }
                return prev;
              });
            }

            if (data.type === 'chat_done') {
              const finalContent = data.text;
              setIsTyping(false);
              
              const { steps, cleanText } = parseWorkflow(finalContent);
              
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    {
                      role: "assistant",
                      content: cleanText,
                      pendingWorkflow: steps.length > 0 ? { steps } : undefined
                    }
                  ];
                }
                return prev;
              });

              if (steps.length > 0) {
                const workflowObj: ActiveWorkflow = {
                  steps,
                  currentStepIndex: 0
                };
                localStorage.setItem('flux_active_workflow', JSON.stringify(workflowObj));
                setActiveWorkflow(workflowObj);
              } else {
                localStorage.removeItem("flux_autopilot_goal");
                setAutoPilotGoal("");
              }

              speak(cleanText);
            }

            if (data.type === 'chat_error') {
              setIsTyping(false);
              setMessages(prev => [
                ...prev.filter(m => m.content !== ""),
                { role: "assistant", content: `Error: ${data.message || 'Stream failed. Using fallback...'}` }
              ]);
            }
          } catch (e) {
            console.warn("[Assistant WS] Parse error:", e);
          }
        };
      } catch (err) {
        console.warn("[Assistant WS] Init error:", err);
      }
    };

    connectWs();

    return () => {
      isUnmounting = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (activeSocket) {
        activeSocket.close();
      }
    };
  }, []);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem("flux_ai_selected_model", model);
    // Dispatch custom event to notify other UI components of model change (e.g. suggestions caching)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("flux_ai:model-change", { detail: { model } }));
    }
  };
  const lastNavigatedPath = useRef<string | null>(null);

  // Load workflow from localStorage on mount and pathname change
  useEffect(() => {
      lastNavigatedPath.current = null;
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('flux_active_workflow');
          if (saved) {
              try {
                  const wf = JSON.parse(saved) as ActiveWorkflow;
                  setActiveWorkflow(wf);
                } catch {
                    localStorage.removeItem('flux_active_workflow');
              }
          }
      }
  }, [pathname]);

  const advanceWorkflow = () => {
      if (!activeWorkflow) return;
      const nextIndex = activeWorkflow.currentStepIndex + 1;
      const updated = { ...activeWorkflow, currentStepIndex: nextIndex };
      
      if (nextIndex >= activeWorkflow.steps.length) {
          localStorage.removeItem('flux_active_workflow');
          setActiveWorkflow(null);
          console.log('[Workflow Runner] Workflow completed successfully.');
          if (typeof window !== 'undefined' && localStorage.getItem("flux_autopilot_active") === "true") {
              requestAutopilotCheckin();
          }
      } else {
          localStorage.setItem('flux_active_workflow', JSON.stringify(updated));
          setActiveWorkflow(updated);
      }
  };

  const handleWorkflowError = (errorMessage: string) => {
      localStorage.removeItem('flux_active_workflow');
      setActiveWorkflow(null);

      if (typeof window !== 'undefined' && localStorage.getItem("flux_autopilot_active") === "true") {
          console.log(`[Auto-Pilot] Action failed. Requesting self-correction check-in for error: ${errorMessage}`);
          
          setMessages(prev => [...prev, {
              role: "assistant",
              content: `Action failed: ${errorMessage}`
          }]);

          const currentGoal = localStorage.getItem("flux_autopilot_goal") || "";
          requestAutopilotCheckin(
              `System Error: The previous action failed with error: "${errorMessage}". We are trying to achieve the goal: "${currentGoal}". Please analyze the error, self-correct, and propose a modified plan or query to achieve the goal. Do not give up.`
          );
      } else {
          if (typeof window !== 'undefined') {
              localStorage.removeItem('flux_autopilot_goal');
              localStorage.removeItem('flux_autopilot_active');
              localStorage.removeItem('flux_autopilot_pending_checkin');
              localStorage.removeItem('flux_autopilot_checkin_message');
              setAutoPilotActive(false);
              setAutoPilotGoal("");
          }
          console.warn(`[Workflow Runner Stopped with Error] ${errorMessage}`);
      }
  };

  // Run the current workflow step
  useEffect(() => {
      if (!activeWorkflow || activeWorkflow.steps.length === 0) return;
      const { steps, currentStepIndex } = activeWorkflow;
      if (currentStepIndex >= steps.length) {
          localStorage.removeItem('flux_active_workflow');
          setActiveWorkflow(null);
          return;
      }

      const step = steps[currentStepIndex];
      console.log(`[Workflow Runner] Running step ${currentStepIndex + 1}/${steps.length}:`, step);

      let activeInterval: NodeJS.Timeout | null = null;

      const cleanup = () => {
          if (activeInterval) {
              clearInterval(activeInterval);
              activeInterval = null;
          }
      };

      if (step.type === 'NAVIGATE' && step.path) {
          const targetPath = step.path;
          let finalPath = targetPath;
          if (project?.project_id && !finalPath.includes('projectId')) {
             const separator = finalPath.includes('?') ? '&' : '?';
             finalPath += `${separator}projectId=${project.project_id}`;
          }

          if (lastNavigatedPath.current === finalPath) {
              console.log(`[Workflow Runner] Already navigating to ${finalPath}. Skipping duplicate push.`);
              return;
          }

          const currentUrl = new URL(window.location.href);
          const targetUrlObj = new URL(targetPath, window.location.origin);
          
          if (currentUrl.pathname === targetUrlObj.pathname) {
              console.log(`[Workflow Runner] Already on path ${targetUrlObj.pathname}. Moving to next step.`);
              advanceWorkflow();
          } else {
              console.log(`[Workflow Runner] Navigating to ${targetPath}`);
              
              lastNavigatedPath.current = finalPath;

              // Save advanced index to localStorage first so it loads on the new page,
              // but DO NOT set activeWorkflow state on this page to prevent executing on the old page.
               const nextIndex = currentStepIndex + 1;
               const updated = { ...activeWorkflow, currentStepIndex: nextIndex };
               if (nextIndex >= steps.length) {
                   localStorage.removeItem('flux_active_workflow');
                    if (typeof window !== 'undefined' && localStorage.getItem("flux_autopilot_active") === "true") {
                        requestAutopilotCheckin();
                    }
               } else {
                   localStorage.setItem('flux_active_workflow', JSON.stringify(updated));
               }

              // Set activeWorkflow to null immediately to stop the runner on this page
              // while the browser handles router.push navigation asynchronously.
              setActiveWorkflow(null);

              router.push(finalPath);
          }
      } 
      else if (step.type === 'CLICK' && step.elementId) {
          const startTime = Date.now();
          activeInterval = setInterval(() => {
              const interactiveSelector = 'button, a, [role="button"], [type="submit"], input[type="button"], input[type="submit"], label';
              const interactives = Array.from(document.querySelectorAll(interactiveSelector));
              interactives.reverse();
              let targetEl = interactives.find(el => {
                  const text = (el.textContent || '').trim().toLowerCase();
                  return text && text.includes(step.elementId!.toLowerCase());
              }) as HTMLElement;

              if (!targetEl) {
                  const fallbacks = Array.from(document.querySelectorAll('li, tr, div, span'));
                  fallbacks.reverse();
                  targetEl = fallbacks.find(el => {
                      const text = (el.textContent || '').trim().toLowerCase();
                      return text && text.includes(step.elementId!.toLowerCase());
                  }) as HTMLElement;
              }

              if (targetEl) {
                  cleanup();
                  simulateClickElement(targetEl, advanceWorkflow);
              } else if (Date.now() - startTime > 10000) {
                  cleanup();
                  handleWorkflowError(`Timeout waiting for element: ${step.elementId}`);
              }
          }, 200);
      } 
      else if (step.type === 'TYPE' && step.value && step.locator) {
          const startTime = Date.now();
          activeInterval = setInterval(() => {
              const isMonaco = step.locator!.toLowerCase().includes('sql') || 
                               step.locator!.toLowerCase().includes('query') || 
                               step.locator!.toLowerCase().includes('editor');
              const monacoEditor = (window as any)._currentMonacoEditor;
              if (isMonaco && monacoEditor) {
                  cleanup();
                  simulateTypeIntoElement({ tagName: 'MONACO' } as any, step.value!, advanceWorkflow);
                  return;
              }

              const inputs = Array.from(document.querySelectorAll('input, textarea')) as (HTMLInputElement | HTMLTextAreaElement)[];
              let targetEl: HTMLInputElement | HTMLTextAreaElement | undefined;
              const cleanLocator = step.locator!.toLowerCase().replace(/[^a-z0-9]/g, '');
              
              targetEl = inputs.find(el => {
                  const placeholder = (el.placeholder || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  const name = (el.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  const id = (el.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  const aria = (el.getAttribute('aria-label') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (!cleanLocator) return false;
                  return (placeholder && (placeholder.includes(cleanLocator) || cleanLocator.includes(placeholder))) ||
                         (name && (name.includes(cleanLocator) || cleanLocator.includes(name))) ||
                         (id && (id.includes(cleanLocator) || cleanLocator.includes(id))) ||
                         (aria && (aria.includes(cleanLocator) || cleanLocator.includes(aria)));
              });

              if (!targetEl) {
                  const labels = Array.from(document.querySelectorAll('label, div, span, h2, h3, h4'));
                  const targetLabel = labels.find(l => {
                      const text = (l.textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      return text && (text === cleanLocator || text.includes(cleanLocator));
                  });
                  if (targetLabel) {
                      if ((targetLabel as HTMLLabelElement).htmlFor) {
                          targetEl = document.getElementById((targetLabel as HTMLLabelElement).htmlFor) as HTMLInputElement;
                      }
                      if (!targetEl) {
                          let wrapper = targetLabel.parentElement;
                          while (wrapper && !targetEl) {
                             targetEl = wrapper.querySelector('input, textarea') as HTMLInputElement;
                             if (!targetEl && wrapper.parentElement) wrapper = wrapper.parentElement;
                             else break;
                          }
                      }
                  }
              }

              if (targetEl) {
                  cleanup();
                  simulateTypeIntoElement(targetEl, step.value!, advanceWorkflow);
              } else if (Date.now() - startTime > 10000) {
                  cleanup();
                  handleWorkflowError(`Timeout waiting for input: ${step.locator}`);
              }
          }, 200);
      }

      else if (step.type === 'CONFIRM_ACTION') {
          if (step.actionType === 'CREATE_PROJECT' && step.projectName) {
              console.log(`[Workflow Runner] Creating project automatically: ${step.projectName}`);
              setMessages(prev => [...prev, { role: "assistant", content: `Creating project **${step.projectName}**... Please wait.` }]);
              
              const formData = new FormData();
              formData.append('projectName', step.projectName);
              formData.append('dialect', step.dialect || 'postgresql');
              formData.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
              
              createProjectAction(formData).then(result => {
                  if (result.success && result.project) {
                      setProject(result.project);
                      setMessages(prev => {
                          const filtered = prev.filter(m => !m.content.includes("Creating project"));
                          return [...filtered, { role: "assistant", content: `Successfully created and switched to project **${step.projectName}**!` }];
                      });
                      advanceWorkflow();
                  } else {
                      handleWorkflowError(`Failed to create project: ${result.error || 'Unknown error'}`);
                      setMessages(prev => {
                          const filtered = prev.filter(m => !m.content.includes("Creating project"));
                          return [...filtered, { role: "assistant", content: `Failed to create project: ${result.error || 'Unknown error'}` }];
                      });
                  }
              }).catch(err => {
                  handleWorkflowError(`Error creating project: ${err.message || err}`);
                  setMessages(prev => {
                      const filtered = prev.filter(m => !m.content.includes("Creating project"));
                      return [...filtered, { role: "assistant", content: `Error creating project: ${err.message || err}` }];
                  });
              });
          }
          else if (step.actionType === 'EXECUTE_SQL' && step.query) {
              console.log(`[Workflow Runner] Executing SQL automatically: ${step.query}`);
              setMessages(prev => [...prev, { role: "assistant", content: `Executing query \`${step.query}\`... Please wait.` }]);
              
              const runSql = (activeProject: any) => {
                  fetch('/api/execute-sql', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ projectId: activeProject.project_id, query: step.query })
                  }).then(res => res.json()).then(result => {
                        if (result.success) {
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId: activeProject.project_id } }));
                                window.dispatchEvent(new CustomEvent('flux:sql-executed', {
                                    detail: {
                                        projectId: activeProject.project_id,
                                        query: step.query,
                                        response: result
                                    }
                                }));
                                try {
                                    localStorage.setItem(`sqlQuery_${activeProject.project_id}`, step.query || '');
                                    localStorage.setItem('flux_latest_query_result', JSON.stringify({
                                        projectId: activeProject.project_id,
                                        query: step.query || '',
                                        response: result,
                                        timestamp: Date.now()
                                    }));
                                } catch {}
                            }
                            const rows = result.result?.rows;
                            const isReadOnly = /^\s*(SELECT|WITH)\b/i.test(step.query || '');

                          setMessages(prev => {
                              const filtered = prev.filter(m => !m.content.includes("Executing query"));
                              let feedbackContent = `Successfully executed SQL query: \`${step.query}\``;
                              if (Array.isArray(rows) && rows.length > 0) {
                                  feedbackContent += `\n\n**Output results (first 5 rows):**\n\`\`\`json\n${JSON.stringify(rows.slice(0, 5), null, 2)}\n\`\`\``;
                              } else if (result.executionInfo) {
                                  const info = result.executionInfo;
                                  const countText = info.rows_affected !== undefined ? `${info.rows_affected} rows affected` : `${info.rows_returned || 0} rows returned`;
                                  feedbackContent += `\n\n*Result: ${countText} (Time: ${info.time || 'N/A'})*`;
                              }
                              return [...filtered, { role: "assistant", content: feedbackContent }];
                          });
                          advanceWorkflow();

                          // Agentic Loop: Feed query results back to the LLM to give the user a direct answer
                          if (isReadOnly && Array.isArray(rows) && rows.length > 0) {
                              const sampleRows = rows.slice(0, 10);
                              setTimeout(() => {
                                  handleSend(
                                      undefined,
                                      `System: The query \`${step.query}\` returned ${rows.length} rows: ${JSON.stringify(sampleRows)}. Analyze this data and give me the direct answer to my question.`
                                  );
                              }, 500);
                          }
                      } else {
                          const errMsg = result.error?.message || 'Unknown error';
                          handleWorkflowError(`Failed to execute SQL: ${errMsg}`);
                          
                          // Record error in RAG memory
                          fetch('/api/ai-chat/learn', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                  projectId: activeProject.project_id,
                                  dialect: activeProject.dialect || 'postgresql',
                                  errorCategory: 'sql_execution_error',
                                  errorMessage: errMsg,
                                  failedQuery: step.query,
                                  verifiedFix: 'Check SQL syntax, reserved keywords, and table constraints.'
                              })
                          }).catch(() => {});

                          setMessages(prev => {
                              const filtered = prev.filter(m => !m.content.includes("Executing query"));
                              return [...filtered, { role: "assistant", content: `Failed to execute SQL: ${errMsg}` }];
                          });
                      }
                  }).catch(err => {
                      handleWorkflowError(`Error executing SQL: ${err.message || err}`);
                      setMessages(prev => {
                          const filtered = prev.filter(m => !m.content.includes("Executing query"));
                          return [...filtered, { role: "assistant", content: `Error executing SQL: ${err.message || err}` }];
                      });
                  });
              };

              if (project) {
                  runSql(project);
              } else {
                  console.log(`[Workflow Runner] Waiting for project context to initialize...`);
                  handleWorkflowError('No project context initialized');
                  setMessages(prev => {
                      const filtered = prev.filter(m => !m.content.includes("Executing query"));
                      return [...filtered, { role: "assistant", content: `Failed to execute SQL: No project active.` }];
                  });
              }
          }
      }

      return cleanup;
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkflow, pathname, project]);

  const simulateClickElement = (targetEl: HTMLElement, onComplete?: () => void) => {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
          const rect = targetEl.getBoundingClientRect();
          
          const ripple = document.createElement('div');
          ripple.style.position = 'absolute';
          ripple.style.left = `${rect.left + window.scrollX + rect.width / 2 - 30}px`;
          ripple.style.top = `${rect.top + window.scrollY + rect.height / 2 - 30}px`;
          ripple.style.width = '60px';
          ripple.style.height = '60px';
          ripple.style.borderRadius = '50%';
          ripple.style.backgroundColor = 'rgba(249, 115, 22, 0.4)';
          ripple.style.boxShadow = '0 0 20px rgba(249, 115, 22, 0.6)';
          ripple.style.pointerEvents = 'none';
          ripple.style.zIndex = '99999';
          ripple.style.animation = 'aiClickPulse 0.5s ease-out forwards';
          
          if (!document.getElementById('aiClickKeyframes')) {
             const style = document.createElement('style');
             style.id = 'aiClickKeyframes';
             style.innerHTML = `
               @keyframes aiClickPulse {
                  0% { transform: scale(0.5); opacity: 1; }
                  50% { opacity: 0.8; }
                  100% { transform: scale(2.5); opacity: 0; }
               }
             `;
             document.head.appendChild(style);
          }

          document.body.appendChild(ripple);

          const originalTransition = targetEl.style.transition;
          const originalBoxShadow = targetEl.style.boxShadow;
          targetEl.style.transition = 'all 0.3s';
          targetEl.style.boxShadow = '0 0 15px 5px rgba(249,115,22,0.5)';
          
          setTimeout(() => {
              targetEl.click();
              targetEl.style.boxShadow = originalBoxShadow;
              targetEl.style.transition = originalTransition;
              setTimeout(() => {
                  if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
                  onComplete?.();
              }, 500);
          }, 300);
      }, 400);
  };

  const simulateTypeIntoElement = (targetEl: HTMLInputElement | HTMLTextAreaElement, value: string, onComplete?: () => void) => {
      if ((targetEl as any).tagName === 'MONACO') {
          const monacoEditor = (window as any)._currentMonacoEditor;
          if (monacoEditor) {
              console.log('[Workflow Runner] Typing character-by-character into Monaco Editor...');
              
              // Temporarily disable suggestions to prevent autocomplete crashes during fast automated typing
              monacoEditor.updateOptions({
                  quickSuggestions: false,
                  suggestOnTriggerCharacters: false
              });

              let i = 0;
              const typeChar = () => {
                  if (i <= value.length) {
                      monacoEditor.setValue(value.substring(0, i));
                      i++;
                      setTimeout(typeChar, 30);
                  } else {
                      // Re-enable quick suggestions after automated typing completes
                      monacoEditor.updateOptions({
                          quickSuggestions: { other: true, comments: false, strings: true },
                          suggestOnTriggerCharacters: true
                      });
                      onComplete?.();
                  }
              };
              typeChar();
          } else {
              onComplete?.();
          }
          return;
      }

      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
          const originalBoxShadow = targetEl.style.boxShadow;
          const originalTransition = targetEl.style.transition;
          targetEl.style.transition = 'all 0.3s';
          targetEl.style.boxShadow = '0 0 15px 5px rgba(249,115,22,0.5)';
          targetEl.focus();
          
          let i = 0;
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          
          const typeChar = () => {
              if (targetEl && i <= value.length) {
                  const currentVal = value.substring(0, i);
                  if (targetEl.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                      nativeTextAreaValueSetter.call(targetEl, currentVal);
                  } else if (nativeInputValueSetter) {
                      nativeInputValueSetter.call(targetEl, currentVal);
                  } else {
                      targetEl.value = currentVal;
                  }
                  targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                  targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                  i++;
                  if (i <= value.length) {
                      setTimeout(typeChar, 30);
                  } else {
                      setTimeout(() => {
                          targetEl.style.boxShadow = originalBoxShadow;
                          targetEl.style.transition = originalTransition;
                          onComplete?.();
                      }, 500);
                  }
              } else {
                  onComplete?.();
              }
          };
          typeChar();
      }, 400);
  };




  const storageKey = `flux_ai_messages_${userId}`;

  useEffect(() => {
    if (!isRestored.current) {
       const saved = localStorage.getItem(storageKey);
       if (saved) {
           setMessages(JSON.parse(saved));
       } else {
           setMessages([{ role: "assistant", content: "Hi! I'm Flux AI. Let me guide you through setting up your project, fixing bugs, or writing SQL." }]);
       }
       isRestored.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (isRestored.current) {
        // Phase 5: Cap message history at 50 messages with 512 KB size limit.
        // localStorage.setItem is synchronous — large payloads hurt main thread on every render.
        const MAX_MESSAGES = 50;
        const MAX_STORAGE_BYTES = 512 * 1024; // 512 KB

        const trimmed = messages.slice(-MAX_MESSAGES);
        const serialized = JSON.stringify(trimmed);

        if (serialized.length < MAX_STORAGE_BYTES) {
            localStorage.setItem(storageKey, serialized);
        } else {
            // If still too large, keep only the most recent 10 messages
            localStorage.setItem(storageKey, JSON.stringify(messages.slice(-10)));
        }
    }
    scrollToBottom();
  }, [messages, isTyping, storageKey]);

  useEffect(() => {
    // Attempt to load voices ASAP
    const loadVoices = () => window.speechSynthesis.getVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speak = (text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    
    // Stop any current speech string
    window.speechSynthesis.cancel();
    
    // Strip markdown formatting for cleaner speech
    const cleanText = text.replace(/[*#_~`]|(\[.*?\]\(.*?\))/g, "").trim();
    if (!cleanText) return;
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    // Prefer Google US English or standard US English
    const preferredVoice = voices.find(v => v.name.includes("Google US English") || v.lang === "en-US") || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    window.speechSynthesis.speak(utterance);
  };

  const toggleVoice = () => {
    if (voiceEnabled && typeof window !== 'undefined') window.speechSynthesis.cancel();
    setVoiceEnabled(!voiceEnabled);
  };

  const handleSend = async (e?: React.FormEvent, overrideMsg?: string) => {
    if (e) e.preventDefault();
    const msgToSend = overrideMsg || input.trim();
    if (!msgToSend.trim() || isTyping) return;

    if (!overrideMsg) {
      setInput("");
      if (autoPilotActive) {
        const existingGoal = localStorage.getItem("flux_autopilot_goal");
        if (!existingGoal) {
          localStorage.setItem("flux_autopilot_goal", msgToSend);
          setAutoPilotGoal(msgToSend);
        }
      }
    }

    setMessages(prev => [...prev, { role: "user", content: msgToSend, hidden: !!overrideMsg && msgToSend.startsWith("System:") }]);
    setIsTyping(true);

    const currentMsgs = [...messages, { role: "user", content: msgToSend, hidden: !!overrideMsg && msgToSend.startsWith("System:") }];

    // Try WebSocket stream first if socket is open
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      socketRef.current.send(JSON.stringify({
        type: 'chat_request',
        messages: currentMsgs,
        currentPath: pathname,
        activeProject: project ? {
          project_id: project.project_id,
          display_name: project.display_name,
          dialect: project.dialect,
          timezone: project.timezone
        } : null
      }));
      return;
    }

    const getScreenContext = () => {
      if (typeof window === 'undefined') return undefined;
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const activeTableFromUrl = urlParams.get('tableName') || urlParams.get('tableId');
        const activeTableFromAttr = document.querySelector('[data-current-table]')?.getAttribute('data-current-table');
        const activeTable = activeTableFromUrl || activeTableFromAttr || undefined;

        const columnHeaders = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
                                  .map(el => el.textContent?.trim() || '')
                                  .filter(Boolean)
                                  .slice(0, 20);
        const rowCountText = document.querySelector('[data-total-rows]')?.getAttribute('data-total-rows');
        const activeError = document.querySelector('[role="alert"]')?.textContent?.trim() || undefined;

        return {
          activeTable,
          visibleColumns: columnHeaders,
          rowCount: rowCountText ? parseInt(rowCountText, 10) : undefined,
          activeError: activeError ? activeError.slice(0, 150) : undefined
        };
      } catch {
        return undefined;
      }
    };

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMsgs,
          currentPath: pathname,
          model: selectedModel,
          activeProject: project ? {
            project_id: project.project_id,
            display_name: project.display_name,
            dialect: project.dialect,
            timezone: project.timezone
          } : null,
          screenContext: getScreenContext()
        })
      });
      const data = await res.json();
      if (data.success) {
        const responseText = data.text;
        
        // Parse workflow steps from response
        const { steps, cleanText } = parseWorkflow(responseText);
        
        setMessages(prev => [...prev, {
             role: "assistant",
             content: cleanText,
             pendingWorkflow: steps.length > 0 ? { steps } : undefined
        }]);

        if (steps.length > 0) {
            const workflowObj: ActiveWorkflow = {
                steps,
                currentStepIndex: 0
            };
            localStorage.setItem('flux_active_workflow', JSON.stringify(workflowObj));
            setActiveWorkflow(workflowObj);
        } else {
            localStorage.removeItem("flux_autopilot_goal");
            setAutoPilotGoal("");
        }

        speak(cleanText);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Oops, my brain disconnected. Please try asking again." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting to Fluxbase servers right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Auto-Pilot continuous execution loop
  useEffect(() => {
    if (typeof window !== "undefined") {
      const pendingCheckin = localStorage.getItem("flux_autopilot_pending_checkin") === "true";
      const isAutoActive = localStorage.getItem("flux_autopilot_active") === "true";
      const currentGoal = localStorage.getItem("flux_autopilot_goal") || "";

      if (pendingCheckin && isAutoActive && currentGoal && !isTyping) {
        localStorage.removeItem("flux_autopilot_pending_checkin");
        
        // Wait 2.5 seconds to let the route and state settle fully
        const timer = setTimeout(() => {
          handleSend(
            undefined,
            `System: I have successfully completed the previous set of actions. I am currently on page "${window.location.pathname}". What is the next step to achieve the overall goal: "${currentGoal}"? If the goal is fully achieved, output exactly: "Goal accomplished successfully! Let me know if you need anything else."`
          );
        }, 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [pathname, isTyping, triggerCheckin]);

  // ── Professional markdown renderer ──────────────────────────────────────────
  const formatText = (text: string) => {
    // Parse inline: **bold**, *italic*, `code`
    const parseInline = (str: string) => {
      const parts = str.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
      return parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return <code key={idx} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11.5px] text-foreground border border-border/60">{part.slice(1, -1)}</code>;
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={idx} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
          return <em key={idx} className="italic text-foreground/80">{part.slice(1, -1)}</em>;
        return <span key={idx}>{part}</span>;
      });
    };

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeLang = '';

    lines.forEach((line, i) => {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeLines = [];
        } else {
          elements.push(
            <div key={`code-${i}`} className="my-2 rounded-md border border-border/60 overflow-hidden text-[11.5px]">
              {codeLang && (
                <div className="px-3 py-1.5 bg-muted/80 border-b border-border/60 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                  {codeLang}
                </div>
              )}
              <pre className="bg-muted/40 px-3 py-2.5 overflow-x-auto font-mono leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
                {codeLines.join('\n')}
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeLines = [];
          codeLang = '';
        }
        return;
      }
      if (inCodeBlock) { codeLines.push(line); return; }

      // Bullet points
      if (line.match(/^[-•]\s/)) {
        elements.push(
          <div key={i} className="flex gap-2 mb-1">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-current shrink-0 opacity-50" />
            <span>{parseInline(line.slice(2))}</span>
          </div>
        );
        return;
      }
      // Numbered list
      if (line.match(/^\d+\.\s/)) {
        const num = line.match(/^(\d+)\./)?.[1];
        elements.push(
          <div key={i} className="flex gap-2 mb-1">
            <span className="shrink-0 text-muted-foreground font-mono text-[11px] mt-0.5">{num}.</span>
            <span>{parseInline(line.replace(/^\d+\.\s/, ''))}</span>
          </div>
        );
        return;
      }
      // Empty line → small gap
      if (!line.trim()) {
        elements.push(<div key={i} className="h-1.5" />);
        return;
      }
      elements.push(<p key={i} className="mb-1 last:mb-0 break-words leading-relaxed">{parseInline(line)}</p>);
    });

    return elements;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-40 bg-black/20"
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ duration: 0.25, type: 'spring', bounce: 0.1 }}
            style={{ width: `${panelWidth}px`, maxWidth: 'calc(100vw - 20px)' }}
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-card border-l border-border shadow-2xl transition-none",
              isResizing && "select-none"
            )}
          >
            {/* Resizable drag handle on left border */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50 z-50 transition-colors flex items-center justify-center group"
              title="Drag to stretch/resize panel width"
            >
              <div className="w-1 h-10 rounded-full bg-border/80 group-hover:bg-primary transition-colors flex items-center justify-center">
                <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-border bg-card/95">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20">
                  <AiIcon size={13} className="text-primary" />
                  {/* Online dot */}
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-card" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-none">Flux AI</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">Platform assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="h-7 px-1.5 mr-1.5 rounded border border-border bg-background text-[10.5px] font-medium text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary cursor-default max-w-[130px] truncate select-none shadow-sm opacity-90"
                  title="AI Model"
                  disabled
                >
                  <option value="glm">GLM 5.2</option>
                </select>
                <button
                  onClick={toggleVoice}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title={voiceEnabled ? 'Mute' : 'Unmute'}
                >
                  {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Auto-Pilot Goal Banner */}
            {autoPilotActive && autoPilotGoal && (
              <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <div className="flex items-center gap-2 truncate">
                  <Zap size={13} className="animate-bounce shrink-0 fill-current text-amber-500" />
                  <span className="truncate">Auto-Pilot: "{autoPilotGoal}"</span>
                </div>
                <button 
                  onClick={toggleAutoPilot}
                  className="text-[10px] uppercase font-bold text-amber-500 hover:underline shrink-0 ml-2"
                >
                  Stop
                </button>
              </div>
            )}

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
              {messages.filter(msg => !msg.hidden).map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Assistant avatar */}
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center mb-0.5">
                      <AiIcon size={10} className="text-primary" />
                    </div>
                  )}

                  <div
                    className={`text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'max-w-[88%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2.5 shadow-sm'
                        : 'w-full max-w-[96%] bg-secondary/60 border border-border/50 text-foreground rounded-2xl rounded-bl-sm px-3.5 py-2.5'
                    }`}
                  >
                    {formatText(msg.content)}
                    {msg.pendingWorkflow && (
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Suggested Actions:</p>
                        <div className="space-y-1 pl-1">
                          {msg.pendingWorkflow.steps.map((step, sIdx) => (
                            <div key={sIdx} className="text-xs flex items-center gap-1.5 text-foreground/85">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              <span className="leading-tight">
                                {step.type === 'NAVIGATE' && `Navigate to ${step.path}`}
                                {step.type === 'CLICK' && `Click "${step.elementId}"`}
                                {step.type === 'TYPE' && `Type "${step.value}" into "${step.locator}"`}
                                {step.type === 'CONFIRM_ACTION' && step.actionType === 'CREATE_PROJECT' && `Create project "${step.projectName}"`}
                                {step.type === 'CONFIRM_ACTION' && step.actionType === 'EXECUTE_SQL' && `Execute SQL: "${step.query}"`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-end gap-2 justify-start"
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <AiIcon size={10} className="text-primary" />
                  </div>
                  <div className="bg-secondary/60 border border-border/50 rounded-2xl rounded-bl-sm px-3.5 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input ── */}
            <div className="shrink-0 px-4 py-3 border-t border-border bg-card/95">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  className="flex-1 h-9 bg-secondary/50 border border-border rounded-lg px-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  disabled={isTyping}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={toggleAutoPilot}
                  className={`h-9 px-3 shrink-0 flex items-center justify-center rounded-lg border text-xs font-semibold gap-1.5 transition-all ${
                    autoPilotActive 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20' 
                      : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                  title="Toggle Auto-Pilot Mode"
                >
                  <Zap size={14} className={autoPilotActive ? "animate-pulse fill-current text-amber-500" : ""} />
                  <span>Auto-Pilot</span>
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  <ArrowUp size={15} strokeWidth={2.5} />
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}