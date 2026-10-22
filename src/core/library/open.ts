import { createLibraryService, type LibraryRepositories, type LibraryService } from './service.js';
import { closeDatabase, openDatabase } from '../db/connection.js';
import { createFileRepository } from '../db/repositories/fileRepo.js';
import { createIndexRunRepository } from '../db/repositories/indexRunRepo.js';
import { createMediaRepository } from '../db/repositories/mediaRepo.js';

/** Biblioteca abierta y lista para consultar, con su ciclo de vida. */
export type OpenedLibrary = {
  repositories: LibraryRepositories;
  library: LibraryService;
  close: () => void;
};

/**
 * Abre la base de datos y construye la capa de consulta.
 *
 * Lo usan tanto la CLI como la TUI para no duplicar el cableado de repositorios.
 * El llamante es responsable de invocar `close()` al terminar.
 */
export function openLibrary(databasePath: string): OpenedLibrary {
  const db = openDatabase(databasePath);
  const repositories: LibraryRepositories = {
    mediaRepo: createMediaRepository(db),
    fileRepo: createFileRepository(db),
    indexRunRepo: createIndexRunRepository(db),
  };

  return {
    repositories,
    library: createLibraryService(repositories),
    close: () => closeDatabase(db),
  };
}
