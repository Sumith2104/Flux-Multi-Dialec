'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquarePlus, Star, Loader2, CheckCircle2, Frown, Meh, Smile, SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const moods = [
    { label: 'Bad', icon: Frown, value: 1, color: 'text-red-400 border-red-500/20 hover:bg-red-500/10' },
    { label: 'Okay', icon: Meh, value: 2, color: 'text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10' },
    { label: 'Good', icon: Smile, value: 3, color: 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10' },
    { label: 'Love it', icon: SmilePlus, value: 4, color: 'text-blue-400 border-blue-500/20 hover:bg-blue-500/10' },
];

export function FeedbackWidget() {
    const [open, setOpen] = useState(false);
    const [mood, setMood] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim() && mood === null) return;
        setLoading(true);
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mood, message: message.trim() }),
            });
            setSubmitted(true);
            setTimeout(() => {
                setOpen(false);
                setSubmitted(false);
                setMood(null);
                setMessage('');
            }, 1800);
        } catch (e) {
            console.error('Feedback submit error:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground px-2"
                    id="feedback-button"
                >
                    <MessageSquarePlus className="h-4 w-4" />
                    <span className="hidden md:inline text-xs">Feedback</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 bg-zinc-950 border-zinc-800" align="end">
                {submitted ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-3">
                        <div className="p-3 rounded-full bg-emerald-500/10">
                            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Thank you for your feedback!</p>
                        <p className="text-xs text-muted-foreground text-center">We&apos;ll use it to make Fluxbase better.</p>
                    </div>
                ) : (
                    <>
                        <div className="mb-4">
                            <h4 className="font-semibold text-sm text-foreground">Share Feedback</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Help us improve Fluxbase</p>
                        </div>

                        <div className="mb-4">
                            <Label className="text-xs text-muted-foreground mb-2 block">How's your experience?</Label>
                            <div className="flex gap-2">
                                {moods.map(({ label, icon: Icon, value, color }) => (
                                    <button
                                        key={value}
                                        onClick={() => setMood(value)}
                                        className={cn(
                                            'flex-1 flex flex-col items-center gap-1 py-2 rounded-md border text-xs transition-all',
                                            color,
                                            mood === value ? 'bg-opacity-20 ring-1 ring-current' : 'border-zinc-800 bg-zinc-900/50'
                                        )}
                                        id={`mood-${label.toLowerCase().replace(' ', '-')}`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="text-[10px]">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4">
                            <Label className="text-xs text-muted-foreground mb-2 block">Message (optional)</Label>
                            <Textarea
                                placeholder="Tell us what you think, report a bug, or suggest a feature..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                className="bg-zinc-900 border-zinc-800 text-sm min-h-[80px] resize-none focus-visible:ring-orange-500/50"
                                id="feedback-message"
                            />
                        </div>

                        <Button
                            onClick={handleSubmit}
                            disabled={loading || (!message.trim() && mood === null)}
                            className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-500 text-white"
                            id="feedback-submit"
                        >
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send Feedback'}
                        </Button>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
