import { Command } from 'commander';
import { apiRequest } from '../lib/config.js';

export const sqlCommand = new Command('sql')
  .description('Execute a SQL query')
  .argument('<query>', 'SQL query to execute')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .action(async (query, opts) => {
    try {
      const result = await apiRequest('/api/execute-sql', {
        method: 'POST',
        body: JSON.stringify({ projectId: opts.project, sql: query }),
      });

      if (result.rows && result.rows.length > 0) {
        const cols = Object.keys(result.rows[0]);
        const widths = cols.map(c => Math.max(c.length, ...result.rows.map((r: any) => String(r[c] ?? '').length)));

        const header = cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
        const sep = widths.map(w => '-'.repeat(w)).join('-+-');
        const rows = result.rows.map((r: any) =>
          cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | ')
        );

        console.log(header);
        console.log(sep);
        rows.forEach((r: string) => console.log(r));
        console.log(`
${result.rows.length} row(s) returned.`);
        if (result.truncated) console.log(`(Result truncated at ${result.totalRows} total rows)`);
      } else if (result.rowCount !== undefined) {
        console.log(`${result.rowCount} row(s) affected.`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err: any) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
