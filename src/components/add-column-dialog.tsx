'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { useToast } from '@/hooks/use-toast';
import { addColumnAction } from '@/app/(app)/editor/actions';

type AddColumnDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  projectId: string;
  tableId: string;
  tableName: string;
  onColumnAdded?: () => void;
};

export function AddColumnDialog({ isOpen, setIsOpen, projectId, tableId, tableName, onColumnAdded }: AddColumnDialogProps) {
  const { toast } = useToast();
  const [columnName, setColumnName] = useState('');
  const [dataType, setDataType] = useState('text');
  const [isNullable, setIsNullable] = useState(true);
  const [defaultValue, setDefaultValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = () => {
    setColumnName('');
    setDataType('text');
    setIsNullable(true);
    setDefaultValue('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.set('projectId', projectId);
      formData.set('tableId', tableId);
      formData.set('tableName', tableName);
      formData.set('columnName', columnName);
      formData.set('dataType', dataType);
      formData.set('isNullable', String(isNullable));
      if (defaultValue) formData.set('defaultValue', defaultValue);

      const result = await addColumnAction(formData);
      if (result.success) {
        toast({ title: 'Column Added', description: `"${columnName}" column was added successfully.` });
        resetForm();
        setIsOpen(false);
        onColumnAdded?.();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Column to `{tableName}`</DialogTitle>
          <DialogDescription>Define the name and type for the new column.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          {/* Column Name */}
          <div className="grid gap-2">
            <Label htmlFor="col-name">Column Name</Label>
            <Input
              id="col-name"
              placeholder="e.g. created_at"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              className="font-mono"
              required
              autoFocus
            />
          </div>

          {/* Data Type */}
          <div className="grid gap-2">
            <Label>Data Type</Label>
            <Select value={dataType} onValueChange={setDataType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectGroup>
                  <SelectLabel>— Text —</SelectLabel>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="varchar">varchar</SelectItem>
                  <SelectItem value="char">char</SelectItem>
                  <SelectItem value="citext">citext</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>— Integer —</SelectLabel>
                  <SelectItem value="integer">integer</SelectItem>
                  <SelectItem value="smallint">smallint</SelectItem>
                  <SelectItem value="bigint">bigint</SelectItem>
                  <SelectItem value="serial">serial (auto-inc)</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>— Decimal —</SelectLabel>
                  <SelectItem value="numeric">numeric</SelectItem>
                  <SelectItem value="real">real</SelectItem>
                  <SelectItem value="double precision">double precision</SelectItem>
                  <SelectItem value="money">money</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>— Boolean —</SelectLabel>
                  <SelectItem value="boolean">boolean</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>— Date / Time —</SelectLabel>
                  <SelectItem value="date">date</SelectItem>
                  <SelectItem value="time">time</SelectItem>
                  <SelectItem value="timestamp">timestamp</SelectItem>
                  <SelectItem value="timestamptz">timestamptz</SelectItem>
                  <SelectItem value="interval">interval</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>— UUID / JSON —</SelectLabel>
                  <SelectItem value="uuid">uuid</SelectItem>
                  <SelectItem value="json">json</SelectItem>
                  <SelectItem value="jsonb">jsonb</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>— Other —</SelectLabel>
                  <SelectItem value="bytea">bytea</SelectItem>
                  <SelectItem value="xml">xml</SelectItem>
                  <SelectItem value="inet">inet</SelectItem>
                  <SelectItem value="tsvector">tsvector</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Default Value */}
          <div className="grid gap-2">
            <Label htmlFor="col-default">Default Value <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="col-default"
              placeholder="e.g. now(), 0, 'active'"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Nullable toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Allow NULL</Label>
              <p className="text-xs text-muted-foreground">Column can have empty / missing values</p>
            </div>
            <Switch checked={isNullable} onCheckedChange={setIsNullable} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !columnName || !dataType}>
              {isLoading ? 'Adding...' : 'Add Column'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
