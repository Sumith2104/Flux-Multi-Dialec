"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Volume2, VolumeX, Loader2, ArrowUp, CheckCircle2, XCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useContext } from "react";
import { ProjectContext } from "@/contexts/project-context";
import { createProjectAction } from "@/components/layout/actions";

type Message = {
  role: "user" | "assistant";
  content: string;
  pendingAction?: {
    type: "CREATE_PROJECT" | "EXECUTE_SQL";
    projectName?: string;
    dialect?: string;
    query?: string;
  };
};

const AiIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/>
    <path d="M19 4L19.8 6.2L22 7L19.8 7.8L19 10L18.2 7.8L16 7L18.2 6.2L19 4Z" fill="currentColor"/>
    <path d="M5 16L5.8 18.2L8 19L5.8 19.8L5 22L4.2 19.8L2 19L4.2 18.2L5 16Z" fill="currentColor"/>
  </svg>
);

export function FluxAiAssistant({ userId, isOpen, onOpenChange }: { userId: string; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const isRestored = useRef(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  const pathname = usePathname();
  const router = useRouter();
  const { project, setProject } = useContext(ProjectContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        // localStorage.setItem is synchronous â€” large payloads hurt main thread on every render.
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
          currentPath: pathname
        })
      });

      const data = await res.json();
      if (data.success) {
        let responseText = data.text;
        
        // Intercept Agentic Navigation Commands
        const navMatch = responseText.match(/\[NAVIGATE:\s*(.+?)\s*\]/i);
        if (navMatch) {
          let targetUrl = navMatch[1].trim();
          
          // Automatically inject projectId to preserve dashboard context
          if (project?.project_id && !targetUrl.includes('projectId')) {
             const separator = targetUrl.includes('?') ? '&' : '?';
             targetUrl += `${separator}projectId=${project.project_id}`;
          }
          
          router.push(targetUrl);
          // Clean the hidden command from the visible text bubble
          responseText = responseText.replace(/\[NAVIGATE:\s*.+?\s*\]/ig, '').trim();
        }

        // Intercept UI Clicks
        const clickMatch = responseText.match(/\[CLICK:\s*(.+?)\s*\]/i);
        if (clickMatch) {
            const targetText = clickMatch[1].trim();
            simulateClick(targetText);
            responseText = responseText.replace(/\[CLICK:\s*.+?\s*\]/ig, '').trim();
        }

        // Intercept UI Types
        const typeMatch = responseText.match(/\[TYPE:\s*(.+?)\s*:\s*(.+?)\s*\]/i);
        if (typeMatch) {
            const value = typeMatch[1].trim();
            const locator = typeMatch[2].trim();
            simulateType(value, locator);
            responseText = responseText.replace(/\[TYPE:\s*.+?\s*:\s*.+?\s*\]/ig, '').trim();
        }

        // Intercept Dangerous Agentic Execution Commands
        const projectMatch = responseText.match(/\[CONFIRM_ACTION:CREATE_PROJECT:(.+?):(.+?)\]/i);
        const sqlMatch = responseText.match(/\[CONFIRM_ACTION:EXECUTE_SQL:(.+?)\]/i);
        
        let pendingActionObj = undefined;
        if (projectMatch) {
          const projectName = projectMatch[1].trim();
          const dialect = projectMatch[2].trim() || 'postgresql';
          pendingActionObj = { type: "CREATE_PROJECT", projectName, dialect } as any;
          responseText = responseText.replace(/\[CONFIRM_ACTION:CREATE_PROJECT:.+?\]/ig, '').trim();
        } else if (sqlMatch) {
          const query = sqlMatch[1].trim();
          pendingActionObj = { type: "EXECUTE_SQL", query } as any;
          responseText = responseText.replace(/\[CONFIRM_ACTION:EXECUTE_SQL:[\s\S]+?\]/ig, '').trim();
        }

        setMessages(prev => [...prev, {
             role: "assistant",
             content: responseText,
             pendingAction: pendingActionObj
        }]);


        speak(responseText);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Oops, my brain disconnected. Please try asking again." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting to Fluxbase servers right now." }]);
    } finally {
      setIsTyping(false);
    }
  };



  const simulateType = (value: string, locator: string) => {
      setTimeout(() => {
          const inputs = Array.from(document.querySelectorAll('input, textarea')) as (HTMLInputElement | HTMLTextAreaElement)[];
          
          let targetEl: HTMLInputElement | HTMLTextAreaElement | undefined;
          const cleanLocator = locator.toLowerCase().replace(/[^a-z0-9]/g, '');
          
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
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                  const originalBoxShadow = targetEl!.style.boxShadow;
                  const originalTransition = targetEl!.style.transition;
                  targetEl!.style.transition = 'all 0.3s';
                  targetEl!.style.boxShadow = '0 0 15px 5px rgba(249,115,22,0.5)';
                  targetEl!.focus();
                  
                  let i = 0;
                  // For React 16+, we need to set the value using the native setter to trigger onChange properly
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                  
                  const typeChar = () => {
                      if (targetEl && i <= value.length) {
                          const currentVal = value.substring(0, i);
                          if (targetEl.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                              nativeTextAreaValueSetter.call(targetEl, currentVal);
                          } else if (nativeInputValueSetter) {
                              nativeInputValueSetter.call(targetEl, currentVal);
                          }
                          targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                          i++;
                          if (i <= value.length) {
                              setTimeout(typeChar, 30);
                          } else {
                              setTimeout(() => {
                                  targetEl!.style.boxShadow = originalBoxShadow;
                                  targetEl!.style.transition = originalTransition;
                              }, 500);
                          }
                      }
                  };
                  typeChar();
              }, 400);
          } else {
              console.warn('Could not find input for:', locator);
          }
      }, 100);
  };

  const simulateClick = (targetText: string) => {
    setTimeout(() => {
        const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const targetEl = elements.find(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text && text.includes(targetText.toLowerCase());
        }) as HTMLElement;

        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                const rect = targetEl.getBoundingClientRect();
                
                // Magical Ripple Effect
                const ripple = document.createElement('div');
                ripple.style.position = 'absolute'; // Changed to absolute for reliable positioning
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

                // Add magical glow to button temporarily
                const originalTransition = targetEl.style.transition;
                const originalBoxShadow = targetEl.style.boxShadow;
                targetEl.style.transition = 'all 0.3s';
                targetEl.style.boxShadow = '0 0 15px 5px rgba(249,115,22,0.5)';
                
                setTimeout(() => {
                    targetEl.click();
                    targetEl.style.boxShadow = originalBoxShadow;
                    targetEl.style.transition = originalTransition;
                    setTimeout(() => document.body.removeChild(ripple), 500);
                }, 300);
            }, 400);
        }
    }, 100);
  };

  const executePendingAction = (msgIndex: number, action: any) => {
      // Remove buttons from message and add execution loader
      setMessages(prev => {
          const newMsgs = [...prev];
          delete newMsgs[msgIndex].pendingAction;
          return [...newMsgs, { role: "assistant", content: "âš™ï¸ Executing action... Please wait." }];
      });

      if (action.type === "CREATE_PROJECT") {
          const formData = new FormData();
          formData.append('projectName', action.projectName);
          formData.append('dialect', action.dialect);
          formData.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
          
          createProjectAction(formData).then(result => {
             setMessages(prev => {
                 const newMsgs = prev.filter(m => m.content !== "âš™ï¸ Executing action... Please wait.");
                 if (result.success && result.project) {
                     setProject(result.project);
                     router.push('/dashboard/projects');
                     return [...newMsgs, { role: "assistant", content: `Successfully created and switched to project **${action.projectName}**!` }];
                 } else {
                     return [...newMsgs, { role: "assistant", content: `âŒ Failed to execute action: ${result.error}` }];
                 }
             });
          });
      } else if (action.type === "EXECUTE_SQL") {
          if (!project) {
             setMessages(prev => prev.filter(m => m.content !== "âš™ï¸ Executing action... Please wait.").concat({ role: "assistant", content: `âŒ Failed: No project selected.` }));
             return;
          }
          fetch('/api/execute-sql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId: project.project_id, query: action.query })
          }).then(res => res.json()).then(result => {
             setMessages(prev => {
                 const newMsgs = prev.filter(m => m.content !== "âš™ï¸ Executing action... Please wait.");
                 if (result.success) {
                     return [...newMsgs, { role: "assistant", content: `Successfully executed SQL query: \`${action.query}\`` }];
                 } else {
                     return [...newMsgs, { role: "assistant", content: `âŒ Failed to execute SQL: ${result.error?.message || 'Unknown error'}` }];
                 }
             });
          });
      }
  };

  const cancelPendingAction = (msgIndex: number) => {
      setMessages(prev => {
          const newMsgs = [...prev];
          delete newMsgs[msgIndex].pendingAction;
          return [...newMsgs, { role: "assistant", content: "Action cancelled stringently. What else can I help with?" }];
      });
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
                    {msg.pendingAction && (
                      <div className="mt-3 pt-3 border-t border-border/40 flex gap-2">
                        <button
                          onClick={() => executePendingAction(idx, msg.pendingAction)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-500/20 transition-colors"
                        >
                          <CheckCircle2 size={11} /> Approve
                        </button>
                        <button
                          onClick={() => cancelPendingAction(idx)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-medium border border-destructive/20 transition-colors"
                        >
                          <XCircle size={11} /> Cancel
                        </button>
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