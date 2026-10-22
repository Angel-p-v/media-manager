import { loadConfig } from '../core/config/loader.js';
import { closeDatabase, openDatabase, type Db } from '../core/db/connection.js';
import { createFileRepository } from '../core/db/repositories/fileRepo.js';
import { createIndexRunRepository } from '../core/db/repositories/indexRunRepo.js';
import { createMediaRepository } from '../core/db/repositories/mediaRepo.js';
import {
  createLibraryService,
  type LibraryRepositories,
  type LibraryService,
} from '../core/library/service.js';

import type { AppConfig } from '../core/config/schema.js';

/** Opciones comunes a todos los subcomandos que necesitan configuración y base de datos. */
export type CommandOptions = {
  config?: string;
};

/** Dependencias que recibe un subcomando ya conectado a la biblioteca. */
export type CommandContext = {
  config: AppConfig;
  db: Db;
  repositories: LibraryRepositories;
  library: LibraryService;
};

/**
 * Carga la configuración, abre la base de datos y garantiza que se cierra al terminar.
 *
 * Centralizar este ciclo evita que cada subcomando repita la misma secuencia y que
 * alguno se olvide de cerrar la conexión si una consulta falla.
 */
export async function withCommandContext<T>(
  options: CommandOptions,
  run: (context: CommandContext) => T | Promise<T>,
): Promise<T> {
  const config = await loadConfig(
    options.config === undefined ? {} : { configPath: options.config },
  );
  const db = openDatabase(config.database.path);

  try {
    const repositories: LibraryRepositories = {
      mediaRepo: createMediaRepository(db),
      fileRepo: createFileRepository(db),
      indexRunRepo: createIndexRunRepository(db),
    };

    return await run({
      config,
      db,
      repositories,
      library: createLibraryService(repositories),
    });
  } finally {
    closeDatabase(db);
  }
}
