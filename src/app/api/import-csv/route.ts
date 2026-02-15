
import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getColumnsForTable } from '@/lib/data';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { adminDb } from '@/lib/firebase-admin';

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
      const expectedWithoutId = expectedHeader.filter(h => h !== 'id');
      if (JSON.stringify(csvHeader) !== JSON.stringify(expectedWithoutId)) {
        headersMatch = false;
      }
      finalCsvHeader.unshift('id');
    } else {
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

    // Chunking for Firestore batch limit (500)
    const BATCH_SIZE = 450;
    const chunks = [];

    // Prepare rows
    const rowsToInsert = dataLines.map((line) => {
      const values = line.split(',').map(v => v.trim());
      const row: any = {};

      if (idColumnExistsInSchema && !idColumnExistsInCsv) {
        row['id'] = uuidv4();
        csvHeader.forEach((colName, idx) => {
          row[colName] = values[idx];
        });
      } else {
        expectedHeader.forEach((colName, idx) => {
          row[colName] = values[idx];
        });
      }

      // Clean undefined
      Object.keys(row).forEach(key => row[key] === undefined && delete row[key]);

      return row;
    });

    for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
      chunks.push(rowsToInsert.slice(i, i + BATCH_SIZE));
    }

    console.log(`[CSV Import] Importing ${rowsToInsert.length} rows in ${chunks.length} batches.`);

    let importedCount = 0;
    for (const chunk of chunks) {
      const batch = adminDb.batch();
      chunk.forEach(row => {
        const ref = adminDb
          .collection('users').doc(userId)
          .collection('projects').doc(projectId)
          .collection('tables').doc(tableId)
          .collection('rows').doc();

        if (row.id) {
          batch.set(ref, { ...row, _id: ref.id });
        } else {
          batch.set(ref, row);
        }
      });
      await batch.commit();
      importedCount += chunk.length;
    }

    revalidatePath(`/editor?projectId=${projectId}&tableId=${tableId}&tableName=${tableName}`);
    return NextResponse.json({ success: true, importedCount });

  } catch (error: any) {
    console.error('Failed to import CSV:', error);
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
