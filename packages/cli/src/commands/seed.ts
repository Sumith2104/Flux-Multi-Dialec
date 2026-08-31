import { Command } from 'commander';
import { readFileSync } from 'fs';
import { apiRequest } from '../lib/config.js';

export const seedCommand = new Command('seed')
  .description('Insert JSON data into a table')
  .argument('<file>', 'Path to JSON file (array of objects)')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .requiredOption('-t, --table <table>', 'Table name')
  .action(async (file, opts) => {
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      if (!Array.isArray(data)) throw new Error('JSON must be an array');

      console.log(`Seeding ${data.length} row(s) into ${opts.table}...`);

      const result = await apiRequest('/api/bulk-fast-insert', {
        method: 'POST',
        body: JSON.stringify({
          projectId: opts.project,
          table: opts.table,
          rows: data,
        }),
      });

      console.log(`Inserted: ${result.inserted_rows ?? 'unknown'}`);
      if (result.errors?.length) {
        console.log(`Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach((e: any) => console.log(`  Row ${e.row}: ${e.message}`));
      }
    } catch (err: any) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
