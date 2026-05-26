'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type Table, type Column, type Constraint } from '@/lib/data';
import dagre from 'dagre';
import { TableNode } from './table-node';
import { RelationshipEdges } from './relationship-edges';
import { Maximize2, ArrowRight, ArrowDown, Grid, CircleDot, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export type LayoutMode = 'LR' | 'TB' | 'GRID' | 'TIERED' | 'RADIAL';

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
  const { toast } = useToast();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('LR');
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

  // Helper to calculate layout based on mode
  const getLayoutPositions = useCallback((mode: LayoutMode) => {
    const initialPositions: Record<string, { x: number, y: number, width: number, height: number }> = {};

    if (mode === 'GRID') {
      // Sort tables by connection count (degree) descending, then by name
      const connections = new Map<string, number>();
      tables.forEach(t => connections.set(t.table_id, 0));
      constraints.forEach(c => {
        if (c.type === 'FOREIGN KEY' && c.referenced_table_id) {
          connections.set(c.table_id, (connections.get(c.table_id) || 0) + 1);
          connections.set(c.referenced_table_id, (connections.get(c.referenced_table_id) || 0) + 1);
        }
      });

      const sortedTables = [...tables].sort((a, b) => {
        const connA = connections.get(a.table_id) || 0;
        const connB = connections.get(b.table_id) || 0;
        if (connB !== connA) return connB - connA;
        return a.table_name.localeCompare(b.table_name);
      });

      const cols = Math.max(2, Math.ceil(Math.sqrt(sortedTables.length)));
      const colWidth = 250;
      const colGap = 100;
      const rowGap = 80;

      // Track max height for each row
      const rowHeights: number[] = [];
      sortedTables.forEach((t, index) => {
        const rowIndex = Math.floor(index / cols);
        const tableCols = columns.filter(c => c.table_id === t.table_id);
        const height = 40 + (tableCols.length * 28) + 16;

        if (rowHeights[rowIndex] === undefined) {
          rowHeights[rowIndex] = 0;
        }
        rowHeights[rowIndex] = Math.max(rowHeights[rowIndex], height);
      });

      // Calculate cumulative row Y offsets
      const rowY: number[] = [];
      let currentY = 0;
      for (let r = 0; r < rowHeights.length; r++) {
        rowY[r] = currentY;
        currentY += rowHeights[r] + rowGap;
      }

      sortedTables.forEach((t, index) => {
        const colIndex = index % cols;
        const rowIndex = Math.floor(index / cols);
        const tableCols = columns.filter(c => c.table_id === t.table_id);
        const height = 40 + (tableCols.length * 28) + 16;

        initialPositions[t.table_id] = {
          x: colIndex * (colWidth + colGap),
          y: rowY[rowIndex],
          width: colWidth,
          height: height
        };
      });
    } else if (mode === 'TIERED') {
      // Assign levels based on dependency depth (topological level)
      const levels: Record<string, number> = {};
      tables.forEach(t => {
        levels[t.table_id] = 0;
      });

      // Iteratively resolve levels, avoiding cycles
      for (let i = 0; i < tables.length; i++) {
        let changed = false;
        constraints.forEach(c => {
          if (c.type === 'FOREIGN KEY' && c.referenced_table_id) {
            const currentLevel = levels[c.table_id] || 0;
            const refLevel = levels[c.referenced_table_id] || 0;
            if (currentLevel <= refLevel) {
              levels[c.table_id] = refLevel + 1;
              changed = true;
            }
          }
        });
        if (!changed) break;
      }

      // Group tables by level
      const levelGroups: Record<number, string[]> = {};
      tables.forEach(t => {
        const lvl = levels[t.table_id] || 0;
        if (!levelGroups[lvl]) levelGroups[lvl] = [];
        levelGroups[lvl].push(t.table_id);
      });

      const maxLevel = Math.max(0, ...Object.keys(levelGroups).map(Number));
      const colWidth = 250;
      const colGap = 160; // Spacious horizontal gap for visible connector lines
      const rowGap = 70;
      
      let currentX = 0;

      for (let lvl = 0; lvl <= maxLevel; lvl++) {
        const nodeIds = levelGroups[lvl] || [];
        if (nodeIds.length === 0) continue;

        // Sort nodes within level by connection count to place hubs centrally/cleanly
        const connections = new Map<string, number>();
        nodeIds.forEach(id => connections.set(id, 0));
        constraints.forEach(c => {
          if (c.type === 'FOREIGN KEY' && c.referenced_table_id) {
            if (connections.has(c.table_id)) connections.set(c.table_id, connections.get(c.table_id)! + 1);
            if (connections.has(c.referenced_table_id!)) connections.set(c.referenced_table_id!, connections.get(c.referenced_table_id!)! + 1);
          }
        });
        nodeIds.sort((a, b) => (connections.get(b) || 0) - (connections.get(a) || 0));

        // Wrap columns into sub-columns of max 5 nodes to prevent extreme height
        const maxPerCol = 5;
        const numSubCols = Math.ceil(nodeIds.length / maxPerCol);
        const subCols: string[][] = [];
        for (let c = 0; c < numSubCols; c++) {
          subCols.push(nodeIds.slice(c * maxPerCol, (c + 1) * maxPerCol));
        }

        subCols.forEach((subCol, subColIndex) => {
          let totalHeight = 0;
          const nodeHeights = subCol.map(id => {
            const tableCols = columns.filter(c => c.table_id === id);
            const height = 40 + (tableCols.length * 28) + 16;
            totalHeight += height;
            return height;
          });
          totalHeight += (subCol.length - 1) * rowGap;

          let runningY = -totalHeight / 2; // Center vertically around Y = 0

          subCol.forEach((id, nodeIndex) => {
            const height = nodeHeights[nodeIndex];
            initialPositions[id] = {
              x: currentX + (subColIndex * (colWidth + 80)),
              y: runningY,
              width: colWidth,
              height: height
            };
            runningY += height + rowGap;
          });
        });

        currentX += numSubCols * (colWidth + colGap);
      }
    } else if (mode === 'RADIAL') {
      // Find degree of each table
      const connections = new Map<string, number>();
      tables.forEach(t => connections.set(t.table_id, 0));
      constraints.forEach(c => {
        if (c.type === 'FOREIGN KEY' && c.referenced_table_id) {
          connections.set(c.table_id, (connections.get(c.table_id) || 0) + 1);
          connections.set(c.referenced_table_id, (connections.get(c.referenced_table_id) || 0) + 1);
        }
      });

      const sortedByConn = [...tables].sort((a, b) => {
        return (connections.get(b.table_id) || 0) - (connections.get(a.table_id) || 0);
      });

      // Treat the top connected tables as hubs (1 to 3 hubs)
      const numHubs = tables.length <= 4 ? 1 : Math.max(1, Math.min(3, Math.floor(tables.length / 5)));
      const hubs = sortedByConn.slice(0, numHubs);
      const hubIds = new Set(hubs.map(h => h.table_id));
      const survivors = sortedByConn.filter(t => !hubIds.has(t.table_id));

      const centerX = 0;
      const centerY = 0;

      // Calculate max table height among survivors and hubs to prevent vertical overlap
      let maxSurvivorHeight = 0;
      survivors.forEach(t => {
        const tableCols = columns.filter(c => c.table_id === t.table_id);
        const height = 40 + (tableCols.length * 28) + 16;
        maxSurvivorHeight = Math.max(maxSurvivorHeight, height);
      });

      // Place hubs in a vertically stacked column in the center
      const hubGap = 260;
      const totalHubsHeight = (hubs.length - 1) * hubGap;
      hubs.forEach((h, i) => {
        const tableCols = columns.filter(c => c.table_id === h.table_id);
        const width = 250;
        const height = 40 + (tableCols.length * 28) + 16;
        
        initialPositions[h.table_id] = {
          x: centerX - width / 2,
          y: centerY - totalHubsHeight / 2 + (i * hubGap) - height / 2,
          width,
          height
        };
      });

      // Calculate radius dynamically based on dimensions to strictly prevent overlap
      // We want spacing between nodes along the arc to be at least maxSurvivorHeight + 120px to prevent overlaps
      const minArcDistance = Math.max(480, maxSurvivorHeight + 120);
      const circumference = survivors.length * minArcDistance;
      
      // Enforce that the radius is also larger than the hub core vertical span to avoid colliding with central nodes
      const minRadiusFromHubs = (totalHubsHeight / 2) + (maxSurvivorHeight / 2) + 200;
      const radius = Math.max(minRadiusFromHubs, 750, circumference / (2 * Math.PI));

      // Place non-hubs in a circle around the hub core
      survivors.forEach((t, i) => {
        const tableCols = columns.filter(c => c.table_id === t.table_id);
        const width = 250;
        const height = 40 + (tableCols.length * 28) + 16;

        const angle = (2 * Math.PI * i) / survivors.length;
        initialPositions[t.table_id] = {
          x: centerX + radius * Math.cos(angle) - width / 2,
          y: centerY + radius * Math.sin(angle) - height / 2,
          width,
          height
        };
      });
    } else {
      // Dagre LR or TB layout
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: mode, nodesep: 80, ranksep: 120 });
      g.setDefaultEdgeLabel(() => ({}));

      tables.forEach(t => {
        const tableCols = columns.filter(c => c.table_id === t.table_id);
        const width = 250;
        const height = 40 + (tableCols.length * 28) + 16;
        g.setNode(t.table_id, { width, height });
      });

      constraints
        .filter((c) => c.type === 'FOREIGN KEY' && c.referenced_table_id)
        .forEach((c) => {
          g.setEdge(c.table_id, c.referenced_table_id!);
        });

      dagre.layout(g);

      tables.forEach(t => {
        const node = g.node(t.table_id);
        initialPositions[t.table_id] = {
          x: node.x - node.width / 2,
          y: node.y - node.height / 2,
          width: node.width,
          height: node.height
        };
      });
    }

    return initialPositions;
  }, [tables, columns, constraints]);

  // Load saved positions or calculate layout
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    const savedPositions: Record<string, { x: number, y: number }> = saved ? JSON.parse(saved) : {};

    // Get the saved layout mode preference
    let currentMode: LayoutMode = 'LR';
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem(`${projectId}-layout-mode`);
      if (savedMode === 'LR' || savedMode === 'TB' || savedMode === 'GRID' || savedMode === 'TIERED' || savedMode === 'RADIAL') {
        currentMode = savedMode as LayoutMode;
      }
    }
    setLayoutMode(currentMode);

    const calculated = getLayoutPositions(currentMode);
    const initialPositions: Record<string, { x: number, y: number, width: number, height: number }> = {};
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    tables.forEach(t => {
      const calcNode = calculated[t.table_id];
      const width = calcNode?.width || 250;
      const height = calcNode?.height || 60;

      if (savedPositions[t.table_id]) {
        initialPositions[t.table_id] = {
            ...savedPositions[t.table_id],
            width,
            height
        };
      } else if (calcNode) {
        initialPositions[t.table_id] = {
          x: calcNode.x,
          y: calcNode.y,
          width,
          height
        };
      } else {
        initialPositions[t.table_id] = {
          x: 0,
          y: 0,
          width,
          height
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
  }, [tables, storageKey, projectId, getLayoutPositions]);

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
    // Only drag on canvas background, not on nodes or controls
    if (
      (e.target as HTMLElement).closest('.erd-node') || 
      (e.target as HTMLElement).closest('.erd-controls')
    ) {
      return;
    }
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

  // Fit View: Zoom and center current node layout
  const handleFitView = useCallback(() => {
    if (Object.keys(nodePositions).length === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    Object.values(nodePositions).forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });

    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        const scaleX = rect.width / (graphWidth + 200);
        const scaleY = rect.height / (graphHeight + 200);
        const initialScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY)), 1);

        setTransform({
            scale: initialScale,
            x: (rect.width / 2) - ((minX + graphWidth / 2) * initialScale),
            y: (rect.height / 2) - ((minY + graphHeight / 2) * initialScale)
        });
    }
  }, [nodePositions]);

  // Auto Arrange: Recalculate clean graph layout and center view
  const handleAutoArrange = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem(`${projectId}-layout-mode`, mode);
    localStorage.removeItem(storageKey);

    const calculated = getLayoutPositions(mode);
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    Object.values(calculated).forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });

    if (containerRef.current && tables.length > 0) {
        const rect = containerRef.current.getBoundingClientRect();
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        const scaleX = rect.width / (graphWidth + 200);
        const scaleY = rect.height / (graphHeight + 200);
        const initialScale = Math.min(Math.max(0.2, Math.min(scaleX, scaleY)), 1);

        setTransform({
            scale: initialScale,
            x: (rect.width / 2) - ((minX + graphWidth / 2) * initialScale),
            y: (rect.height / 2) - ((minY + graphHeight / 2) * initialScale)
        });
    }

    setNodePositions(calculated);

    let modeText = 'Left-to-Right';
    if (mode === 'TB') modeText = 'Top-to-Bottom';
    if (mode === 'GRID') modeText = 'Compact Grid';
    if (mode === 'TIERED') modeText = 'Dependency Flow';
    if (mode === 'RADIAL') modeText = 'Circular Radial';

    toast({ 
      title: 'Layout Arranged', 
      description: `Tables auto-arranged in ${modeText} layout.` 
    });
  }, [tables, getLayoutPositions, storageKey, projectId, toast]);


  if (!isCalculated) return <div ref={containerRef} className="w-full h-full bg-background flex items-center justify-center text-muted-foreground/75">Calculating layout...</div>;

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full bg-background overflow-hidden cursor-grab active:cursor-grabbing"
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
            scale={transform.scale}
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
      <div className="erd-controls absolute bottom-4 left-4 flex items-center gap-2 bg-secondary/85 p-1.5 rounded-lg border border-border/70 backdrop-blur-md z-50 select-none">
          <button 
              onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(2, prev.scale + 0.1) }))} 
              className="w-8 h-8 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/10 text-foreground transition-colors font-medium"
              title="Zoom In"
          >
              +
          </button>
          <span className="text-xs font-mono text-muted-foreground w-12 text-center">{Math.round(transform.scale * 100)}%</span>
          <button 
              onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(0.2, prev.scale - 0.1) }))} 
              className="w-8 h-8 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/10 text-foreground transition-colors font-medium"
              title="Zoom Out"
          >
              -
          </button>
          <div className="w-[1px] h-5 bg-border/50 mx-1" />
          <button 
              onClick={handleFitView} 
              className="w-8 h-8 flex items-center justify-center rounded bg-muted hover:bg-muted-foreground/10 text-foreground transition-colors"
              title="Fit to View"
          >
              <Maximize2 className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-5 bg-border/50 mx-1" />
          
          {/* Layout Mode Selection Segment */}
          <div className="flex items-center bg-muted/40 p-0.5 rounded border border-border/40 gap-0.5" title="Auto-Arrange Layout Mode">
              <button 
                  onClick={() => handleAutoArrange('GRID')} 
                  className={`w-7 h-7 flex items-center justify-center rounded transition-all duration-150 ${layoutMode === 'GRID' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground'}`}
                  title="Grid / Compact Layout"
              >
                  <Grid className="w-3.5 h-3.5" />
              </button>
              <button 
                  onClick={() => handleAutoArrange('TIERED')} 
                  className={`w-7 h-7 flex items-center justify-center rounded transition-all duration-150 ${layoutMode === 'TIERED' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground'}`}
                  title="Dependency Flow Layout"
              >
                  <Layers className="w-3.5 h-3.5" />
              </button>
              <button 
                  onClick={() => handleAutoArrange('RADIAL')} 
                  className={`w-7 h-7 flex items-center justify-center rounded transition-all duration-150 ${layoutMode === 'RADIAL' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground'}`}
                  title="Circular Radial Layout"
              >
                  <CircleDot className="w-3.5 h-3.5" />
              </button>
              <button 
                  onClick={() => handleAutoArrange('LR')} 
                  className={`w-7 h-7 flex items-center justify-center rounded transition-all duration-150 ${layoutMode === 'LR' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground'}`}
                  title="Left-to-Right Hierarchical"
              >
                  <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button 
                  onClick={() => handleAutoArrange('TB')} 
                  className={`w-7 h-7 flex items-center justify-center rounded transition-all duration-150 ${layoutMode === 'TB' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground'}`}
                  title="Top-to-Bottom Hierarchical"
              >
                  <ArrowDown className="w-3.5 h-3.5" />
              </button>
          </div>
      </div>
    </div>
  );
}
