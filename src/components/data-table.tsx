'use client';

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Database, ArrowUp, ArrowDown, ArrowUpDown, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface ColumnDef {
  field: string;
  headerName: string;
  width?: number;
  hidden?: boolean;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
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
  sorts?: SortState[];
  onSortsChange?: (sorts: SortState[]) => void;
  onCellSave?: (rowId: string, field: string, value: string) => Promise<void>;
  /** Key used to persist column widths in localStorage, e.g. "projectId_tableName" */
  storageKey?: string;
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
  sorts = [],
  onSortsChange,
  onCellSave,
  storageKey,
}: DataTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // Column Resizing State — persisted in localStorage per storageKey
  const lsKey = storageKey ? `col_widths_${storageKey}` : null;
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
    if (lsKey && typeof window !== 'undefined') {
      try { return JSON.parse(localStorage.getItem(lsKey) || '{}'); } catch { /* ignore */ }
    }
    return {};
  });

  // Persist widths whenever they change
  React.useEffect(() => {
    if (!lsKey) return;
    try { localStorage.setItem(lsKey, JSON.stringify(columnWidths)); } catch { /* ignore */ }
  }, [columnWidths, lsKey]);

  // When storageKey changes (table switch), reload widths from storage
  React.useEffect(() => {
    if (!lsKey) return;
    try {
      const saved = localStorage.getItem(lsKey);
      setColumnWidths(saved ? JSON.parse(saved) : {});
    } catch { /* ignore */ }
  }, [lsKey]);

  const resizingRef = React.useRef<{ field: string, startX: number, startWidth: number } | null>(null);
  // Offscreen canvas for fast text measurement (no DOM reflow)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const getColWidth = (field: string) => columnWidths[field] || 150;

  // Inline editing state
  const [editingCell, setEditingCell] = React.useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [savingCell, setSavingCell] = React.useState<{ rowId: string; field: string } | null>(null);
  const [savedCell, setSavedCell] = React.useState<{ rowId: string; field: string } | null>(null);
  const editInputRef = React.useRef<HTMLInputElement>(null);


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
    let maxWidth = measureText(field.toUpperCase(), true) + 32;
    rows.forEach(row => {
      const val = row[field];
      const w = measureText(val !== null && val !== undefined ? String(val) : '') + 32;
      if (w > maxWidth) maxWidth = w;
    });
    setColumnWidths(prev => ({ ...prev, [field]: Math.min(500, Math.max(80, Math.ceil(maxWidth))) }));
  }, [rows, measureText]);

  const handleResizeStart = (e: React.MouseEvent, field: string) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = { field, startX: e.clientX, startWidth: getColWidth(field) };
    didDragRef.current = false; // reset drag flag
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Tracks whether mouse actually moved during a resize (to cancel the post-drag click)
  const didDragRef = React.useRef(false);

  const handleResizeMove = React.useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { field, startX, startWidth } = resizingRef.current;
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 3) didDragRef.current = true; // real drag threshold
    const newWidth = Math.max(50, startWidth + delta);
    setColumnWidths(prev => ({ ...prev, [field]: newWidth }));
  }, []);

  const handleResizeEnd = React.useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // If a real drag happened, swallow the next click so it doesn't trigger sort
    if (didDragRef.current) {
      const eatClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener('click', eatClick, true);
      };
      // capture: true so we intercept before React's bubbling handlers
      document.addEventListener('click', eatClick, true);
      didDragRef.current = false;
    }
  }, [handleResizeMove]);

  // ── Sort header click ──────────────────────────────────────────────────────
  const handleHeaderClick = React.useCallback((e: React.MouseEvent, field: string) => {
    if (!onSortsChange) return;
    const isMulti = e.shiftKey;
    const existing = sorts.find(s => s.field === field);

    if (isMulti) {
      if (!existing) {
        onSortsChange([...sorts, { field, direction: 'asc' }]);
      } else if (existing.direction === 'asc') {
        onSortsChange(sorts.map(s => s.field === field ? { ...s, direction: 'desc' } : s));
      } else {
        onSortsChange(sorts.filter(s => s.field !== field));
      }
    } else {
      if (!existing) {
        onSortsChange([{ field, direction: 'asc' }]);
      } else if (existing.direction === 'asc') {
        onSortsChange([{ field, direction: 'desc' }]);
      } else {
        onSortsChange([]);
      }
    }
  }, [sorts, onSortsChange]);

  const getSortIcon = (field: string) => {
    const sort = sorts.find(s => s.field === field);
    const idx = sorts.indexOf(sort!);
    // Always show the indicator — dim (opacity-30) when inactive, full when active
    if (!sort) return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover/hdr:opacity-70 transition-opacity shrink-0" />;
    const badge = sorts.length > 1 ? (
      <span className="text-[9px] font-bold ml-0.5 opacity-80">{idx + 1}</span>
    ) : null;
    return (
      <span className="flex items-center gap-0.5 text-primary shrink-0">
        {sort.direction === 'asc'
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />}
        {badge}
      </span>
    );
  };

  // ── Inline Editing ─────────────────────────────────────────────────────────
  const startEdit = React.useCallback((rowId: string, field: string, currentValue: any) => {
    if (!onCellSave) return;
    setEditingCell({ rowId, field });
    setEditValue(currentValue !== null && currentValue !== undefined ? String(currentValue) : '');
    setTimeout(() => editInputRef.current?.focus(), 30);
  }, [onCellSave]);

  const cancelEdit = React.useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const commitEdit = React.useCallback(async () => {
    if (!editingCell || !onCellSave) return;
    const { rowId, field } = editingCell;
    setSavingCell({ rowId, field });
    setEditingCell(null);
    try {
      await onCellSave(rowId, field, editValue);
      setSavedCell({ rowId, field });
      setTimeout(() => setSavedCell(null), 1200);
    } finally {
      setSavingCell(null);
    }
  }, [editingCell, editValue, onCellSave]);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  // If there are more items to load, artificially add a 1-row buffer for the loading spinner
  const count = hasNextPage ? rows.length + 1 : rows.length;

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  React.useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();
    if (!lastItem) return;
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

  const visibleColumns = columns.filter(c => !c.hidden);

  if (loading && rows.length === 0) {
    return (
      <div className="relative flex h-[60dvh] w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card/90 shadow-2xl shadow-black/25 sm:h-[70vh]">
        <div className="sticky top-0 z-20 inline-flex w-max min-w-full border-b border-border bg-secondary text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-border/60 bg-muted/50 py-3.5">#</div>
          <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60 bg-secondary py-3.5"><Checkbox disabled /></div>
          {visibleColumns.map((c, i) => (
            <div key={c.field} className={`relative flex shrink-0 items-center bg-secondary px-4 py-3.5 ${i !== visibleColumns.length - 1 ? 'border-r border-border/60' : ''}`} style={{ width: `${getColWidth(c.field)}px` }}>
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

  return (
    <div className="relative flex h-[60dvh] max-w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card/90 text-foreground shadow-2xl shadow-black/25 backdrop-blur-xl sm:h-[70vh]">
      {/* Unified Scrolling Container */}
      <div ref={parentRef} className="flex-1 overflow-auto bg-transparent relative custom-scrollbar">

        {/* Sticky Header */}
        <div className="sticky top-0 z-20 inline-flex w-max min-w-full border-b border-border bg-secondary text-xs font-bold uppercase tracking-widest text-muted-foreground shadow-sm">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-border/60 bg-muted/50 py-3.5">#</div>
          <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/60 bg-secondary py-3.5">
            <Checkbox
              checked={selectionModel.length === rows.length && rows.length > 0}
              onCheckedChange={toggleAll}
            />
          </div>
          {visibleColumns.map((c, i) => {
            const isSorted = sorts.some(s => s.field === c.field);
            return (
              <div
                key={c.field}
                className={`group/hdr relative flex shrink-0 items-center gap-1.5 bg-secondary px-4 py-3.5 ${i !== visibleColumns.length - 1 ? 'border-r border-border/60' : ''} ${onSortsChange ? 'cursor-pointer select-none hover:bg-muted/60 transition-colors' : ''} ${isSorted ? 'text-primary bg-primary/5' : ''}`}
                style={{ width: `${getColWidth(c.field)}px` }}
                onClick={(e) => handleHeaderClick(e, c.field)}
                title={onSortsChange ? 'Click to sort · Shift+click for multi-sort' : undefined}
              >
                <span className="truncate flex-1">{c.headerName}</span>
                {onSortsChange && getSortIcon(c.field)}
                {/* Resize Handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-10 -mr-1.5 group/handle flex items-center justify-center"
                  onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, c.field); }}
                  onDoubleClick={(e) => { e.stopPropagation(); handleResizeDoubleClick(e, c.field); }}
                  title="Drag to resize · Double-click to auto-fit"
                >
                  <div className="h-4 w-px bg-border transition-all duration-100 group-hover/handle:h-full group-hover/handle:w-0.5 group-hover/handle:bg-primary/70" />
                </div>
              </div>
            );
          })}
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
            const rowId = row && (row.id || row._id);
            const isSelected = row && selectionModel.includes(rowId);

            return (
              <div
                key={virtualRow.index}
                className={`absolute top-0 left-0 inline-flex w-max min-w-full cursor-pointer items-center border-b border-border/50 transition-colors duration-150 ${isSelected ? 'bg-primary/10' : 'hover:bg-secondary/50'}`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={(e) => row && toggleSelection(rowId, e)}
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
                        onClick={(e: any) => toggleSelection(rowId, e)}
                        className="transition-colors"
                      />
                    </div>
                    {visibleColumns.map((c, i) => {
                      const isEditingThis = editingCell?.rowId === rowId && editingCell?.field === c.field;
                      const isSavingThis = savingCell?.rowId === rowId && savingCell?.field === c.field;
                      const isSavedThis = savedCell?.rowId === rowId && savedCell?.field === c.field;
                      const cellValue = row[c.field];
                      const displayValue = cellValue !== null && cellValue !== undefined ? String(cellValue) : '';

                      return (
                        <div
                          key={c.field}
                          className={`flex h-full shrink-0 items-center truncate text-sm relative
                            ${i !== visibleColumns.length - 1 ? 'border-r border-border/50' : ''}
                            ${isSelected ? 'font-medium text-foreground' : 'font-normal text-foreground/85'}
                            ${isSavingThis ? 'border-l-2 border-l-amber-500/70' : ''}
                            ${isSavedThis ? 'border-l-2 border-l-green-500 bg-green-500/5 transition-all duration-500' : ''}
                            ${onCellSave && !isEditingThis ? 'group/cell cursor-text' : ''}
                          `}
                          style={{ width: `${getColWidth(c.field)}px`, padding: isEditingThis ? '0' : '0 1rem' }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (!isEditingThis) startEdit(rowId, c.field, cellValue);
                          }}
                        >
                          {isEditingThis ? (
                            <input
                              ref={editInputRef}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              onBlur={commitEdit}
                              onClick={e => e.stopPropagation()}
                              className="absolute inset-0 w-full h-full px-4 text-sm bg-background text-foreground font-mono border-2 border-primary focus:outline-none focus:ring-0 focus-visible:ring-0 rounded-none shadow-none z-30"
                              autoFocus
                            />
                          ) : isSavingThis ? (
                            <span className="flex items-center gap-1.5 w-full truncate">
                              <Loader2 className="h-3 w-3 animate-spin shrink-0 text-amber-400" />
                              <span className="truncate text-muted-foreground">{displayValue}</span>
                            </span>
                          ) : (
                            <span className="truncate w-full">{displayValue}</span>
                          )}
                          {/* Double-click hint on hover (only when edit is available) */}
                          {onCellSave && !isEditingThis && !isSavingThis && (
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/30 opacity-0 group-hover/cell:opacity-100 transition-opacity pointer-events-none select-none">
                              2×
                            </span>
                          )}
                        </div>
                      );
                    })}
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
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground/70">This table is empty. Insert a new row or clear active filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
