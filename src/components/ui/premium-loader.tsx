'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PremiumLoaderProps {
    className?: string;
    text?: string;
    fullScreen?: boolean;
    /** 0–100. If omitted the bar runs an indeterminate animation. */
    progress?: number;
}

/* Aurora canvas — same palette as Aurora.tsx / landing page */
function AuroraBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let raf: number;
        let t = 0;
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        const draw = () => {
            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, width, height);
            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#140a03');
            grad.addColorStop(0.5, '#3a1c08');
            grad.addColorStop(1, '#000000');
            ctx.fillStyle = grad;
            ctx.filter = 'blur(80px)';
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            const yBase = height * 0.52;
            for (let x = 0; x <= width; x += 8) {
                const y = yBase + Math.sin(x * 0.004 + t) * height * 0.18 + Math.sin(x * 0.008 - t * 0.6) * height * 0.09;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.lineTo(width, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1; ctx.filter = 'none';
            t += 0.003;
            raf = requestAnimationFrame(draw);
        };
        resize(); window.addEventListener('resize', resize); draw();
        return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
    }, []);
    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

const BARS = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.9, 0.65, 0.75, 0.45];

export function PremiumLoader({ className, text = 'FLUXBASE', fullScreen = true, progress }: PremiumLoaderProps) {
    // Smoothly interpolate progress so the bar never jumps backwards
    const [displayProgress, setDisplayProgress] = useState(progress ?? 0);

    useEffect(() => {
        if (progress === undefined) return;
        setDisplayProgress((prev) => Math.max(prev, progress));
    }, [progress]);

    const isReal = progress !== undefined;

    return (
        <div className={`relative overflow-hidden flex flex-col items-center justify-center ${
            fullScreen ? 'h-screen w-screen fixed inset-0 z-[100]' : 'h-full w-full'
        } ${className ?? ''}`}>
            <AuroraBackground />

            {/* Grain overlay */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }}
            />

            <div className="relative z-10 flex flex-col items-center gap-10">
                {/* Wordmark */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-3"
                >
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.06))', border: '1px solid rgba(249,115,22,0.25)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <ellipse cx="12" cy="6" rx="8" ry="3" stroke="#f97316" strokeWidth="1.5" />
                            <path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6" stroke="#f97316" strokeWidth="1.5" />
                            <path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.4" />
                        </svg>
                    </div>
                    <span className="text-2xl font-bold tracking-tight"
                        style={{ background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.55) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
                        {text}
                    </span>
                </motion.div>

                {/* Bar chart animation */}
                <motion.div className="flex items-end gap-[3px] h-10"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.4 }}>
                    {BARS.map((h, i) => (
                        <motion.div key={i} className="w-[3px] rounded-full"
                            style={{ background: 'linear-gradient(to top, #f97316, rgba(249,115,22,0.3))', height: `${h * 100}%` }}
                            animate={{ scaleY: [h, h * 0.35, h * 0.8, h * 0.5, h], opacity: [0.7, 1, 0.6, 1, 0.7] }}
                            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
                        />
                    ))}
                </motion.div>

                {/* Status + progress bar */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.5 }}
                    className="flex flex-col items-center gap-2.5">
                    <span className="text-[10px] tracking-[0.3em] uppercase font-medium"
                        style={{ color: 'rgba(255,255,255,0.25)' }}>
                        Initializing workspace
                    </span>

                    {/* Progress bar track */}
                    <div className="w-48 h-[3px] rounded-full relative overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.07)' }}>

                        {isReal ? (
                            /* ── REAL progress fill ── */
                            <motion.div
                                className="absolute left-0 top-0 h-full rounded-full"
                                style={{ background: 'linear-gradient(90deg, #f97316, #fb923c)', boxShadow: '0 0 8px rgba(249,115,22,0.7)' }}
                                animate={{ width: `${displayProgress}%` }}
                                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                            />
                        ) : (
                            /* ── Indeterminate shimmer (fallback) ── */
                            <motion.div
                                className="absolute left-0 top-0 h-full w-1/3 rounded-full"
                                style={{ background: 'linear-gradient(90deg, transparent, #f97316, transparent)' }}
                                animate={{ x: ['-100%', '400%'] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 }}
                            />
                        )}

                        {/* Glowing leading dot — only in real mode */}
                        {isReal && (
                            <motion.div
                                className="absolute top-1/2 -translate-y-1/2 h-[5px] w-[5px] rounded-full -translate-x-1/2"
                                style={{ background: '#fdba74', boxShadow: '0 0 6px 2px rgba(249,115,22,0.9)', left: `${displayProgress}%` }}
                                animate={{ left: `${displayProgress}%` }}
                                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                            />
                        )}
                    </div>


                </motion.div>
            </div>
        </div>
    );
}
