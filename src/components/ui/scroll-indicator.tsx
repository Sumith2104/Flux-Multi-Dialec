'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export function ScrollIndicator() {
  const pathname = usePathname();
  const [hasContentBelow, setHasContentBelow] = useState(false);
  const activeContainerRef = useRef<HTMLElement | null>(null);

  // Helper to find any active scroll container in the DOM (e.g. inside (app)/layout)
  const findScrollContainer = useCallback((): HTMLElement | null => {
    if (typeof document === 'undefined') return null;

    // 1. Explicitly tagged scroll container (e.g. in AppLayout)
    const tagged = document.querySelector<HTMLElement>('[data-scroll-container="true"]');
    if (tagged && tagged.scrollHeight > tagged.clientHeight + 25) {
      return tagged;
    }

    // 2. Main overflow container in dashboard/app layouts
    const mainOverflow = document.querySelector<HTMLElement>(
      'main div.overflow-auto, main div.overflow-y-auto, main.overflow-y-auto'
    );
    if (mainOverflow && mainOverflow.scrollHeight > mainOverflow.clientHeight + 25) {
      return mainOverflow;
    }

    // 3. Fallback: check any large scrollable element in <main>
    const candidates = document.querySelectorAll<HTMLElement>(
      'main [class*="overflow-y-auto"], main [class*="overflow-auto"], [role="main"]'
    );
    for (const el of Array.from(candidates)) {
      if (el.clientHeight > 200 && el.scrollHeight > el.clientHeight + 25) {
        return el;
      }
    }

    return null;
  }, []);

  const checkScroll = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const docEl = document.documentElement;
    const body = document.body;

    const windowScrollHeight = Math.max(
      docEl.scrollHeight,
      body.scrollHeight,
      docEl.offsetHeight,
      body.offsetHeight
    );
    const windowClientHeight = window.innerHeight || docEl.clientHeight;
    const windowScrollTop = window.scrollY || docEl.scrollTop || body.scrollTop || 0;

    const windowCanScroll = windowScrollHeight > windowClientHeight + 35;

    // Check if the window itself is the scroll context (e.g., landing page, docs, pricing)
    if (windowCanScroll) {
      activeContainerRef.current = null;
      const windowRemaining = windowScrollHeight - (windowScrollTop + windowClientHeight);
      setHasContentBelow(windowRemaining > 35);
      return;
    }

    // Check if an internal container is the scroll context (e.g., dashboard, settings, tables)
    const container = findScrollContainer();
    if (container) {
      activeContainerRef.current = container;
      const containerRemaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
      setHasContentBelow(containerRemaining > 35);
      return;
    }

    // Neither window nor container has scrollable content
    activeContainerRef.current = null;
    setHasContentBelow(false);
  }, [findScrollContainer]);

  useEffect(() => {
    // Initial check
    checkScroll();

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkScroll);
    };

    // Use event capture to detect scroll events on window AND any child containers
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    // MutationObserver to react when dynamic data (projects, tables, queries) loads into the DOM
    const observer = new MutationObserver(() => {
      handleScroll();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    // Multiple staggered timers after navigation/mount to catch late hydration or async data
    const timer1 = setTimeout(checkScroll, 100);
    const timer2 = setTimeout(checkScroll, 350);
    const timer3 = setTimeout(checkScroll, 800);
    const timer4 = setTimeout(checkScroll, 1600);

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleScroll);
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
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

  // On pages with the floating dock, elevate the button so it doesn't overlap
  const isAppPage = pathname.startsWith('/dashboard') ||
                    pathname.startsWith('/settings') ||
                    pathname.startsWith('/analytics') ||
                    pathname.startsWith('/storage') ||
                    pathname.startsWith('/editor') ||
                    pathname.startsWith('/database') ||
                    pathname.startsWith('/query') ||
                    pathname.startsWith('/scraper');

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
            className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-300 hover:border-primary/60 hover:bg-background hover:text-primary hover:shadow-[0_6px_24px_rgba(255,122,26,0.3)] active:scale-90"
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
