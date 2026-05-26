"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Volume2, VolumeX, ArrowUp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useContext } from "react";
import { ProjectContext } from "@/contexts/project-context";
import { createProjectAction } from "@/components/layout/actions";

type Message = {
  role: "user" | "assistant";
  content: string;
  pendingWorkflow?: {
    steps: WorkflowStep[];
  };
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
                const query = argsStr.substring(argsStr.indexOf(':') + 1).trim();
                steps.push({
                    type: 'CONFIRM_ACTION',
                    actionType: 'EXECUTE_SQL',
                    query
                });
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
  const [selectedModel, setSelectedModel] = useState("googleai/gemini-2.5-flash");
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflow | null>(null);

  // Load selected model from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem("flux_ai_selected_model");
      if (savedModel) {
        setSelectedModel(savedModel);
      }
    }
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
      } else {
          localStorage.setItem('flux_active_workflow', JSON.stringify(updated));
          setActiveWorkflow(updated);
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
                  console.warn(`[Workflow Runner] Timeout waiting for element: ${step.elementId}`);
                  // Stop the workflow to avoid hanging
                  localStorage.removeItem('flux_active_workflow');
                  setActiveWorkflow(null);
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
                  console.warn(`[Workflow Runner] Timeout waiting for input: ${step.locator}`);
                  // Stop the workflow to avoid hanging
                  localStorage.removeItem('flux_active_workflow');
                  setActiveWorkflow(null);
              }
          }, 200);
      }

      else if (step.type === 'CONFIRM_ACTION') {
          if (step.actionType === 'CREATE_PROJECT' && step.projectName) {
              console.log(`[Workflow Runner] Creating project automatically: ${step.projectName}`);
              setMessages(prev => [...prev, { role: "assistant", content: `⚙️ Creating project **${step.projectName}**... Please wait.` }]);
              
              const formData = new FormData();
              formData.append('projectName', step.projectName);
              formData.append('dialect', step.dialect || 'postgresql');
              formData.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
              
              createProjectAction(formData).then(result => {
                  if (result.success && result.project) {
                      setProject(result.project);
                      setMessages(prev => {
                          const filtered = prev.filter(m => !m.content.includes("Creating project"));
                          return [...filtered, { role: "assistant", content: ` Successfully created and switched to project **${step.projectName}**!` }];
                      });
                      advanceWorkflow();
                  } else {
                      localStorage.removeItem('flux_active_workflow');
                      setActiveWorkflow(null);
                      setMessages(prev => {
                          const filtered = prev.filter(m => !m.content.includes("Creating project"));
                          return [...filtered, { role: "assistant", content: `❌ Failed to create project: ${result.error || 'Unknown error'}` }];
                      });
                  }
              }).catch(err => {
                  localStorage.removeItem('flux_active_workflow');
                  setActiveWorkflow(null);
                  setMessages(prev => {
                      const filtered = prev.filter(m => !m.content.includes("Creating project"));
                      return [...filtered, { role: "assistant", content: `❌ Error creating project: ${err.message || err}` }];
                  });
              });
          }
          else if (step.actionType === 'EXECUTE_SQL' && step.query) {
              console.log(`[Workflow Runner] Executing SQL automatically: ${step.query}`);
              setMessages(prev => [...prev, { role: "assistant", content: `⚙️ Executing query \`${step.query}\`... Please wait.` }]);
              
              const runSql = (activeProject: any) => {
                  fetch('/api/execute-sql', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ projectId: activeProject.project_id, query: step.query })
                  }).then(res => res.json()).then(result => {
                      if (result.success) {
                          if (typeof window !== 'undefined') {
                              window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId: activeProject.project_id } }));
                          }
                          setMessages(prev => {
                              const filtered = prev.filter(m => !m.content.includes("Executing query"));
                              return [...filtered, { role: "assistant", content: ` Successfully executed SQL query: \`${step.query}\`` }];
                          });
                          advanceWorkflow();
                      } else {
                          localStorage.removeItem('flux_active_workflow');
                          setActiveWorkflow(null);
                          setMessages(prev => {
                              const filtered = prev.filter(m => !m.content.includes("Executing query"));
                              return [...filtered, { role: "assistant", content: `❌ Failed to execute SQL: ${result.error?.message || 'Unknown error'}` }];
                          });
                      }
                  }).catch(err => {
                      localStorage.removeItem('flux_active_workflow');
                      setActiveWorkflow(null);
                      setMessages(prev => {
                          const filtered = prev.filter(m => !m.content.includes("Executing query"));
                          return [...filtered, { role: "assistant", content: `❌ Error executing SQL: ${err.message || err}` }];
                      });
                  });
              };

              if (project) {
                  runSql(project);
              } else {
                  console.log(`[Workflow Runner] Waiting for project context to initialize...`);
                  localStorage.removeItem('flux_active_workflow');
                  setActiveWorkflow(null);
                  setMessages(prev => {
                      const filtered = prev.filter(m => !m.content.includes("Executing query"));
                      return [...filtered, { role: "assistant", content: `❌ Failed to execute SQL: No project active.` }];
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


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsTyping(true);

    try {
      const currentMsgs = [...messages, { role: "user", content: userMsg }];
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMsgs,
          currentPath: pathname,
          model: selectedModel
        })
      });      const data = await res.json();
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
            className="fixed right-0 top-0 bottom-0 z-50 w-[380px] sm:w-[420px] flex flex-col bg-card border-l border-border shadow-2xl"
          >
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
                  className="h-7 px-1.5 mr-1.5 rounded border border-border bg-background text-[10.5px] font-medium text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[130px] truncate select-none shadow-sm"
                  title="Select AI Model"
                >
                  <option value="googleai/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="googleai/gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="openai">GPT-4o Mini (OpenAI)</option>
                  <option value="groq">Llama 3.3 (Groq)</option>
                  <option value="xai">Grok 2 (xAI)</option>
                  <option value="nvidia">Llama 3.1 (Nvidia)</option>
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

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
              {messages.map((msg, idx) => (
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
                    className={`max-w-[82%] text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2.5 shadow-sm'
                        : 'bg-secondary/60 border border-border/50 text-foreground rounded-2xl rounded-bl-sm px-3.5 py-2.5'
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