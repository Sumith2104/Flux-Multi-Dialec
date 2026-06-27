"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function useDockItemSize(
  mouseX: MotionValue<number>,
  baseItemSize: number,
  magnification: number,
  distance: number,
  ref: React.RefObject<HTMLDivElement>,
  spring: { mass: number; stiffness: number; damping: number }
) {
  const mouseDistance = useTransform(mouseX, (val) => {
    if (typeof val !== "number" || isNaN(val)) return 0;
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize,
    };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize]
  );

  return useSpring(targetSize, spring);
}

interface DockItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  mouseX: MotionValue<number>;
  baseItemSize: number;
  magnification: number;
  distance: number;
  spring: { mass: number; stiffness: number; damping: number };
  badgeCount?: number;
}

function DockItem({
  icon,
  label,
  onClick,
  mouseX,
  baseItemSize,
  magnification,
  distance,
  spring,
  badgeCount,
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);
  const size = useDockItemSize(
    mouseX,
    baseItemSize,
    magnification,
    distance,
    ref,
    spring
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          ref={ref}
          style={{ width: size, height: size }}
          onHoverStart={() => isHovered.set(1)}
          onHoverEnd={() => isHovered.set(0)}
          onFocus={() => isHovered.set(1)}
          onBlur={() => isHovered.set(0)}
          onClick={onClick}
          className="relative flex shrink-0 snap-center cursor-pointer items-center justify-center rounded-full bg-secondary/80 text-foreground ring-1 ring-border/40 transition-colors hover:bg-muted"
          tabIndex={0}
          role="button"
          aria-haspopup="true"
        >
          <div className="flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={12}>
        <p className="text-xs font-medium">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface DockItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badgeCount?: number;
}

interface DockProps {
  items: DockItem[];
  className?: string;
  spring?: { mass: number; stiffness: number; damping: number };
  magnification?: number;
  distance?: number;
  baseItemSize?: number;
}

export default function Dock({
  items,
  className = "",
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 60,
  distance = 100,
  baseItemSize = 40,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const [compactDock, setCompactDock] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse), (max-width: 640px)");
    const update = () => setCompactDock(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const effectiveBaseItemSize = compactDock ? Math.min(baseItemSize, 36) : baseItemSize;
  const effectiveMagnification = compactDock ? effectiveBaseItemSize : magnification;
  const effectiveDistance = compactDock ? 0 : distance;

  return (
    <TooltipProvider delayDuration={100}>
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className={`flex h-14 max-w-[calc(100vw-1rem)] snap-x items-end gap-2 overflow-x-auto overflow-y-hidden rounded-lg border border-border/50 bg-background/90 px-2 pb-2 shadow-xl shadow-black/20 backdrop-blur-xl sm:h-16 sm:max-w-[calc(100vw-2rem)] sm:gap-3 sm:px-3 sm:pb-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${className}`}
        role="toolbar"
        aria-label="Application dock"
      >
        {items.map((item, index) => (
          <DockItem
            key={index}
            icon={item.icon}
            label={item.label}
            onClick={item.onClick}
            mouseX={mouseX}
            baseItemSize={effectiveBaseItemSize}
            magnification={effectiveMagnification}
            distance={effectiveDistance}
            spring={spring}
            badgeCount={item.badgeCount}
          />
        ))}
      </motion.div>
    </TooltipProvider>
  );
}
