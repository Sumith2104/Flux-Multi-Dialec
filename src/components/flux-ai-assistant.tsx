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

  // Enhanced markdown-ish formatter for chat bubbles
  const formatText = (text: string) => {
    const parseFormatting = (str: string) => {
      const parts = str.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
      return parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={idx} className="px-1.5 py-0.5 rounded-md bg-background/50 dark:bg-secondary text-orange-200 font-mono text-[12px]">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx} className="font-bold text-white drop-shadow-md tracking-wide">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={idx} className="italic text-white/90">{part.slice(1, -1)}</em>;
        }
        return <span key={idx}>{part}</span>;
      });
    };

    return text.split("\n").map((line, i) => {
      if (line.includes("```")) {
          return <div key={i} className="text-xs bg-background/70 dark:bg-secondary p-3 rounded-lg my-2 font-mono overflow-x-auto border border-border/50">{line.replace(/```/g, '')}</div>;
      }
      return <p key={i} className="mb-2 last:mb-0 break-words leading-relaxed">{parseFormatting(line)}</p>;
    });
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
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          {/* Side Panel */}
          <motion.div
            initial={{ opacity: 0, x: 420 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 420 }}
            transition={{ duration: 0.3, type: "spring", bounce: 0.15 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[380px] sm:w-[420px] bg-background/90 backdrop-blur-3xl border-l border-border/70 shadow-2xl flex flex-col"
          >
            <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-orange-500/20 to-transparent pointer-events-none" />
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-5 shrink-0 relative z-10 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-orange-500 to-rose-500 shadow-lg shadow-orange-500/30">
                  <AiIcon size={14} className="text-white relative z-10" />
                  <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" style={{ animationDuration: '3s' }} />
                </div>
                <div>
                  <h3 className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-rose-500">Flux AI</h3>
                  <p className="text-[11px] text-muted-foreground/80 lowercase tracking-wide font-medium">Platform Guide</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={toggleVoice} className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 rounded-full transition-all" title={voiceEnabled ? "Mute Voice" : "Enable Voice"}>
                  {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button onClick={() => onOpenChange(false)} className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 rounded-full transition-all">
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scrollbar-thin scrollbar-thumb-white/10 relative z-10">
              {messages.map((msg, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-4 py-3.5 text-[13.5px] leading-relaxed shadow-sm ${msg.role === "user" ? "bg-gradient-to-br from-orange-500 to-rose-600 text-white rounded-2xl rounded-br-sm font-medium shadow-orange-500/20" : "bg-secondary/40 backdrop-blur-md border border-border/50 text-foreground/90 rounded-2xl rounded-bl-sm"}`}>
                    {formatText(msg.content)}
                    {msg.pendingAction && (
                        <div className="mt-3 flex gap-2">
                             <button onClick={() => executePendingAction(idx, msg.pendingAction)} className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"><CheckCircle2 size={12} /> Approve</button>
                             <button onClick={() => cancelPendingAction(idx)} className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-rose-300 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"><XCircle size={12} /> Cancel</button>
                        </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                  <div className="bg-secondary/40 backdrop-blur-md border border-border/50 text-foreground/70 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-xs font-medium">
                    <Loader2 size={14} className="animate-spin text-orange-500" /> Thinking...
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Input Area */}
            <div className="p-4 shrink-0 relative z-10 border-t border-border/50">
              <form onSubmit={handleSend} className="relative flex items-center group">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask me anything..." className="w-full bg-secondary/40 hover:bg-secondary border border-border/70 rounded-2xl pl-5 pr-14 py-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent transition-all backdrop-blur-md placeholder:text-muted-foreground/50" disabled={isTyping} autoFocus />
                <button type="submit" disabled={!input.trim() || isTyping} className="absolute right-2 p-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-lg hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  <ArrowUp size={16} strokeWidth={2.5} className="text-white" />
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}