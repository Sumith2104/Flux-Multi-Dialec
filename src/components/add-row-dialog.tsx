
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Plus } from 'lucide-react';
import { addRowAction } from '@/app/(app)/editor/actions';
import { useToast } from '@/hooks/use-toast';
import { type Column, type Constraint, type Table as DbTable } from '@/lib/data';
import { SubmitButton } from './submit-button';
import { useState } from 'react';
import { ForeignKeySelect } from './foreign-key-select';

type AddRowDialogProps = {
  projectId: string;
  tableId: string;
  tableName: string;
  columns: Column[];
  onRowAdded: () => void;
  foreignKeyData: Record<string, any[]>;
  allTables: DbTable[];
  constraints: Constraint[];
};

export function AddRowDialog({
  projectId,
  tableId,
  tableName,
  columns,
  onRowAdded,
  foreignKeyData,
  allTables,
  constraints
}: AddRowDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = async (formData: FormData) => {
    const result = await addRowAction(formData);
    if (result.success) {
      toast({
        title: 'Success',
        description: 'Row added successfully.',
      });
      setIsOpen(false);
      onRowAdded();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error || 'Failed to add row.',
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
      // A simple heuristic to find a good display column
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
        />
      )
    }
    const inputType =
      col.data_type === 'number' ? 'number' :
        col.data_type === 'date' ? 'date' :
          ['timestamp', 'timestamptz', 'datetime'].includes(col.data_type) ? 'datetime-local' :
            'text';

    return (
      <Input
        id={col.column_name}
        name={col.column_name}
        className="col-span-3"
        type={inputType}
        defaultValue={(col.data_type === 'timestamp' || col.data_type === 'timestamptz') && col.default_value === 'now()' ? '' : undefined}
      />
    )
  }

  const visibleColumns = columns.filter(col =>
    col.column_name !== 'id' &&
    col.data_type !== 'gen_random_uuid()' &&
    col.default_value !== 'now()' &&
    col.data_type !== 'now_date()' &&
    col.data_type !== 'now_time()'
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Insert Row
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Row to `{tableName}`</DialogTitle>
          <DialogDescription>
            Fill in the details for the new row. The 'id' will be generated automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={handleAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="tableId" value={tableId} />
          <input type="hidden" name="tableName" value={tableName} />

          <div className="grid gap-4 py-4">
            {visibleColumns.map((col) => (
              <div key={col.column_id} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={col.column_name} className="text-right">
                  {col.column_name}
                </Label>
                {renderInput(col)}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <SubmitButton type="submit">Add Row</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
