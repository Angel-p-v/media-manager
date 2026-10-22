#!/usr/bin/env node
import process from 'node:process';

import { Command } from 'commander';

import { runConfigCommand } from './commands/config.js';
import { runIndexCommand } from './commands/index.js';
import { loadConfig } from './core/config/loader.js';
import { formatError } from './shared/errors.js';
import { getVersion } from './shared/version.js';
import { runTui } from './ui/run.js';

const program = new Command()
  .name('mm')
  .description('Media Manager — gestor de contenido multimedia para terminal')
  .version(getVersion(), '-V, --version', 'muestra la versión')
  .showHelpAfterError();

program
  .command('config')
  .description('muestra la configuración efectiva')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('--path', 'muestra solo la ruta del archivo de configuración')
  .option('--validate', 'valida el archivo de configuración y termina')
  .option('--json', 'salida en formato JSON')
  .action(runConfigCommand);

program
  .command('index')
  .description('indexa la biblioteca')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('--dry-run', 'simula la indexación sin escribir en la base de datos')
  .option('--root <ruta>', 'indexa solo la raíz indicada')
  .option('--json', 'salida en formato JSON')
  .action(runIndexCommand);

async function main(): Promise<void> {
  // Sin subcomando se abre la interfaz interactiva; con subcomando, la CLI headless.
  if (process.argv.length <= 2) {
    const config = await loadConfig();
    await runTui(config);
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
