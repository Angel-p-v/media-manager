import { statSync } from 'node:fs';

import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';
import { formatBytes } from './output.js';

export type DbStatsCommandOptions = CommandOptions & {
  json?: boolean;
};

/** Implementa `mm db stats`: tamaño y contenido del índice local. */
export async function runDbStatsCommand(options: DbStatsCommandOptions): Promise<void> {
  await withCommandContext(options, ({ config, library }) => {
    const stats = library.stats();
    const databasePath = config.database.path;
    const sizeBytes = databaseSize(databasePath);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            database: { path: databasePath, sizeBytes },
            media: stats.media,
            files: stats.files,
            lastRun:
              stats.lastRun === null
                ? null
                : {
                    id: stats.lastRun.id,
                    status: stats.lastRun.status,
                    startedAt: stats.lastRun.startedAt,
                    finishedAt: stats.lastRun.finishedAt,
                    filesSeen: stats.lastRun.filesSeen,
                    filesAdded: stats.lastRun.filesAdded,
                    filesRemoved: stats.lastRun.filesRemoved,
                  },
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(pc.bold('Base de datos'));
    console.log(`  ${databasePath} ${pc.dim(`(${formatBytes(sizeBytes)})`)}`);
    console.log('');
    console.log(pc.bold('Contenido'));
    console.log(`  ${stats.media.total} títulos · ${stats.files} ficheros`);
    console.log(
      `  ${stats.media.series} series · ${stats.media.anime} anime · ${stats.media.movie} películas`,
    );
    console.log('');
    console.log(pc.bold('Última indexación'));
    if (stats.lastRun === null) {
      console.log(pc.dim('  (todavía no se ha indexado nada)'));
    } else {
      const run = stats.lastRun;
      console.log(
        `  #${run.id} ${run.status} · ${run.startedAt} · ${run.filesSeen} vistos · ` +
          `${run.filesAdded} añadidos · ${run.filesRemoved} eliminados`,
      );
    }
  });
}

/** Suma el tamaño del fichero principal y de sus auxiliares WAL/SHM. */
function databaseSize(databasePath: string): number {
  if (databasePath === ':memory:') return 0;

  return [`${databasePath}`, `${databasePath}-wal`, `${databasePath}-shm`].reduce((total, file) => {
    try {
      return total + statSync(file).size;
    } catch {
      // Un fichero auxiliar puede no existir todavía; su tamaño es cero.
      return total;
    }
  }, 0);
}
