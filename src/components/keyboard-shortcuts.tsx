'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShortcutGroup {
    title: string;
    shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
    {
        title: 'Global',
        shortcuts: [
            { keys: ['⌘', 'K'], description: 'Open Command Palette' },
            { keys: ['?'], description: 'Show Keyboard Shortcuts' },
            { keys: ['⌘', '/'], description: 'Toggle AI Assistant' },
        ],
    },
    {
        title: 'Navigation',
        shortcuts: [
            { keys: ['G', 'D'], description: 'Go to Dashboard' },
            { keys: ['G', 'E'], description: 'Go to Table Editor' },
            { keys: ['G', 'Q'], description: 'Go to SQL Editor' },
            { keys: ['G', 'A'], description: 'Go to Analytics' },
            { keys: ['G', 'S'], description: 'Go to Settings' },
        ],
    },
    {
        title: 'SQL Editor',
        shortcuts: [
            { keys: ['⌘', 'Enter'], description: 'Run Query' },
            { keys: ['⌘', 'Shift', 'F'], description: 'Format SQL' },
            { keys: ['⌘', 'Z'], description: 'Undo' },
            { keys: ['⌘', 'Shift', 'Z'], description: 'Redo' },
        ],
    },
    {
        title: 'Table Editor',
        shortcuts: [
            { keys: ['N'], description: 'Add New Row' },
            { keys: ['⌘', 'F'], description: 'Find in Table' },
            { keys: ['Del'], description: 'Delete Selected Row' },
            { keys: ['Esc'], description: 'Cancel Edit' },
        ],
    },
];

export function KeyboardShortcuts() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            const isTyping = ['input', 'textarea'].includes(tag) || (e.target as HTMLElement).isContentEditable;
            if (e.key === '?' && !isTyping && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                setOpen(o => !o);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground hidden lg:flex items-center justify-center"
                id="keyboard-shortcuts-button"
                title="Keyboard Shortcuts (?)"
            >
                <Keyboard className="h-4 w-4" />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Keyboard className="h-4 w-4 text-orange-400" />
                            Keyboard Shortcuts
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
                        {SHORTCUTS.map(group => (
                            <div key={group.title}>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                                    {group.title}
                                </h4>
                                <div className="space-y-2">
                                    {group.shortcuts.map((s, i) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <span className="text-sm text-zinc-400">{s.description}</span>
                                            <div className="flex items-center gap-1">
                                                {s.keys.map((key, ki) => (
                                                    <kbd
                                                        key={ki}
                                                        className="flex h-6 min-w-6 items-center justify-center rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-300"
                                                    >
                                                        {key}
                                                    </kbd>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-zinc-800 text-xs text-zinc-600 text-center">
                        Press <kbd className="rounded border border-zinc-700 px-1 bg-zinc-800 font-mono text-zinc-400">?</kbd> anywhere to toggle this panel
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
