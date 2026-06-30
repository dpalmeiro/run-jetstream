import { Command } from 'commander';
import { runCommand } from './commands/run.js';

export const program = new Command();

program
  .name('run-jetstream')
  .description('JetStream 3 shell runner')
  .version('0.1.0');

program.addCommand(runCommand(), { isDefault: true });
