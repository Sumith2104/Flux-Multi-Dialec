'use client';

import { motion } from 'framer-motion';

interface PremiumLoaderProps {
    className?: string;
    text?: string;
    fullScreen?: boolean;
    progress?: number;
}

export function PremiumLoader({ className, fullScreen = true }: PremiumLoaderProps) {
    return (
        <div className={`relative flex items-center justify-center bg-[#09090b] ${
            fullScreen ? 'h-screen w-screen fixed inset-0 z-[100]' : 'h-full w-full'
        } ${className ?? ''}`}>
            <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        className="w-2.5 h-2.5 bg-zinc-400 rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                            duration: 1.4,
                            repeat: Infinity,
                            delay: i * 0.2,
                            ease: "easeInOut"
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
