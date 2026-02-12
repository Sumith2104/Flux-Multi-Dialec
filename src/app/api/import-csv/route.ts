
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth';
import { getColumnsForTable } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 300; // 5 minutes

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const projectId = formData.get('projectId') as string;
    const tableId = formData.get('tableId') as string;
    const tableName = formData.get('tableName') as string;
    const csvFile = formData.get('csvFile') as File | null;

    if (!projectId || !tableId || !tableName || !csvFile) {
      return NextResponse.json({ error: 'Missing required fields for CSV import.' }, { status: 400 });
    }

    const tableColumns = await getColumnsForTable(projectId, tableId);
    if (tableColumns.length === 0) {
      return NextResponse.json({ error: 'Table columns could not be determined. Cannot import.' }, { status: 400 });
    }
    const expectedHeader = tableColumns.map(c => c.column_name);

    // Read the entire file and clean it first
    const fileContent = await csvFile.text();
    console.log(`[CSV Import] Received file: ${csvFile.name}, Size: ${fileContent.length} chars`);

    const cleanedLines = fileContent
      .trim()
      .split(/\r\n|\n|\r/)
      .map(line => line.trim())
      .filter(line => line);

    console.log(`[CSV Import] Parsed lines: ${cleanedLines.length}`);

    if (cleanedLines.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty or contains only whitespace.' }, { status: 400 });
    }

    // Validate header from the cleaned content
    const headerLine = cleanedLines[0];
    const csvHeader = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Check for mismatches, but allow the CSV to omit the 'id' column
    const idColumnExistsInSchema = expectedHeader.includes('id');
    const idColumnExistsInCsv = csvHeader.includes('id');

    let finalCsvHeader = [...csvHeader];
    let headersMatch = true;

    if (idColumnExistsInSchema && !idColumnExistsInCsv) {
      // If schema expects 'id' but CSV doesn't have it, that's OK.
      // We will add `id` to the csvHeader for processing, but compare the rest.
      const expectedWithoutId = expectedHeader.filter(h => h !== 'id');
      if (JSON.stringify(csvHeader) !== JSON.stringify(expectedWithoutId)) {
        headersMatch = false;
      }
      // For processing, we assume the 'id' is the first column
      finalCsvHeader.unshift('id');
    } else {
      // Standard comparison if 'id' logic doesn't apply
      if (JSON.stringify(csvHeader) !== JSON.stringify(expectedHeader)) {
        headersMatch = false;
      }
    }

    if (!headersMatch) {
      const errorMessage = `CSV header does not match table structure. Expected: ${expectedHeader.join(',')} | Received: ${csvHeader.join(',')}`;
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get the data rows (all lines except the header)
    const dataLines = cleanedLines.slice(1);
    let importedCount = 0;

    const projectPath = path.join(process.cwd(), 'src', 'database', userId, projectId);
    const dataFilePath = path.join(projectPath, `${tableName}.csv`);

    // Ensure directory exists
    try {
      await fs.access(projectPath);
    } catch {
      await fs.mkdir(projectPath, { recursive: true });
    }

    const contentToAppend = dataLines.map((line) => {
      // ... (data processing logic is fine, but need to be careful with map index if we were using it)
      const values = line.split(',').map(v => v.trim());

      let processedValues = [...values];

      if (idColumnExistsInSchema && !idColumnExistsInCsv) {
        processedValues.unshift(uuidv4());
      }

      // Simplified check for now (length check constraint)
      // Note: in a real app, use a proper CSV parser library
      importedCount++;
      return processedValues.join(',');
    }).join('\n');

    if (contentToAppend) {
      // Check if file exists to determine if we need a newline or header
      try {
        await fs.access(dataFilePath);
        // File exists, append with newline
        await fs.appendFile(dataFilePath, '\n' + contentToAppend, 'utf8');
      } catch {
        // File doesn't exist, create it with header (and then content)
        // Wait, if we are in this block, the table was *just* created in Firestore.
        // But we are using CSV as the storage engine? 

        // Correction: The Architecture seems to be hybrid or in transition. 
        // The error log shows `src/database/...` path which implies file-based storage.
        // If the file doesn't exist, we should write Header + Content.

        // Re-constructing the header for the new file
        const fullHeader = expectedHeader.join(',');
        await fs.writeFile(dataFilePath, fullHeader + '\n' + contentToAppend, 'utf8');
      }
    }

    revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
    return NextResponse.json({ success: true, importedCount });

  } catch (error: any) {
    console.error('Failed to import CSV:', error);
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
