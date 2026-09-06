
'use client';

import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { SubmitButton } from './submit-button';
import { useRouter } from 'next/navigation';
import type { Column } from '@/lib/data';
import { editColumnAction } from '@/app/(app)/editor/actions';

type EditColumnDialogProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  projectId: string;
  tableId: string;
  tableName: string;
  column: Column;
  onColumnUpdated?: () => void;
};

export function EditColumnDialog({
  isOpen,
  setIsOpen,
  projectId,
  tableId,
  tableName,
  column,
  onColumnUpdated,
}: EditColumnDialogProps) {
  const { toast } = useToast();
  const [newColumnName, setNewColumnName] = useState(column.column_name);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      const result = await editColumnAction(formData);
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Column updated successfully.',
        });
        setIsOpen(false);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('flux:schema-change', { detail: { projectId } }));
        }
        onColumnUpdated?.();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update column.',
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Failed to update column.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Column in `{tableName}`</DialogTitle>
          <DialogDescription>
            Rename the column. Changing the data type is not yet supported.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="tableId" value={tableId} />
          <input type="hidden" name="tableName" value={tableName} />
          <input type="hidden" name="columnId" value={column.column_id} />
          <input type="hidden" name="oldColumnName" value={column.column_name} />

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newColumnName" className="text-right">
                Name
              </Label>
              <Input
                id="newColumnName"
                name="newColumnName"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                className="col-span-3 font-mono"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">
                    Type
                </Label>
                 <Input
                    value={column.data_type}
                    className="col-span-3 font-mono"
                    disabled
                />
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant="outline" disabled={isSubmitting} onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
