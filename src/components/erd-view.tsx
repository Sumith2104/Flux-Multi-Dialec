'use client';

import React from 'react';
import { type Table, type Column, type Constraint } from '@/lib/data';
import { ErdCanvas } from './custom-erd/erd-canvas';

interface ErdViewProps {
  tables: Table[];
  columns: Column[];
  constraints: Constraint[];
  projectId: string;
}

export function ErdView({ tables, columns, constraints, projectId }: ErdViewProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ErdCanvas tables={tables} columns={columns} constraints={constraints} projectId={projectId} />
    </div>
  );
}
