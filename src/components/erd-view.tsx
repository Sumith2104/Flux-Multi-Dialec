
'use client';

import React, { useMemo, useEffect, useCallback } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  type Node,
  type Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  type NodeDragHandler,
  type Viewport,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { type Table, type Column, type Constraint } from '@/lib/data';
import { KeyRound, Link2, Database } from 'lucide-react';
import dagre from 'dagre';

interface ErdViewProps {
  tables: Table[];
  columns: Column[];
  constraints: Constraint[];
}

const nodeWidth = 250;
const nodeHeaderHeight = 40;
const rowHeight = 28;
const POSITIONS_KEY = 'fluxbase-erd-positions-v2';
const VIEWPORT_KEY = 'fluxbase-erd-viewport-v2';


const CustomNode = ({ data }: { data: { name: string; columns: Column[], pks: Set<string>, fks: Set<string> } }) => {
  const getLabel = (val: any): string => {
    if (!val) return '';
    if (typeof val !== 'object') return String(val);
    const result = val.value || val.name || val.column || (val.expr?.value) || (val.expr ? getLabel(val.expr) : null) || JSON.stringify(val);
    return result;
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-2xl font-sans w-full backdrop-blur-xl overflow-hidden ring-1 ring-white/5 hover:ring-orange-500/50 transition-all duration-300">
      <div className="bg-zinc-900/50 p-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Database className="h-4 w-4 text-orange-500" />
          {data.name}
        </p>
        <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{data.columns.length} COLS</span>
      </div>
      <div className="p-3 space-y-2">
        {data.columns.map((col) => {
          const label = getLabel(col.column_name);
          const typeLabel = getLabel(col.data_type);
          return (
            <div key={col.column_id} className="relative flex items-center justify-between text-xs group">
              {data.fks.has(label) && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${col.table_id}-${label}`}
                  style={{ background: '#3b82f6', top: '50%', right: -14, width: 8, height: 8 }}
                />
              )}
              {data.pks.has(label) && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`${col.table_id}-${label}`}
                  style={{ background: '#eab308', top: '50%', left: -14, width: 8, height: 8 }}
                />
              )}
              <div className='flex items-center gap-2'>
                {data.pks.has(label) && <KeyRound className="h-3 w-3 text-yellow-500" />}
                {data.fks.has(label) && <Link2 className="h-3 w-3 text-blue-500" />}

                <span className={`${data.pks.has(label) ? 'font-bold text-yellow-500' : data.fks.has(label) ? 'font-medium text-blue-400' : 'text-zinc-300'}`}>
                  {label}
                </span>
              </div>
              <span className="font-mono text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">{typeLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], savedPositions: Record<string, { x: number; y: number }>) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 80, // Increased horiz separation
    ranksep: 100  // Increased vertical separation (for ranks) 
  });

  nodes.forEach((node) => {
    // Add extra buffer to node size for breathing room
    dagreGraph.setNode(node.id, { width: (node.style?.width as number || nodeWidth) + 20, height: (node.style?.height as number || 200) + 20 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const savedPosition = savedPositions[node.id];
    if (savedPosition) {
      node.position = savedPosition;
    } else {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.position = {
        x: nodeWithPosition.x - (node.style?.width as number || nodeWidth) / 2,
        y: nodeWithPosition.y - (node.style?.height as number || 200) / 2,
      };
    }
    return node;
  });

  return { nodes, edges };
};

function getSavedPositions(): Record<string, { x: number; y: number }> {
  if (typeof window === 'undefined') return {};
  const saved = window.localStorage.getItem(POSITIONS_KEY);
  return saved ? JSON.parse(saved) : {};
}

function getSavedViewport(): Viewport | undefined {
  if (typeof window === 'undefined') return undefined;
  const saved = window.localStorage.getItem(VIEWPORT_KEY);
  return saved ? JSON.parse(saved) : { x: 0, y: 0, zoom: 0.8 };
}

const Flow = ({ tables, columns, constraints }: ErdViewProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { getViewport } = useReactFlow();

  const onNodeDragStop: NodeDragHandler = useCallback((_event, node) => {
    const currentPositions = getSavedPositions();
    const newPositions = { ...currentPositions, [node.id]: node.position };
    window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(newPositions));
  }, []);

  const onMoveEnd = useCallback(() => {
    if (typeof window !== 'undefined') {
      const viewport = getViewport();
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
    }
  }, [getViewport]);

  useEffect(() => {
    const savedPositions = getSavedPositions();

    const tableNodes: Node[] = [];
    const tableEdges: Edge[] = [];
    const pkConstraints = new Map<string, Set<string>>();
    const fkConstraints = new Map<string, Set<string>>();

    console.log('[DEBUG] ErdView Constraints:', constraints);

    constraints.forEach(c => {
      const keyMap = c.type === 'PRIMARY KEY' ? pkConstraints : fkConstraints;
      if (!keyMap.has(c.table_id)) {
        keyMap.set(c.table_id, new Set());
      }
      c.column_names.split(',').forEach(colName => {
        keyMap.get(c.table_id)!.add(colName);
      });
    });

    tables.forEach((table) => {
      const tableColumns = columns.filter((c) => c.table_id === table.table_id);
      const pks = pkConstraints.get(table.table_id) || new Set<string>();
      const fks = fkConstraints.get(table.table_id) || new Set<string>();

      const nodeHeight = nodeHeaderHeight + (tableColumns.length * rowHeight) + 16;

      tableNodes.push({
        id: table.table_id,
        type: 'custom',
        data: { name: table.table_name, columns: tableColumns, pks, fks },
        position: { x: 0, y: 0 },
        style: { width: nodeWidth, height: nodeHeight },
      });
    });

    constraints
      .filter((c) => c.type === 'FOREIGN KEY' && c.referenced_table_id && c.referenced_column_names)
      .forEach((c) => {
        tableEdges.push({
          id: `e-${c.constraint_id}`,
          source: c.table_id,
          target: c.referenced_table_id!,
          sourceHandle: `${c.table_id}-${c.column_names}`,
          targetHandle: `${c.referenced_table_id}-${c.referenced_column_names}`,
          type: 'bezier',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' },
          style: {
            stroke: 'hsl(var(--muted-foreground))',
            strokeWidth: 1.5,
          },
        });
      });

    console.log('[DEBUG] ErdView Edges:', tableEdges);

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(tableNodes, tableEdges, savedPositions);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [tables, columns, constraints, setNodes, setEdges]);

  const nodeColor = (node: Node) => {
    return '#f97316'; // Orange-500
  };

  const defaultViewport = getSavedViewport();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onMoveEnd={onMoveEnd}
      nodeTypes={nodeTypes}
      fitView
      className="bg-black"
      defaultViewport={defaultViewport}
    >
      <Controls className="bg-zinc-950 border-zinc-900 fill-zinc-400" />
      <MiniMap
        nodeStrokeWidth={3}
        zoomable
        pannable
        nodeColor={nodeColor}
        className="!bg-zinc-950 !border-zinc-900"
        maskColor="rgba(0, 0, 0, 0.8)"
      />
      <Background gap={24} size={2} color="#18181b" />
    </ReactFlow>
  );
}


export function ErdView({ tables, columns, constraints }: ErdViewProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <Flow tables={tables} columns={columns} constraints={constraints} />
      </ReactFlowProvider>
    </div>
  );
}
