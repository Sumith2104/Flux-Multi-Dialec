import React from 'react';
import { type Table, type Column, type Constraint } from '@/lib/data';

interface RelationshipEdgesProps {
  tables: Table[];
  columns: Column[];
  constraints: Constraint[];
  nodePositions: Record<string, { x: number; y: number; width: number; height: number }>;
}

const ROW_HEIGHT = 24; // 16px text + 8px vertical padding (py-0.5 is 4px top and bottom total in container)
const HEADER_HEIGHT = 44; // p-3 (12px * 2) + line height (20px)

export function RelationshipEdges({ tables, columns, constraints, nodePositions }: RelationshipEdgesProps) {
  
  // Create an overlay SVG that draws the bezier curves
  // We need to calculate the exact start and end coordinates based on the table positions and the column index
  
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
          <g key={c.constraint_id} className="erd-edge group">
            {/* Invisible thicker path for easier hovering */}
            <path 
                d={path} 
                fill="none" 
                stroke="transparent" 
                strokeWidth={20} 
                className="cursor-pointer"
            />
            {/* Actual visible path */}
            <path
              d={path}
              fill="none"
              stroke="#52525b" // zinc-600
              strokeWidth={1.5}
              className="group-hover:stroke-[#3b82f6] group-hover:stroke-[2px] transition-colors duration-200"
            />
            {/* Connection anchor dots */}
            <circle cx={endX} cy={targetY} r={3.5} className="fill-[#52525b] group-hover:fill-[#3b82f6] transition-colors" />
            <circle cx={startX} cy={sourceY} r={3.5} className="fill-[#52525b] group-hover:fill-[#3b82f6] transition-colors" />
          </g>
        );
      });

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
      {calculatedEdges}
    </svg>
  );
}
