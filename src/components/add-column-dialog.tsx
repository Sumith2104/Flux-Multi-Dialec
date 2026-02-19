
'use client';

import { useState } from 'react';
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
import { addColumnAction } from '@/app/(app)/editor/actions';
import { useToast } from '@/hooks/use-toast';
import { SubmitButton } from './submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

type AddColumnDialogProps = {
  projectId: string;
  tableId: string;
  tableName: string;
};

export function AddColumnDialog({ projectId, tableId, tableName }: AddColumnDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState('text');

  const handleAction = async (formData: FormData) => {
    const result = await addColumnAction(formData);
    if (result.success) {
      toast({
        title: 'Success',
        description: 'Column added successfully.',
      });
      setIsOpen(false);
      setColumnName('');
      setColumnType('text');
      router.refresh();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error || 'Failed to add column.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add Column
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Column to `{tableName}`</DialogTitle>
          <DialogDescription>
            Define the name and type for the new column.
          </DialogDescription>
        </DialogHeader>
        <form action={handleAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="tableId" value={tableId} />
          <input type="hidden" name="tableName" value={tableName} />

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="columnName" className="text-right">
                Name
              </Label>
              <Input
                id="columnName"
                name="columnName"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                className="col-span-3 font-mono"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="columnType" className="text-right">
                Type
              </Label>
              <Select
                name="columnType"
                value={columnType}
                onValueChange={(value) => setColumnType(value)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="timestamp">Timestamp</SelectItem>
                  <SelectItem value="gen_random_uuid()">UUID</SelectItem>
                  <SelectItem value="now_date()">Creation Date</SelectItem>
                  <SelectItem value="now_time()">Creation Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <SubmitButton type="submit">Add Column</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
