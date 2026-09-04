import React, { useState } from 'react';
import { type Table, type Column, type Constraint } from '@/lib/data';

interface RelationshipEdgesProps {
  tables: Table[];
  columns: Column[];
  constraints: Constraint[];
  nodePositions: Record<string, { x: number; y: number; width: number; height: number }>;
  scale: number;
}

const ROW_HEIGHT = 24; // 16px text + 8px vertical padding (py-0.5 is 4px top and bottom total in container)
const HEADER_HEIGHT = 44; // p-3 (12px * 2) + line height (20px)

export const RelationshipEdges = React.memo(function RelationshipEdges({ tables, columns, constraints, nodePositions, scale }: RelationshipEdgesProps) {
  const [hoveredEdge, setHoveredEdge] = useState<{
    id: string;
    sourceTable: string;
    targetTable: string;
    sourceCol: string;
    targetCol: string;
    x: number;
    y: number;
  } | null>(null);
  
  const calculatedEdges: React.ReactNode[] = [];

  constraints
      .filter(c => c.type === 'FOREIGN KEY' && c.referenced_table_id)
      .forEach(c => {
        const sourceTableId = c.table_id;
        const targetTableId = c.referenced_table_id!;
        
        const sourcePos = nodePositions[sourceTableId];
        const targetPos = nodePositions[targetTableId];

        if (!sourcePos || !targetPos) return;

        // Find the index of the column to calculate exactly where the anchor should be vertically
        const sourceCols = columns.filter(col => col.table_id === sourceTableId);
        const sourceColIndex = sourceCols.findIndex(col => col.column_name === c.column_names || (typeof col.column_name === 'object' && (col.column_name as any).column === c.column_names));
        
        const targetCols = columns.filter(col => col.table_id === targetTableId);
        const targetColIndex = targetCols.findIndex(col => col.column_name === c.referenced_column_names || (typeof col.column_name === 'object' && (col.column_name as any).column === c.referenced_column_names));

        if (sourceColIndex === -1 || targetColIndex === -1) return;

        // Find actual table names for descriptive hover tooltips
        const sourceTableObj = tables.find(t => t.table_id === sourceTableId);
        const targetTableObj = tables.find(t => t.table_id === targetTableId);
        const sourceTableName = sourceTableObj ? sourceTableObj.table_name : sourceTableId;
        const targetTableName = targetTableObj ? targetTableObj.table_name : targetTableId;

        // Calculate Y coordinates
        // Row center = Header height + Padding (12px top) + (Index * RowHeight) + (Half RowHeight)
        const sourceYOffset = HEADER_HEIGHT + 12 + (sourceColIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2);
        const targetYOffset = HEADER_HEIGHT + 12 + (targetColIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2);

        const sourceY = sourcePos.y + sourceYOffset;
        const targetY = targetPos.y + targetYOffset;

        // Determine X connecting points. 
        // Typically exiting right of source, entering left of target. But if source is to the right of target, invert it.
        const sourceIsLeftOfTarget = sourcePos.x + sourcePos.width < targetPos.x;
        
        let startX, endX, cp1X, cp2X;

        if (sourceIsLeftOfTarget) {
            startX = sourcePos.x + sourcePos.width; // Exit right side
            endX = targetPos.x; // Enter left side
            
            // Control points pull away horizontally
            const dist = Math.abs(endX - startX) * 0.5;
            cp1X = startX + Math.max(50, dist);
            cp2X = endX - Math.max(50, dist);
        } else {
            startX = sourcePos.x; // Exit left side
            endX = targetPos.x + targetPos.width; // Enter right side
            
            const dist = Math.abs(endX - startX) * 0.5;
            cp1X = startX - Math.max(50, dist);
            cp2X = endX + Math.max(50, dist);
        }

        const path = `M ${startX} ${sourceY} C ${cp1X} ${sourceY}, ${cp2X} ${targetY}, ${endX} ${targetY}`;

        calculatedEdges.push(
          <g 
            key={c.constraint_id} 
            className="erd-edge group cursor-pointer pointer-events-auto"
            style={{ pointerEvents: 'auto' }}
            onMouseEnter={(e) => {
              const svgElement = e.currentTarget.closest('svg');
              if (!svgElement) return;
              const rect = svgElement.getBoundingClientRect();
              const localX = (e.clientX - rect.left) / scale;
              const localY = (e.clientY - rect.top) / scale;
              setHoveredEdge({
                id: c.constraint_id,
                sourceTable: sourceTableName,
                targetTable: targetTableName,
                sourceCol: c.column_names,
                targetCol: c.referenced_column_names || '',
                x: localX,
                y: localY
              });
            }}
            onMouseMove={(e) => {
              const svgElement = e.currentTarget.closest('svg');
              if (!svgElement) return;
              const rect = svgElement.getBoundingClientRect();
              const localX = (e.clientX - rect.left) / scale;
              const localY = (e.clientY - rect.top) / scale;
              setHoveredEdge(prev => {
                if (!prev || prev.id !== c.constraint_id) return prev;
                return {
                  ...prev,
                  x: localX,
                  y: localY
                };
              });
            }}
            onMouseLeave={() => setHoveredEdge(null)}
          >
            {/* Invisible thicker path for easier hovering */}
            <path 
                d={path} 
                fill="none" 
                stroke="transparent" 
                strokeWidth={20} 
                className="cursor-pointer pointer-events-auto"
                style={{ pointerEvents: 'auto' }}
            />
            {/* Actual visible path */}
            <path
              d={path}
              fill="none"
              stroke={hoveredEdge?.id === c.constraint_id ? "#3b82f6" : "#52525b"} // Highlight if hovered
              strokeWidth={hoveredEdge?.id === c.constraint_id ? 2.5 : 1.5}
              className="group-hover:stroke-[#3b82f6] group-hover:stroke-[2.5px] transition-colors duration-200 pointer-events-auto"
              style={{ pointerEvents: 'auto' }}
            />
            {/* Connection anchor dots */}
            <circle cx={endX} cy={targetY} r={hoveredEdge?.id === c.constraint_id ? 4.5 : 3.5} className="fill-[#52525b] group-hover:fill-[#3b82f6] transition-colors duration-150 pointer-events-auto" style={{ pointerEvents: 'auto' }} />
            <circle cx={startX} cy={sourceY} r={hoveredEdge?.id === c.constraint_id ? 4.5 : 3.5} className="fill-[#52525b] group-hover:fill-[#3b82f6] transition-colors duration-150 pointer-events-auto" style={{ pointerEvents: 'auto' }} />
          </g>
        );
      });

  return (
    <>
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
        {calculatedEdges}
      </svg>
      
      {/* Floating Glassmorphic Tooltip */}
      {hoveredEdge && (
        <div 
          className="absolute z-50 pointer-events-none bg-zinc-950/90 border border-zinc-800 shadow-2xl rounded-lg p-3.5 text-xs text-foreground backdrop-blur-md flex flex-col gap-2 w-72 animate-in fade-in zoom-in-95 duration-150 select-none"
          style={{
            left: hoveredEdge.x,
            top: hoveredEdge.y - 12,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            <span>Foreign Key Link</span>
            <span className="text-primary text-[9px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-mono">1:N</span>
          </div>
          
          {/* Relationship Flow representation */}
          <div className="flex items-center gap-2 font-semibold text-sm text-zinc-200 mt-1">
            <span className="text-zinc-100 font-mono text-xs">{hoveredEdge.sourceTable}</span>
            <span className="text-zinc-500 font-normal">➔</span>
            <span className="text-zinc-100 font-mono text-xs">{hoveredEdge.targetTable}</span>
          </div>

          {/* Mapping Details */}
          <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800/80 font-mono text-[11px] flex flex-col gap-1">
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">Child Column:</span>
              <span className="text-[#3b82f6] text-right break-all">{hoveredEdge.sourceTable}.{hoveredEdge.sourceCol}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">References:</span>
              <span className="text-[#10b981] text-right break-all">{hoveredEdge.targetTable}.{hoveredEdge.targetCol}</span>
            </div>
          </div>

          {/* Description of what it is doing */}
          <p className="text-zinc-400 text-[11px] leading-relaxed mt-1">
            Links records in <span className="text-zinc-300 font-medium font-mono">{hoveredEdge.sourceTable}</span> to <span className="text-zinc-300 font-medium font-mono">{hoveredEdge.targetTable}</span>, enforcing referential integrity.
          </p>
        </div>
      )}
    </>
  );
});
