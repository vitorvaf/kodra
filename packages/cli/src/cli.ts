#!/usr/bin/env node
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };

export const program = new Command();
program.name('kanbots').version(pkg.version);

// The CLI runs locally without a Kanbots Cloud session. Cloud-dependent
// subcommands opt in by calling `requireCloudAuth()` from './auth.js' in
// their own action handlers; local-only commands run with no auth gate.

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}
