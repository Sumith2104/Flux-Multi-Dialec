
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { editRowAction } from '@/app/(app)/editor/actions';
import { useToast } from '@/hooks/use-toast';
import { type Column, type Constraint, type Table as DbTable } from '@/lib/data';
import { SubmitButton } from './submit-button';
import type React from 'react';
import { ForeignKeySelect } from './foreign-key-select';

type EditRowDialogProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  projectId: string;
  tableId: string;
  tableName: string;
  columns: Column[];
  rowData: Record<string, any>;
  onRowUpdated: () => void;
  foreignKeyData: Record<string, any[]>;
  allTables: DbTable[];
  constraints: Constraint[];
};

export function EditRowDialog({
  isOpen,
  setIsOpen,
  projectId,
  tableId,
  tableName,
  columns,
  rowData,
  onRowUpdated,
  foreignKeyData,
  allTables,
  constraints,
}: EditRowDialogProps) {
  const { toast } = useToast();

  const handleAction = async (formData: FormData) => {
    const result = await editRowAction(formData);
    if (result.success) {
      toast({
        title: 'Success',
        description: 'Row updated successfully.',
      });
      setIsOpen(false);
      onRowUpdated();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error || 'Failed to update row.',
      });
    }
  };

  const fkConstraints = constraints.filter(c => c.type === 'FOREIGN KEY');

  const renderInput = (col: Column) => {
    const fkConstraint = fkConstraints.find(c => c.column_names === col.column_name);

    if (fkConstraint && foreignKeyData[col.column_name]) {
      const refTable = allTables.find(t => t.table_id === fkConstraint.referenced_table_id);
      const refColumn = fkConstraint.referenced_column_names || 'id';

      let displayColumn = 'name'; // default
      const firstRow = foreignKeyData[col.column_name][0];
      if (firstRow) {
        if ('name' in firstRow) displayColumn = 'name';
        else if ('title' in firstRow) displayColumn = 'title';
        else if ('label' in firstRow) displayColumn = 'label';
        else if ('email' in firstRow) displayColumn = 'email';
      }

      return (
        <ForeignKeySelect
          name={col.column_name}
          data={foreignKeyData[col.column_name]}
          refTable={refTable}
          valueColumn={refColumn}
          displayColumn={displayColumn}
          defaultValue={rowData[col.column_name]}
        />
      )
    }

    const inputType =
      col.data_type === 'number' ? 'number' :
        col.data_type === 'date' ? 'date' :
          ['timestamp', 'timestamptz', 'datetime'].includes(col.data_type) ? 'datetime-local' :
            'text';

    let defaultValue = rowData[col.column_name] || '';
    if (inputType === 'datetime-local' && defaultValue && typeof defaultValue === 'string') {
      // datetime-local expects YYYY-MM-DDThh:mm
      // If we have ISO string 2023-01-01T12:00:00.000Z, we need to slice it or format it.
      // Simple slice for now, keeping it basic. Ideally should handle timezone.
      if (defaultValue.endsWith('Z')) {
        defaultValue = defaultValue.slice(0, 16);
      } else {
        // Try to format if it's a valid date string
        try {
          defaultValue = new Date(defaultValue).toISOString().slice(0, 16);
        } catch (e) {
          // Keep as is if invalid
        }
      }
    }

    return (
      <Input
        id={col.column_name}
        name={col.column_name}
        className="col-span-3"
        type={inputType}
        defaultValue={defaultValue}
      />
    )
  }

  const visibleColumns = columns.filter(
    (col) => col.column_name !== 'id' && col.data_type !== 'gen_random_uuid()'
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Row in `{tableName}`</DialogTitle>
          <DialogDescription>
            Modify the values and click save.
          </DialogDescription>
        </DialogHeader>
        <form action={handleAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="tableId" value={tableId} />
          <input type="hidden" name="tableName" value={tableName} />
          <input type="hidden" name="rowId" value={rowData.id} />

          <div className="grid gap-4 py-4">
            {visibleColumns.map((col) => (
              <div
                key={col.column_id}
                className="grid grid-cols-4 items-center gap-4"
              >
                <Label htmlFor={col.column_name} className="text-right">
                  {col.column_name}
                </Label>
                {renderInput(col)}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <SubmitButton type="submit">Save Changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
