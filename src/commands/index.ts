import pc from 'picocolors';

import { loadConfig } from '../core/config/loader.js';
import { closeDatabase, openDatabase } from '../core/db/connection.js';
import { createFileRepository } from '../core/db/repositories/fileRepo.js';
import { createIndexRunRepository } from '../core/db/repositories/indexRunRepo.js';
import { createMediaRepository } from '../core/db/repositories/mediaRepo.js';
import { indexLibrary, type IndexStats } from '../core/indexer/service.js';
import { createLogger } from '../shared/logger.js';

export type IndexCommandOptions = {
  config?: string;
  dryRun?: boolean;
  root?: string;
  json?: boolean;
};

/** Implementa `mm index`: indexa la biblioteca configurada. */
export async function runIndexCommand(options: IndexCommandOptions): Promise<void> {
  const config = await loadConfig(
    options.config === undefined ? {} : { configPath: options.config },
  );

  const db = openDatabase(config.database.path);
  try {
    const stats = await indexLibrary(
      {
        mediaRepo: createMediaRepository(db),
        fileRepo: createFileRepository(db),
        indexRunRepo: createIndexRunRepository(db),
      },
      config.library,
      {
        ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        ...(options.root === undefined ? {} : { rootPath: options.root }),
      },
    );

    const logger = createLogger('warn');
    for (const warning of stats.warnings) logger.warn(warning);

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    printSummary(stats);
  } finally {
    closeDatabase(db);
  }
}

/** Resume la ejecución en lenguaje natural. */
function printSummary(stats: IndexStats): void {
  const icon = stats.dryRun ? pc.yellow('·') : pc.green('✔');
  const title = stats.dryRun ? 'Indexación simulada' : 'Indexación completada';

  console.log(`${icon} ${title} en ${formatDuration(stats.durationMs)}`);
  if (stats.dryRun) {
    console.log(pc.dim('  No se ha escrito nada en la base de datos.'));
  }
  console.log(
    `  ${stats.filesSeen} ficheros vistos · ${stats.filesAdded} añadidos o actualizados · ` +
      `${stats.filesUnchanged} sin cambios · ${stats.filesRemoved} eliminados`,
  );
  console.log(
    `  ${stats.mediaAdded} títulos nuevos · ${stats.mediaRemoved} eliminados · ` +
      `${stats.skipped} omitidos`,
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}
