import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { apiRequest } from '../lib/config.js';

export const pullCommand = new Command('pull')
  .description('Dump tables as CREATE TABLE DDL')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .action(async (opts) => {
    try {
      const schema = await apiRequest(`/api/schema?projectId=${opts.project}`);
      let ddl = '-- Fluxbase schema dump\n';

      if (schema.tables) {
        for (const t of schema.tables) {
          ddl += `\nCREATE TABLE "${t.name}" (\n`;
          const colDefs = (t.columns || []).map((c: any) =>
            `  "${c.name}" ${c.type}${c.nullable === false ? ' NOT NULL' : ''}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`
          );
          ddl += colDefs.join(',\n');
          ddl += '\n);\n';
        }
      }

      if (opts.output) {
        writeFileSync(opts.output, ddl);
        console.log(`Schema written to ${opts.output}`);
      } else {
        console.log(ddl);
      }
    } catch (err: any) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
