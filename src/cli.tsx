#!/usr/bin/env node
import process from 'node:process';

import { Command, CommanderError } from 'commander';

import { runConfigCommand } from './commands/config.js';
import { runDbStatsCommand } from './commands/db.js';
import { runIndexCommand } from './commands/index.js';
import { runListCommand } from './commands/list.js';
import {
  parseMediaType,
  parseNonNegativeInteger,
  parsePositiveInteger,
  parseSortOrder,
} from './commands/options.js';
import { runPlayCommand } from './commands/play.js';
import { runSearchCommand } from './commands/search.js';
import { runShowCommand } from './commands/show.js';
import { runWatchCommand } from './commands/watch.js';
import { loadConfig } from './core/config/loader.js';
import { formatError } from './shared/errors.js';
import { getVersion } from './shared/version.js';
import { runTui } from './ui/run.js';

const program = new Command()
  .name('mm')
  .description('Media Manager — gestor de contenido multimedia para terminal')
  .version(getVersion(), '-V, --version', 'muestra la versión')
  .showHelpAfterError()
  .addHelpText(
    'after',
    '\nCódigos de salida:\n  0  éxito\n  1  error de ejecución\n  2  uso incorrecto',
  )
  .exitOverride();

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

program
  .command('list')
  .description('enumera los títulos de la biblioteca')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('-t, --type <tipo>', 'filtra por tipo (series, anime, movie)', parseMediaType)
  .option('--sort <orden>', 'ordena por title, added o recent', parseSortOrder)
  .option('--limit <n>', 'número máximo de resultados', parsePositiveInteger)
  .option('--offset <n>', 'resultados a saltar', parseNonNegativeInteger)
  .option('--json', 'salida en formato JSON')
  .action(runListCommand);

program
  .command('search')
  .description('busca títulos por texto')
  .argument('<consulta>', 'texto a buscar')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('-t, --type <tipo>', 'filtra por tipo (series, anime, movie)', parseMediaType)
  .option('--limit <n>', 'número máximo de resultados', parsePositiveInteger)
  .option('--json', 'salida en formato JSON')
  .action(runSearchCommand);

program
  .command('show')
  .description('muestra el detalle de un título')
  .argument('<id-o-titulo>', 'id numérico o título a consultar')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('--json', 'salida en formato JSON')
  .action(runShowCommand);

program
  .command('play')
  .description('reproduce un título con el reproductor configurado')
  .argument('<id-o-titulo>', 'id numérico o título a reproducir')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('-f, --file <id>', 'id del fichero a reproducir', parsePositiveInteger)
  .option('-p, --player <nombre>', 'reproductor alternativo al configurado')
  .option('--foreground', 'espera a que el reproductor termine')
  .option('--dry-run', 'muestra el comando sin lanzar el reproductor')
  .option('--json', 'salida en formato JSON')
  .action(runPlayCommand);

program
  .command('watch')
  .description('vigila las raíces y reindexa al detectar cambios')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .action(runWatchCommand);

const dbCommand = program.command('db').description('operaciones sobre la base de datos local');

dbCommand
  .command('stats')
  .description('muestra el tamaño y el contenido del índice')
  .option('-c, --config <ruta>', 'archivo de configuración a usar')
  .option('--json', 'salida en formato JSON')
  .action(runDbStatsCommand);

async function main(): Promise<void> {
  // Sin subcomando se abre la interfaz interactiva; con subcomando, la CLI headless.
  if (process.argv.length <= 2) {
    const config = await loadConfig();
    await runTui(config);
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Commander ya ha impreso la ayuda, la versión o el error de uso. Solo `help`
    // y `--version` salen con 0; el resto son errores de uso (2).
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode === 0 ? 0 : 2;
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
