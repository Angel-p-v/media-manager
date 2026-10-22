import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';
import { formatBytes } from './output.js';
import { databaseSizeBytes } from '../core/db/size.js';

export type DbStatsCommandOptions = CommandOptions & {
  json?: boolean;
};

export type DbOptimizeCommandOptions = CommandOptions & {
  vacuum?: boolean;
  json?: boolean;
};

/** Implementa `mm db stats`: tamaño y contenido del índice local. */
export async function runDbStatsCommand(options: DbStatsCommandOptions): Promise<void> {
  await withCommandContext(options, ({ config, library }) => {
    const stats = library.stats();
    const databasePath = config.database.path;
    const sizeBytes = databaseSizeBytes(databasePath);

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

/** Implementa `mm db optimize`: actualiza estadísticas y, opcionalmente, compacta. */
export async function runDbOptimizeCommand(options: DbOptimizeCommandOptions): Promise<void> {
  await withCommandContext(options, ({ config, maintenance, logger }) => {
    const beforeBytes = databaseSizeBytes(config.database.path);
    const startedAt = performance.now();

    maintenance.optimize();
    if (options.vacuum === true) maintenance.vacuum();

    const durationMs = Math.round(performance.now() - startedAt);
    const afterBytes = databaseSizeBytes(config.database.path);
    logger.debug('db.optimized', {
      vacuum: options.vacuum === true,
      beforeBytes,
      afterBytes,
      durationMs,
    });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            optimized: true,
            vacuum: options.vacuum === true,
            beforeBytes,
            afterBytes,
            durationMs,
          },
          null,
          2,
        ),
      );
      return;
    }

    const method = options.vacuum === true ? 'PRAGMA optimize + VACUUM' : 'PRAGMA optimize';
    console.log(pc.green('✔') + ` Base de datos optimizada (${method}) en ${durationMs} ms`);
    console.log(pc.dim(`  ${formatBytes(beforeBytes)} → ${formatBytes(afterBytes)}`));
  });
}
