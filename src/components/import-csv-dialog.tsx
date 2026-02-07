
'use client';

import { useState, useRef, ChangeEvent, FormEvent } from 'react';
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
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type Column } from '@/lib/data';
import { SubmitButton } from './submit-button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { DeleteProgress } from './delete-progress';

type ImportCsvDialogProps = {
  projectId: string;
  tableId: string;
  tableName: string;
  columns: Column[];
  onImportSuccess: () => void;
};

export function ImportCsvDialog({ projectId, tableId, tableName, columns, onImportSuccess }: ImportCsvDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
    }
  };

  const handleAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!csvFile) {
      toast({
        variant: 'destructive',
        title: 'No File Selected',
        description: 'Please select a CSV file to import.',
      });
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('tableId', tableId);
    formData.append('tableName', tableName);
    formData.append('csvFile', csvFile);

    try {
      const response = await fetch('/api/import-csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Success',
          description: `${result.importedCount} rows imported successfully.`,
        });
        setIsOpen(false);
        setCsvFile(null);
        if(fileInputRef.current) fileInputRef.current.value = '';
        onImportSuccess();
      } else {
        toast({
          variant: 'destructive',
          title: 'Import Failed',
          description: result.error || 'An unexpected error occurred.',
          duration: 10000,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Network Error',
        description: 'Failed to communicate with the server.',
        duration: 10000,
      });
    } finally {
        setIsSubmitting(false);
    }
  };

  const expectedHeader = columns.map(c => c.column_name).join(',');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if(!isSubmitting) setIsOpen(open);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Data into `{tableName}`</DialogTitle>
           {!isSubmitting && (
            <DialogDescription>
              Upload a CSV file to add new rows. The file must have a header that matches the table
              structure exactly.
            </DialogDescription>
           )}
        </DialogHeader>
        {isSubmitting ? (
          <div className="py-8 space-y-4">
            <p className="text-center text-muted-foreground">Importing data... Please do not close this window.</p>
            <DeleteProgress />
          </div>
        ) : (
          <form onSubmit={handleAction}>
            <div className="grid gap-6 py-4">
              <Alert>
                  <AlertTitle>Required CSV Structure</AlertTitle>
                  <AlertDescription>
                      <p className="mb-2">For a successful import, please ensure your CSV file follows these rules:</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                          <li>The first line must be a header row with column names.</li>
                          <li>The header must exactly match the table columns: <code className="font-mono bg-muted text-foreground p-1 rounded-sm whitespace-normal break-words">{expectedHeader}</code></li>
                          <li>The file should be UTF-8 encoded.</li>
                      </ul>
                  </AlertDescription>
              </Alert>
              <div className="flex items-center gap-4">
                  <Input
                    id="csvFile"
                    name="csvFile"
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    Choose File
                  </Button>
                   <span className="text-sm text-muted-foreground">
                      {csvFile ? csvFile.name : "No file chosen"}
                    </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <SubmitButton type="submit" disabled={!csvFile || isSubmitting}>
                {isSubmitting ? 'Importing...' : 'Import Data'}
              </SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

    
