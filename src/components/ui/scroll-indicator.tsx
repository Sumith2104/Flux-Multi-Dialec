'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

const BOTTOM_THRESHOLD_PX = 75;

export function ScrollIndicator() {
  const pathname = usePathname();
  const [hasContentBelow, setHasContentBelow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const lastCheckTimeRef = useRef(0);

  // Fast targeted scroll container finder (e.g., in AppLayout)
  const findScrollContainer = useCallback((): HTMLElement | null => {
    if (typeof document === 'undefined') return null;

    // 1. Explicitly tagged container in AppLayout
    const tagged = document.querySelector<HTMLElement>('[data-scroll-container="true"]');
    if (tagged && tagged.scrollHeight > tagged.clientHeight + 30) {
      return tagged;
    }

    // 2. Main overflow container in dashboard
    const mainOverflow = document.querySelector<HTMLElement>('main div.overflow-auto, main.overflow-y-auto');
    if (mainOverflow && mainOverflow.scrollHeight > mainOverflow.clientHeight + 30) {
      return mainOverflow;
    }

    return null;
  }, []);

  const checkScroll = useCallback((targetElement?: HTMLElement | null) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // 1. If a specific scrollable element triggered the scroll or is active:
    const target = targetElement || activeContainerRef.current;
    if (target && target.scrollHeight > target.clientHeight + 30) {
      const remaining = target.scrollHeight - (target.scrollTop + target.clientHeight);
      const nextVal = remaining > BOTTOM_THRESHOLD_PX;
      setHasContentBelow(prev => prev !== nextVal ? nextVal : prev);
      return;
    }

    // 2. Check if an app container exists and is scrollable (prioritized over window for app routes)
    const container = findScrollContainer();
    if (container) {
      activeContainerRef.current = container;
      const isScrollable = container.scrollHeight > container.clientHeight + 40;
      if (!isScrollable) {
        setHasContentBelow(prev => prev !== false ? false : prev);
        return;
      }
      const remaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
      const nextVal = remaining > BOTTOM_THRESHOLD_PX;
      setHasContentBelow(prev => prev !== nextVal ? nextVal : prev);
      return;
    }

    // 3. Fallback to window scroll (public pages like /, /pricing, /docs)
    const docEl = document.documentElement;
    const body = document.body;
    const windowScrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight);
    const windowClientHeight = window.innerHeight || docEl.clientHeight;
    const windowScrollTop = window.scrollY || docEl.scrollTop || body.scrollTop || 0;

    const windowCanScroll = windowScrollHeight > windowClientHeight + 40;
    if (windowCanScroll) {
      activeContainerRef.current = null;
      const remaining = windowScrollHeight - (windowScrollTop + windowClientHeight);
      const nextVal = remaining > BOTTOM_THRESHOLD_PX;
      setHasContentBelow(prev => prev !== nextVal ? nextVal : prev);
      return;
    }

    // Not scrollable
    activeContainerRef.current = null;
    setHasContentBelow(prev => prev !== false ? false : prev);
  }, [findScrollContainer]);

  useEffect(() => {
    setMounted(true);
    checkScroll();

    let scrollRafId: number | null = null;

    const handleScroll = (e: Event) => {
      const now = performance.now();
      if (now - lastCheckTimeRef.current < 80) return;
      lastCheckTimeRef.current = now;

      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      const target = e.target instanceof HTMLElement && e.target.scrollHeight > e.target.clientHeight + 30
        ? e.target
        : null;

      scrollRafId = requestAnimationFrame(() => {
        if (target) {
          activeContainerRef.current = target;
          const remaining = target.scrollHeight - (target.scrollTop + target.clientHeight);
          const nextVal = remaining > BOTTOM_THRESHOLD_PX;
          setHasContentBelow(prev => prev !== nextVal ? nextVal : prev);
          return;
        }
        checkScroll(null);
      });
    };

    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => checkScroll(null), 120);
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleResize, { passive: true });

    // Lightweight staggered timers after navigation to catch dynamic data
    const timer1 = setTimeout(() => checkScroll(null), 100);
    const timer2 = setTimeout(() => checkScroll(null), 350);
    const timer3 = setTimeout(() => checkScroll(null), 900);

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
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
