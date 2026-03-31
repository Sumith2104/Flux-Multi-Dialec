'use client';

import { motion } from 'framer-motion';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PremiumLoaderProps {
    className?: string;
    text?: string;
    fullScreen?: boolean;
}

export function PremiumLoader({ className, text = "Loading your workspace...", fullScreen = true }: PremiumLoaderProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center bg-background",
            fullScreen ? "h-screen w-screen fixed inset-0 z-[100]" : "h-full w-full",
            className
        )}>
            <div className="relative">
                {/* Outer Glow Ring */}
                <motion.div
                    className="absolute -inset-4 rounded-full bg-primary/20 blur-xl px-2"
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
                
                {/* Rotating Border */}
                <motion.div
                    className="h-16 w-16 rounded-full border-2 border-primary/20 border-t-primary"
                    animate={{ rotate: 360 }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                />

                {/* Central Icon */}
                <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{
                        scale: [0.8, 1, 0.8],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                >
                    <Database className="h-6 w-6 text-primary" />
                </motion.div>
            </div>

            {/* Pulsing Text */}
            <motion.div
                className="mt-8 flex flex-col items-center gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <motion.span
                    className="text-sm font-medium tracking-widest uppercase text-muted-foreground"
                    animate={{
                        opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                >
                    {text}
                </motion.span>
                
                {/* Loading Bar */}
                <div className="h-0.5 w-32 bg-muted rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-primary"
                        animate={{
                            x: [-128, 128],
                        }}
                        transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                </div>
            </motion.div>
        </div>
    );
}
