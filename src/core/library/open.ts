import { createLibraryService, type LibraryRepositories, type LibraryService } from './service.js';
import { closeDatabase, openDatabase } from '../db/connection.js';
import { createDatabaseMaintenance, type DatabaseMaintenance } from '../db/maintenance.js';
import { createFileRepository } from '../db/repositories/fileRepo.js';
import { createIndexRunRepository } from '../db/repositories/indexRunRepo.js';
import { createMediaRepository } from '../db/repositories/mediaRepo.js';
import {
  createPlaybackRepository,
  type PlaybackRepository,
} from '../db/repositories/playbackRepo.js';
import {
  createPreferenceRepository,
  type PreferenceRepository,
} from '../db/repositories/preferencesRepo.js';

/** Repositorios extendidos que incluyen reproducción y preferencias. */
export type ExtendedLibraryRepositories = LibraryRepositories & {
  playbackRepo: PlaybackRepository;
  preferenceRepo: PreferenceRepository;
};

/** Biblioteca abierta y lista para consultar, con su ciclo de vida. */
export type OpenedLibrary = {
  repositories: ExtendedLibraryRepositories;
  library: LibraryService;
  maintenance: DatabaseMaintenance;
  playbackRepo: PlaybackRepository;
  preferenceRepo: PreferenceRepository;
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
  const fileRepo = createFileRepository(db);
  const indexRunRepo = createIndexRunRepository(db);
  const playbackRepo = createPlaybackRepository(db);
  const preferenceRepo = createPreferenceRepository(db);
  const mediaRepo = createMediaRepository(db, { preferenceRepo, playbackRepo });

  const repositories: ExtendedLibraryRepositories = {
    mediaRepo,
    fileRepo,
    indexRunRepo,
    playbackRepo,
    preferenceRepo,
  };

  return {
    repositories,
    library: createLibraryService(repositories),
    maintenance: createDatabaseMaintenance(db),
    playbackRepo,
    preferenceRepo,
    close: () => closeDatabase(db),
  };
}
