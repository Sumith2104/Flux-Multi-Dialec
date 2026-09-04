'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export function ScrollIndicator() {
  const pathname = usePathname();
  const [hasContentBelow, setHasContentBelow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const lastCheckTimeRef = useRef(0);

  // Fast, targeted scroll container finder without querying all DOM elements
  const findScrollContainer = useCallback((): HTMLElement | null => {
    if (typeof document === 'undefined') return null;

    // 1. Explicitly tagged container in AppLayout
    const tagged = document.querySelector<HTMLElement>('[data-scroll-container="true"]');
    if (tagged && tagged.scrollHeight > tagged.clientHeight + 25) {
      return tagged;
    }

    // 2. Main overflow container in dashboard
    const mainOverflow = document.querySelector<HTMLElement>('main div.overflow-auto, main.overflow-y-auto');
    if (mainOverflow && mainOverflow.scrollHeight > mainOverflow.clientHeight + 25) {
      return mainOverflow;
    }

    return null;
  }, []);

  const checkScroll = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const docEl = document.documentElement;
    const body = document.body;

    const windowScrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight);
    const windowClientHeight = window.innerHeight;
    const windowScrollTop = window.scrollY || docEl.scrollTop || 0;

    const windowCanScroll = windowScrollHeight > windowClientHeight + 35;

    if (windowCanScroll) {
      activeContainerRef.current = null;
      const windowRemaining = windowScrollHeight - (windowScrollTop + windowClientHeight);
      setHasContentBelow(windowRemaining > 35);
      return;
    }

    const container = findScrollContainer();
    if (container) {
      activeContainerRef.current = container;
      const containerRemaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
      setHasContentBelow(containerRemaining > 35);
      return;
    }

    activeContainerRef.current = null;
    setHasContentBelow(false);
  }, [findScrollContainer]);

  useEffect(() => {
    setMounted(true);
    checkScroll();

    let scrollRafId: number | null = null;
    const handleScrollThrottled = () => {
      const now = performance.now();
      // Throttle to at most once per 120ms during active scrolling to prevent layout thrashing
      if (now - lastCheckTimeRef.current < 120) {
        return;
      }
      lastCheckTimeRef.current = now;

      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      scrollRafId = requestAnimationFrame(checkScroll);
    };

    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkScroll, 150);
    };

    window.addEventListener('scroll', handleScrollThrottled, { passive: true, capture: true });
    window.addEventListener('resize', handleResize, { passive: true });

    // Lightweight staggered timers after navigation to catch late data loading
    const timer1 = setTimeout(checkScroll, 120);
    const timer2 = setTimeout(checkScroll, 400);
    const timer3 = setTimeout(checkScroll, 1000);

    return () => {
      window.removeEventListener('scroll', handleScrollThrottled, { capture: true });
      window.removeEventListener('resize', handleResize);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      if (resizeTimer) clearTimeout(resizeTimer);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [checkScroll, pathname]);

  const handleScrollDown = () => {
    if (activeContainerRef.current) {
      const container = activeContainerRef.current;
      const step = Math.min(container.clientHeight * 0.75, 500);
      container.scrollBy({ top: step, behavior: 'smooth' });
    } else {
      const step = Math.min(window.innerHeight * 0.75, 650);
      window.scrollBy({ top: step, behavior: 'smooth' });
    }
  };

  const isAppPage = pathname.startsWith('/dashboard') ||
                    pathname.startsWith('/settings') ||
                    pathname.startsWith('/analytics') ||
                    pathname.startsWith('/storage') ||
                    pathname.startsWith('/editor') ||
                    pathname.startsWith('/database') ||
                    pathname.startsWith('/query') ||
                    pathname.startsWith('/scraper');

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {hasContentBelow && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-[45] pointer-events-auto",
            isAppPage ? "bottom-20 sm:bottom-24" : "bottom-6 sm:bottom-8"
          )}
        >
          <button
            onClick={handleScrollDown}
            style={{ borderRadius: '9999px' }}
            className="group relative flex h-9 w-9 items-center justify-center !rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-300 hover:border-primary/60 hover:bg-background hover:text-primary hover:shadow-[0_6px_24px_rgba(255,122,26,0.3)] active:scale-90"
            title="Scroll down"
            aria-label="Scroll down"
          >
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5 animate-bounce text-muted-foreground group-hover:text-primary" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
