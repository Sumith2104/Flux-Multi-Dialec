#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { sqlCommand } from './commands/sql.js';
import { tablesCommand } from './commands/tables.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { seedCommand } from './commands/seed.js';

const program = new Command();

program
  .name('fluxbase')
  .description('Fluxbase CLI - manage databases from the terminal')
  .version('0.1.0');

program.addCommand(loginCommand);
program.addCommand(sqlCommand);
program.addCommand(tablesCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(seedCommand);

program.parse();
