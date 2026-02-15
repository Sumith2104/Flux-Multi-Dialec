
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
import { KeyRound, Link2 } from 'lucide-react';
import dagre from 'dagre';

interface ErdViewProps {
  tables: Table[];
  columns: Column[];
  constraints: Constraint[];
}

const nodeWidth = 250;
const nodeHeaderHeight = 40;
const rowHeight = 28;
const POSITIONS_KEY = 'fluxbase-erd-positions';
const VIEWPORT_KEY = 'fluxbase-erd-viewport';


const CustomNode = ({ data }: { data: { name: string; columns: Column[], pks: Set<string>, fks: Set<string> } }) => {
  const getLabel = (val: any): string => {
    if (!val) return '';
    if (typeof val !== 'object') return String(val);
    const result = val.value || val.name || val.column || (val.expr?.value) || (val.expr ? getLabel(val.expr) : null) || JSON.stringify(val);
    return result;
  };

  return (
    <div className="rounded-md border-2 border-primary/50 bg-card shadow-md font-sans w-full">
      <div className="bg-primary/20 p-2 rounded-t-md">
        <p className="text-sm font-bold text-foreground">{data.name}</p>
      </div>
      <div className="p-2 space-y-1">
        {data.columns.map((col) => {
          const label = getLabel(col.column_name);
          const typeLabel = getLabel(col.data_type);
          return (
            <div key={col.column_id} className="relative flex items-center justify-between text-xs text-muted-foreground">
              {data.fks.has(label) && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${col.table_id}-${label}`}
                  style={{ background: '#3b82f6', top: '50%' }}
                />
              )}
              {data.pks.has(label) && (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`${col.table_id}-${label}`}
                  style={{ background: '#ca8a04', top: '50%' }}
                />
              )}
              <div className='flex items-center gap-2'>
                {data.pks.has(label) && <KeyRound className="h-3 w-3 text-yellow-500" />}
                {data.fks.has(label) && <Link2 className="h-3 w-3 text-blue-500" />}

                <span className={data.pks.has(label) ? 'font-semibold text-foreground' : ''}>
                  {label}
                </span>
              </div>
              <span className="font-mono text-gray-500">{typeLabel}</span>
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
  dagreGraph.setGraph({ rankdir: 'LR' }); // Left to Right layout

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: node.style?.width || nodeWidth, height: node.style?.height || 200 });
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
  return saved ? JSON.parse(saved) : { x: 0, y: 0, zoom: 0.5 };
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

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(tableNodes, tableEdges, savedPositions);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [tables, columns, constraints, setNodes, setEdges]);

  const nodeColor = (node: Node) => {
    return 'hsl(var(--primary) / 0.5)';
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
      className="bg-background"
      defaultViewport={defaultViewport}
    >
      <Controls />
      <MiniMap nodeStrokeWidth={3} zoomable pannable nodeColor={nodeColor} />
      <Background gap={16} color="hsl(var(--border))" />
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
