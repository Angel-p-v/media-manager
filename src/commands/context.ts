import { statSync } from 'node:fs';

import { loadConfig } from '../core/config/loader.js';
import { openLibrary } from '../core/library/open.js';
import { createLogger, type Logger } from '../shared/logger.js';

import type { AppConfig, PlaybackConfig } from '../core/config/schema.js';
import type { DatabaseMaintenance } from '../core/db/maintenance.js';
import type { PlaybackRepository } from '../core/db/repositories/playbackRepo.js';
import type { PreferenceRepository } from '../core/db/repositories/preferencesRepo.js';
import type { LibraryRepositories, LibraryService } from '../core/library/service.js';

/** Opciones comunes a todos los subcomandos que necesitan configuración y base de datos. */
export type CommandOptions = {
  config?: string;
  /** Fuerza `logging.level=debug`; lo inyecta el flag global `--verbose`. */
  verbose?: boolean;
  /** Ruta de archivo para escribir los logs (con rotación automática). */
  logFile?: string;
};

/** Dependencias que recibe un subcomando ya conectado a la biblioteca. */
export type CommandContext = {
  config: AppConfig;
  repositories: LibraryRepositories;
  library: LibraryService;
  maintenance: DatabaseMaintenance;
  playbackRepo: PlaybackRepository;
  preferenceRepo: PreferenceRepository;
  playbackConfig: PlaybackConfig;
  logger: Logger;
};

/**
 * Carga la configuración, abre la base de datos y garantiza que se cierra al terminar.
 *
 * Centralizar este ciclo evita que cada subcomando repita la misma secuencia y que
 * alguno se olvide de cerrar la conexión si una consulta falla. El logger se crea
 * aquí para que todos los subcomandos compartan nivel y formato.
 */
export async function withCommandContext<T>(
  options: CommandOptions,
  run: (context: CommandContext) => T | Promise<T>,
): Promise<T> {
  const config = await loadConfig(
    options.config === undefined ? {} : { configPath: options.config },
  );
  const logger = createLogger({
    level: options.verbose === true ? 'debug' : config.logging.level,
    format: config.logging.format,
    ...(options.logFile !== undefined ? { logFile: options.logFile } : {}),
  });
  logger.debug('config.loaded', {
    database: config.database.path,
    roots: config.library.roots.length,
    player: config.player.default,
  });

  // Validar que las raíces de biblioteca existen; advertir si alguna falta
  for (const root of config.library.roots) {
    try {
      const stat = statSync(root.path);
      if (!stat.isDirectory()) {
        logger.warn('library.root.no-existe', {
          root: root.path,
          type: root.type,
          motivo: 'no es un directorio',
        });
      }
    } catch {
      logger.warn('library.root.no-existe', {
        root: root.path,
        type: root.type,
        motivo: 'no se pudo acceder',
      });
    }
  }

  const opened = openLibrary(config.database.path, config, logger);
  logger.debug('db.opened', { path: config.database.path });

  try {
    return await run({
      config,
      repositories: opened.repositories,
      library: opened.library,
      maintenance: opened.maintenance,
      playbackRepo: opened.playbackRepo,
      preferenceRepo: opened.preferenceRepo,
      playbackConfig: config.playback,
      logger,
    });
  } finally {
    opened.close();
    logger.debug('db.closed');
  }
}
