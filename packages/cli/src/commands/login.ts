import { Command } from 'commander';
import { saveConfig } from '../lib/config.js';

export const loginCommand = new Command('login')
  .description('Authenticate with a Fluxbase server')
  .argument('<api-url>', 'Fluxbase API URL')
  .requiredOption('-k, --key <apiKey>', 'API key')
  .action((apiUrl, opts) => {
    const url = apiUrl.replace(/\/$/, '');
    saveConfig({ apiUrl: url, apiKey: opts.key });
    console.log(`Logged in to ${url}`);
  });
