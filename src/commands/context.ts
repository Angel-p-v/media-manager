import { loadConfig } from '../core/config/loader.js';
import { openLibrary } from '../core/library/open.js';

import type { AppConfig } from '../core/config/schema.js';
import type { LibraryRepositories, LibraryService } from '../core/library/service.js';

/** Opciones comunes a todos los subcomandos que necesitan configuración y base de datos. */
export type CommandOptions = {
  config?: string;
};

/** Dependencias que recibe un subcomando ya conectado a la biblioteca. */
export type CommandContext = {
  config: AppConfig;
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
  const opened = openLibrary(config.database.path);

  try {
    return await run({
      config,
      repositories: opened.repositories,
      library: opened.library,
    });
  } finally {
    opened.close();
  }
}
