import { Command } from 'commander';
import { readFileSync } from 'fs';
import { apiRequest } from '../lib/config.js';

export const pushCommand = new Command('push')
  .description('Execute a SQL file')
  .argument('<file>', 'Path to SQL file')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .action(async (file, opts) => {
    try {
      const sql = readFileSync(file, 'utf-8');
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);

      console.log(`Executing ${statements.length} statement(s)...`);
      for (let i = 0; i < statements.length; i++) {
        const result = await apiRequest('/api/execute-sql', {
          method: 'POST',
          body: JSON.stringify({ projectId: opts.project, sql: statements[i] }),
        });
        const affected = result.rowCount ?? 0;
        console.log(`  [${i + 1}/${statements.length}] OK (${affected} rows)`);
      }
      console.log('Done.');
    } catch (err: any) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
