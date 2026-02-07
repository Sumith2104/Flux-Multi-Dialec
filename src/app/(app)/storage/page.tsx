import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Folder, FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCurrentUserId } from "@/lib/auth"
import fs from "fs/promises"
import path from "path"
import { cookies } from "next/headers"
import { BackButton } from "@/components/back-button"

type FileInfo = {
    name: string;
    type: 'file' | 'folder';
    size: string;
    modified: string;
};

function formatSize(bytes: number): string {
    const kb = bytes / 1024;
    if (kb > 1000) {
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
    }
    return `${kb.toFixed(2)} KB`;
}


async function getProjectFiles(projectId: string): Promise<FileInfo[]> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return [];
    }

    const projectPath = path.join(process.cwd(), 'src', 'database', userId, projectId);

    try {
        await fs.access(projectPath); // Check if directory exists
    } catch {
        return []; // Project folder doesn't exist yet
    }

    try {
        const dirents = await fs.readdir(projectPath, { withFileTypes: true });
        const files = await Promise.all(
            dirents.map(async (dirent) => {
                const fullPath = path.join(projectPath, dirent.name);
                const stats = await fs.stat(fullPath);
                
                // Exclude system files
                if (dirent.name === 'tables.csv' || dirent.name === 'columns.csv' || dirent.name.endsWith('.csv')) {
                    return null;
                }

                return {
                    name: dirent.name,
                    type: dirent.isDirectory() ? 'folder' : 'file',
                    size: formatSize(stats.size),
                    modified: stats.mtime.toLocaleDateString(),
                } as FileInfo;
            })
        );
        return files.filter(Boolean) as FileInfo[];
    } catch (error) {
        console.error(`Failed to read directory for project ${projectId}:`, error);
        return [];
    }
}


export default async function StoragePage() {
    const selectedProjectCookie = cookies().get('selectedProject');
    const projectId = selectedProjectCookie ? JSON.parse(selectedProjectCookie.value).project_id : null;
    const files = projectId ? await getProjectFiles(projectId) : [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <BackButton />
                    <div>
                        <h1 className="text-3xl font-bold">Storage</h1>
                        <p className="text-muted-foreground">
                            File and folder management for your project.
                        </p>
                    </div>
                </div>
                 <Button disabled={!projectId}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>File Explorer</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Last Modified</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!projectId ? (
                                     <TableRow>
                                        <TableCell colSpan={3} className="h-48 text-center text-muted-foreground">
                                             <div className="flex flex-col items-center justify-center">
                                                <Folder className="h-12 w-12 mb-4" />
                                                <p className="text-lg font-medium">No Project Selected</p>
                                                <p>Please select a project from the dashboard to see its files.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : files.length > 0 ? (
                                    files.map(file => (
                                        <TableRow key={file.name} className="cursor-pointer hover:bg-muted/50">
                                            <TableCell className="flex items-center gap-3 font-medium">
                                                {file.type === 'folder' ? <Folder className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
                                                <span>{file.name}</span>
                                            </TableCell>
                                            <TableCell>{file.size}</TableCell>
                                            <TableCell>{file.modified}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-48 text-center text-muted-foreground">
                                             <div className="flex flex-col items-center justify-center">
                                                <Folder className="h-12 w-12 mb-4" />
                                                <p className="text-lg font-medium">No files yet</p>
                                                <p>Upload a file to get started.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
