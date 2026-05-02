/* eslint-disable react-hooks/incompatible-library */
'use client';

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Database } from 'lucide-react';

export interface ColumnDef {
  field: string;
  headerName: string;
  width?: number;
}

interface DataTableProps {
  columns: ColumnDef[];
  rows: any[];
  loading: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  selectionModel?: string[];
  onRowSelectionModelChange?: (selectionModel: string[]) => void;
}

export function DataTable({
  columns,
  rows,
  loading,
  fetchNextPage,
  isFetchingNextPage,
  hasNextPage,
  selectionModel = [],
  onRowSelectionModelChange,
}: DataTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // Column Resizing State
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const resizingRef = React.useRef<{ field: string, startX: number, startWidth: number } | null>(null);
  // Offscreen canvas for fast text measurement (no DOM reflow)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const getColWidth = (field: string) => columnWidths[field] || 150;

  const measureText = React.useCallback((text: string, bold = false): number => {
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.font = bold ? 'bold 11px ui-sans-serif,system-ui,sans-serif' : '14px ui-sans-serif,system-ui,sans-serif';
    return ctx.measureText(text).width;
  }, []);

  /** Double-click on handle → auto-fit column width to its widest value */
  const handleResizeDoubleClick = React.useCallback((e: React.MouseEvent, field: string) => {
    e.stopPropagation();
    e.preventDefault();

    // Header: uppercase bold, px-4 (32px) padding
    let maxWidth = measureText(field.toUpperCase(), true) + 32;

    // Cell values: normal weight, px-4 padding
    rows.forEach(row => {
      const val = row[field];
      const w = measureText(val !== null && val !== undefined ? String(val) : '') + 32;
      if (w > maxWidth) maxWidth = w;
    });

    setColumnWidths(prev => ({ ...prev, [field]: Math.min(500, Math.max(80, Math.ceil(maxWidth))) }));
  }, [rows, measureText]);

  const handleResizeStart = (e: React.MouseEvent, field: string) => {
    e.stopPropagation();
    resizingRef.current = { field, startX: e.clientX, startWidth: getColWidth(field) };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleResizeMove = React.useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { field, startX, startWidth } = resizingRef.current;
    const newWidth = Math.max(50, startWidth + (e.clientX - startX));
    setColumnWidths(prev => ({ ...prev, [field]: newWidth }));
  }, []);

  const handleResizeEnd = React.useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleResizeMove]);

  // If there are more items to load, artificially add a 1-row buffer for the loading spinner
  const count = hasNextPage ? rows.length + 1 : rows.length;

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // Height of each row row in pixels
    overscan: 10, // Buffer items outside the immediate viewport
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  React.useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();
    if (!lastItem) return;

    // Background Prefetch trigger: Load more exactly 15 rows before hitting the bottom
    // This allows the next 50 rows to fetch so smoothly that the user never sees the spinner.
    if (lastItem.index >= rows.length - 15 && hasNextPage && !isFetchingNextPage && fetchNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, rows.length, isFetchingNextPage, virtualItems]);

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRowSelectionModelChange) return;
    if (selectionModel.includes(id)) {
      onRowSelectionModelChange(selectionModel.filter(s => s !== id));
    } else {
      onRowSelectionModelChange([...selectionModel, id]);
    }
  };

  const toggleAll = () => {
    if (!onRowSelectionModelChange) return;
    if (selectionModel.length === rows.length && rows.length > 0) {
      onRowSelectionModelChange([]);
    } else {
      onRowSelectionModelChange(rows.map(r => r.id || r._id));
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="relative flex h-[60dvh] w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card/90 shadow-2xl shadow-black/25 sm:h-[70vh]">
        {/* Render only headers for skeleton state */}
        <div className="sticky top-0 z-20 inline-flex w-max min-w-full border-b border-border bg-secondary text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-border/60 bg-muted/50 py-3.5">#</div>
          <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60 bg-secondary py-3.5"><Checkbox disabled /></div>
          {columns.map((c, i) => (
            <div key={c.field} className={`relative flex shrink-0 items-center bg-secondary px-4 py-3.5 ${i !== columns.length - 1 ? 'border-r border-border/60' : ''}`} style={{ width: `${getColWidth(c.field)}px` }}>
              <span className="w-full truncate">{c.headerName}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center w-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
        </div>
      </div>
    );
  }

  // Define column width mathematically (tailwind grid doesn't play well with virtual absolute translation)
  // We'll use Flex flex-1 for distributing columns evenly.
  return (
    <div className="relative flex h-[60dvh] max-w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card/90 text-foreground shadow-2xl shadow-black/25 backdrop-blur-xl sm:h-[70vh]">

      {/* Unified Scrolling Container for both Header and Body (Eliminates scroll sync lag) */}
      <div ref={parentRef} className="flex-1 overflow-auto bg-transparent relative custom-scrollbar">

        {/* Sticky Header Area */}
        <div className="sticky top-0 z-20 inline-flex w-max min-w-full border-b border-border bg-secondary text-xs font-bold uppercase tracking-widest text-muted-foreground shadow-sm">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-border/60 bg-muted/50 py-3.5">
            #
          </div>
          <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60 bg-secondary py-3.5">
            <Checkbox
              checked={selectionModel.length === rows.length && rows.length > 0}
              onCheckedChange={toggleAll}
            />
          </div>
          {columns.map((c, i) => (
            <div
              key={c.field}
              className={`relative flex shrink-0 items-center bg-secondary px-4 py-3.5 ${i !== columns.length - 1 ? 'border-r border-border/60' : ''}`}
              style={{ width: `${getColWidth(c.field)}px` }}
            >
              <span className="truncate w-full">{c.headerName}</span>
              {/* Resize Handle — drag to resize, double-click to auto-fit */}
              <div
                className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-10 -mr-1.5 group/handle flex items-center justify-center"
                onMouseDown={(e) => handleResizeStart(e, c.field)}
                onDoubleClick={(e) => handleResizeDoubleClick(e, c.field)}
                title="Drag to resize · Double-click to auto-fit"
              >
                <div className="h-4 w-px bg-border transition-all duration-100 group-hover/handle:h-full group-hover/handle:w-0.5 group-hover/handle:bg-primary/70" />
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            minWidth: '100%',
            width: 'max-content',
            position: 'relative'
          }}
        >
          {virtualItems.map(virtualRow => {
            const isLoaderRow = virtualRow.index > rows.length - 1;
            const row = rows[virtualRow.index];
            const isSelected = row && selectionModel.includes(row.id || row._id);

            return (
              <div
                key={virtualRow.index}
                className={`absolute top-0 left-0 inline-flex w-max min-w-full cursor-pointer items-center border-b border-border/50 transition-colors duration-150 ${isSelected ? 'bg-primary/10' : 'hover:bg-secondary/50'
                  }`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={(e) => row && toggleSelection(row.id || row._id, e)}
              >
                {isLoaderRow ? (
                  <div className="flex h-full w-full animate-pulse items-center justify-center gap-3 bg-secondary/40 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Fetching more rows...
                  </div>
                ) : (
                  <>
                    <div className="flex h-full w-16 shrink-0 items-center justify-center border-r border-border/50 bg-secondary/40 font-mono text-xs text-muted-foreground/75">
                      {virtualRow.index + 1}
                    </div>
                    <div className="flex h-full w-14 shrink-0 items-center justify-center border-r border-border/50">
                      <Checkbox
                        checked={isSelected}
                        onClick={(e: any) => toggleSelection(row.id || row._id, e)}
                        className="transition-colors"
                      />
                    </div>
                    {columns.map((c, i) => (
                      <div
                        key={c.field}
                        className={`flex h-full shrink-0 items-center truncate px-4 text-sm ${i !== columns.length - 1 ? 'border-r border-border/50' : ''} ${isSelected ? 'font-medium text-foreground' : 'font-normal text-foreground/85'}`}
                        style={{ width: `${getColWidth(c.field)}px` }}
                      >
                        {String(row[c.field] !== null && row[c.field] !== undefined ? row[c.field] : '')}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {!loading && rows.length === 0 && (
          <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground absolute inset-0 opacity-80 pointer-events-none mt-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Database className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground">No rows found</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground/70">This table is empty. Insert a new row.</p>
          </div>
        )}
      </div>
    </div>
  );
}
