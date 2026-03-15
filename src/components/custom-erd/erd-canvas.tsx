'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type Table, type Column, type Constraint } from '@/lib/data';
import dagre from 'dagre';
import { TableNode } from './table-node';
import { RelationshipEdges } from './relationship-edges';

interface ErdCanvasProps {
  tables: Table[];
  columns: Column[];
  constraints: Constraint[];
  projectId: string;
}

const POSITIONS_KEY = 'fluxbase-custom-erd-positions';

export function ErdCanvas({ tables, columns, constraints, projectId }: ErdCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const storageKey = `${POSITIONS_KEY}-${projectId}`;
  // Track if mouse is over canvas to conditionally block zoom
  const [isHovering, setIsHovering] = useState(false);

  // Prevent native browser zoom forcefully when hovering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // We must catch the wheel event natively to stop trackpad pinch-to-zoom.
    const blockNativeZoom = (e: WheelEvent) => {
      if (!isHovering) return;
      // ctrlKey is true for pinch gestures on trackpads
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    
    // passive: false is required to let us call e.preventDefault()
    container.addEventListener('wheel', blockNativeZoom, { passive: false });
    
    // Also block touch pad zooming gestures only if hovering
    const blockTouchZoom = (e: TouchEvent) => {
        if (!isHovering) return;
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    };
    container.addEventListener('touchmove', blockTouchZoom, { passive: false });

    return () => {
        container.removeEventListener('wheel', blockNativeZoom);
        container.removeEventListener('touchmove', blockTouchZoom);
    };
  }, [isHovering]);

  // Transform state for panning and zooming
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Node state tracking positions
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number, y: number, width: number, height: number }>>({});
  const [isCalculated, setIsCalculated] = useState(false);

  // Parse constraints to easily find PKs and FKs
  const pkConstraints = new Map<string, Set<string>>();
  const fkConstraints = new Map<string, Set<string>>();

  constraints.forEach(c => {
    const keyMap = c.type === 'PRIMARY KEY' ? pkConstraints : fkConstraints;
    if (!keyMap.has(c.table_id)) {
      keyMap.set(c.table_id, new Set());
    }
    c.column_names.split(',').forEach(colName => {
      keyMap.get(c.table_id)!.add(colName);
    });
  });

  // Load saved positions or calculate layout using Dagre
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    let savedPositions: Record<string, { x: number, y: number }> = saved ? JSON.parse(saved) : {};

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    tables.forEach(t => {
      const tableCols = columns.filter(c => c.table_id === t.table_id);
      const width = 250;
      const height = 40 + (tableCols.length * 28) + 16;
      g.setNode(t.table_id, { width, height });
    });

    // Add edges for layout calculation only
    constraints
      .filter((c) => c.type === 'FOREIGN KEY' && c.referenced_table_id)
      .forEach((c) => {
        g.setEdge(c.table_id, c.referenced_table_id!);
      });

    dagre.layout(g);

    const initialPositions: Record<string, { x: number, y: number, width: number, height: number }> = {};
    
    // Attempt to center the entire graph
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    tables.forEach(t => {
      const node = g.node(t.table_id);
      if (savedPositions[t.table_id]) {
        initialPositions[t.table_id] = {
            ...savedPositions[t.table_id],
            width: node.width,
            height: node.height
        };
      } else {
        initialPositions[t.table_id] = {
          x: node.x - node.width / 2,
          y: node.y - node.height / 2,
          width: node.width,
          height: node.height
        };
      }
      
      const pos = initialPositions[t.table_id];
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });

    // Auto-center and fit-to-view canvas on load
    if (containerRef.current && tables.length > 0) {
        const rect = containerRef.current.getBoundingClientRect();
        
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Calculate scale to fit with 100px padding, bounded between 0.2x and 1x zoom
        const scaleX = rect.width / (graphWidth + 200);
        const scaleY = rect.height / (graphHeight + 200);
        const initialScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY)), 1);

        setTransform({
            scale: initialScale,
            x: (rect.width / 2) - ((minX + graphWidth / 2) * initialScale),
            y: (rect.height / 2) - ((minY + graphHeight / 2) * initialScale)
        });
    }

    setNodePositions(initialPositions);
    setIsCalculated(true);
  }, [tables, columns, constraints]);

  const onPointerEnter = () => {
    setIsHovering(true);
    document.body.style.overscrollBehavior = 'none';
  };

  const onPointerLeave = () => {
    setIsHovering(false);
    setIsDraggingCanvas(false);
    document.body.style.overscrollBehavior = '';
  };

  // Handle Canvas Panning
  const onPointerDown = (e: React.PointerEvent) => {
    // Only drag on canvas background, not on nodes
    if ((e.target as HTMLElement).closest('.erd-node')) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingCanvas) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setIsDraggingCanvas(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Handle Canvas Zooming
  const onWheel = (e: React.WheelEvent) => {
    // Prevent default scroll
    e.preventDefault(); 
    
    if (e.ctrlKey || e.metaKey) {
        // Zooming
        const scaleBy = 1.05;
        const newScale = e.deltaY > 0 ? transform.scale / scaleBy : transform.scale * scaleBy;
        
        // Clamp scale
        const clampedScale = Math.min(Math.max(0.2, newScale), 2);
        
        // Zoom to pointer
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const pointerX = e.clientX - rect.left;
            const pointerY = e.clientY - rect.top;
            
            setTransform(prev => ({
                scale: clampedScale,
                x: pointerX - (pointerX - prev.x) * (clampedScale / prev.scale),
                y: pointerY - (pointerY - prev.y) * (clampedScale / prev.scale),
            }));
        }
    } else {
        // Panning (like trackpad)
        setTransform(prev => ({
            ...prev,
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY
        }));
    }
  };

  const handleNodeDrag = useCallback((tableId: string, dx: number, dy: number) => {
    setNodePositions(prev => {
        const current = prev[tableId];
        if (!current) return prev;
        
        return {
            ...prev,
            [tableId]: {
                ...current,
                x: current.x + (dx / transform.scale),
                y: current.y + (dy / transform.scale)
            }
        };
    });
  }, [transform.scale]);

  // Persist node positions to localStorage safely outside the render drag loop
  useEffect(() => {
    if (!isCalculated || Object.keys(nodePositions).length === 0) return;
    const timeoutId = setTimeout(() => {
        localStorage.setItem(storageKey, JSON.stringify(nodePositions));
    }, 500); // 500ms debounce
    return () => clearTimeout(timeoutId);
  }, [nodePositions, isCalculated, storageKey]);


  if (!isCalculated) return <div ref={containerRef} className="w-full h-full bg-black flex items-center justify-center text-zinc-500">Calculating layout...</div>;

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full bg-[#0a0a0a] overflow-hidden cursor-grab active:cursor-grabbing"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerLeave}
        onWheel={onWheel}
        style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)`,
            backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`
        }}
    >
      <div 
        className="absolute top-0 left-0 w-full h-full transform-gpu origin-top-left"
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
      >
        {/* Draw edges first so they are underneath nodes */}
        <RelationshipEdges 
            tables={tables} 
            columns={columns} 
            constraints={constraints} 
            nodePositions={nodePositions} 
        />

        {/* Draw table nodes */}
        {tables.map(table => {
          const tableCols = columns.filter(c => c.table_id === table.table_id);
          const pks = pkConstraints.get(table.table_id) || new Set();
          const fks = fkConstraints.get(table.table_id) || new Set();
          const pos = nodePositions[table.table_id];

          if (!pos) return null;

          return (
            <TableNode
              key={table.table_id}
              table={table}
              columns={tableCols}
              pks={pks}
              fks={fks}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              onDrag={(dx: number, dy: number) => handleNodeDrag(table.table_id, dx, dy)}
            />
          );
        })}
      </div>

      {/* Basic Controls Overlay */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-zinc-900/80 p-1.5 rounded-lg border border-white/10 backdrop-blur-md z-50">
          <button onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(2, prev.scale + 0.2) }))} className="w-8 h-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">+</button>
          <span className="text-xs font-mono text-zinc-400 w-12 text-center">{Math.round(transform.scale * 100)}%</span>
          <button onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(0.2, prev.scale - 0.2) }))} className="w-8 h-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">-</button>
      </div>
    </div>
  );
}
