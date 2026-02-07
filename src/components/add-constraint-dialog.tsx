'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { addConstraintAction } from '@/app/(app)/editor/actions';
import { useToast } from '@/hooks/use-toast';
import { SubmitButton } from './submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, KeyRound, Link2 } from 'lucide-react';
import { type Column, type Table, type Constraint } from '@/lib/data';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';

type AddConstraintDialogProps = {
  projectId: string;
  tableId: string;
  tableName: string;
  columns: Column[];
  allTables: Table[];
  allProjectConstraints: Constraint[];
  onConstraintAdded: (newConstraint: Constraint) => void; // update UI instantly
};

const formSchema = z.object({
  type: z.enum(['PRIMARY KEY', 'FOREIGN KEY']),
  columnNames: z.string().min(1, 'You must select at least one column.'),
  referencedTableId: z.string().optional(),
  referencedColumnNames: z.string().optional(),
  onDelete: z.string().optional(),
}).refine(
  (data) => {
    if (data.type === 'FOREIGN KEY') {
      return !!data.referencedTableId && !!data.referencedColumnNames && !!data.onDelete;
    }
    return true;
  },
  {
    message: 'Referenced table, column and ON DELETE action are required for a Foreign Key.',
    path: ['referencedTableId'],
  }
);

export function AddConstraintDialog({
  projectId,
  tableId,
  tableName,
  columns,
  allTables,
  onConstraintAdded,
  allProjectConstraints,
}: AddConstraintDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'PRIMARY KEY',
      columnNames: '',
      onDelete: 'RESTRICT',
    },
  });

  const watchType = form.watch('type');
  const watchReferencedTableId = form.watch('referencedTableId');

  const referencedTablePKs = useMemo(() => {
    if (!watchReferencedTableId) return [];
    const pkConstraint = allProjectConstraints.find(
      (c) => c.table_id === watchReferencedTableId && c.type === 'PRIMARY KEY'
    );
    return pkConstraint ? pkConstraint.column_names.split(',') : ['id'];
  }, [watchReferencedTableId, allProjectConstraints]);

  const handleAction = async (values: z.infer<typeof formSchema>) => {
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('tableId', tableId);
    formData.append('tableName', tableName);
    formData.append('type', values.type);
    formData.append('columnNames', values.columnNames);

    if (values.type === 'FOREIGN KEY') {
      formData.append('referencedTableId', values.referencedTableId || '');
      formData.append('referencedColumnNames', values.referencedColumnNames || '');
      formData.append('onDelete', values.onDelete || '');
    }

    const result = await addConstraintAction(formData);

    if (result.success && result.constraint) {
      toast({
        title: 'Success',
        description: 'Constraint added successfully.',
      });

      onConstraintAdded(result.constraint);

      form.reset({
        type: 'PRIMARY KEY',
        columnNames: '',
        onDelete: 'RESTRICT',
      });
      setIsOpen(false);
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error || 'Failed to add constraint.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add Constraint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Constraint to `{tableName}`</DialogTitle>
          <DialogDescription>
            Define a Primary Key or Foreign Key relationship.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleAction)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Constraint Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a constraint type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PRIMARY KEY">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-yellow-500" /> Primary Key
                        </div>
                      </SelectItem>
                      <SelectItem value="FOREIGN KEY">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-blue-500" /> Foreign Key
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="columnNames"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Local Column(s)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a column" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col.column_id} value={col.column_name}>
                          {col.column_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchType === 'FOREIGN KEY' && (
              <>
                <FormField
                  control={form.control}
                  name="referencedTableId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referenced Table</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a table" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allTables
                            .filter((t) => t.table_id !== tableId)
                            .map((t) => (
                              <SelectItem key={t.table_id} value={t.table_id}>
                                {t.table_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="referencedColumnNames"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referenced Column(s)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!watchReferencedTableId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a referenced column" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {referencedTablePKs.length > 0 ? (
                            referencedTablePKs.map((pk) => (
                              <SelectItem key={pk} value={pk}>
                                {pk}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="id" disabled>
                              No primary key found on referenced table
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="onDelete"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>On Delete Action</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an action" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="RESTRICT">RESTRICT</SelectItem>
                          <SelectItem value="CASCADE">CASCADE</SelectItem>
                          <SelectItem value="SET NULL">SET NULL</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <SubmitButton type="submit">Add Constraint</SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
