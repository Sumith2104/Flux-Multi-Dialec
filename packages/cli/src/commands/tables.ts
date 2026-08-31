import { Command } from 'commander';
import { apiRequest } from '../lib/config.js';

export const tablesCommand = new Command('tables')
  .description('List all tables in a project')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .action(async (opts) => {
    try {
      const result = await apiRequest(`/api/schema?projectId=${opts.project}`);
      if (result.tables) {
        console.log('Tables:');
        for (const t of result.tables) {
          console.log(`  ${t.name} (${t.columns?.length || 0} cols)`);
        }
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err: any) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });
