import { useEffect, useRef } from 'react';

type KeyCombination = {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    meta?: boolean;
    alt?: boolean;
};

type ShortcutHandler = () => void;

interface Shortcut {
    combination: KeyCombination | string | (string | KeyCombination)[];
    handler: ShortcutHandler;
    description?: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled: boolean = true) {
    const sequenceRef = useRef<string[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // Check if user is typing in an input, textarea, or contentEditable
            const target = event.target as HTMLElement;
            const isTyping = 
                ['INPUT', 'TEXTAREA'].includes(target.tagName) || 
                target.isContentEditable ||
                target.closest('.monaco-editor'); // Special case for Monaco

            if (isTyping && !event.ctrlKey && !event.metaKey) {
                // If typing, only allow combos with Ctrl/Meta (like Ctrl+Enter)
                return;
            }

            // Normalizing the event key
            const eventKey = event.key.toLowerCase();
            const isModifier = ['control', 'shift', 'alt', 'meta'].includes(eventKey);
            
            if (isModifier) return;

            // Handle sequences (e.g., G then D)
            sequenceRef.current.push(eventKey);
            if (timerRef.current) clearTimeout(timerRef.current);
            
            timerRef.current = setTimeout(() => {
                sequenceRef.current = [];
            }, 1000); // 1 second window for sequences

            const currentSequence = sequenceRef.current.join(' ');

            for (const shortcut of shortcuts) {
                const combinations = Array.isArray(shortcut.combination) 
                    ? shortcut.combination 
                    : [shortcut.combination];

                for (const combo of combinations) {
                    if (typeof combo === 'string') {
                        // Match single key or sequence string
                        if (combo.toLowerCase() === eventKey || combo.toLowerCase() === currentSequence) {
                            event.preventDefault();
                            shortcut.handler();
                            sequenceRef.current = [];
                            return;
                        }
                    } else {
                        // Match complex combination
                        const matchesKey = combo.key.toLowerCase() === eventKey;
                        const matchesCtrl = !!combo.ctrl === (event.ctrlKey || event.metaKey); // Treat Meta as Ctrl for Mac compatibility
                        const matchesShift = !!combo.shift === event.shiftKey;
                        const matchesAlt = !!combo.alt === event.altKey;

                        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
                            event.preventDefault();
                            shortcut.handler();
                            sequenceRef.current = [];
                            return;
                        }
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [shortcuts, enabled]);
}
