#!/usr/bin/env node
import process from 'node:process';

import { Command } from 'commander';

import { getVersion } from './shared/version.js';

const program = new Command()
  .name('mm')
  .description('Media Manager — gestor de contenido multimedia para terminal')
  .version(getVersion(), '-V, --version', 'muestra la versión')
  .showHelpAfterError();

await program.parseAsync(process.argv);
