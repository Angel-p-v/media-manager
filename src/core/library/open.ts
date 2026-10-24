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
import { createTagRepository, type TagRepository } from '../db/repositories/tagRepo.js';

/** Repositorios extendidos que incluyen reproducción, preferencias y etiquetas. */
export type ExtendedLibraryRepositories = LibraryRepositories & {
  playbackRepo: PlaybackRepository;
  preferenceRepo: PreferenceRepository;
  tagRepo: TagRepository;
};

/** Biblioteca abierta y lista para consultar, con su ciclo de vida. */
export type OpenedLibrary = {
  repositories: ExtendedLibraryRepositories;
  library: LibraryService;
  maintenance: DatabaseMaintenance;
  playbackRepo: PlaybackRepository;
  preferenceRepo: PreferenceRepository;
  tagRepo: TagRepository;
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
  const tagRepo = createTagRepository(db);
  const mediaRepo = createMediaRepository(db, {
    preferenceRepo,
    playbackRepo,
    tagRepo,
  });

  const repositories: ExtendedLibraryRepositories = {
    mediaRepo,
    fileRepo,
    indexRunRepo,
    playbackRepo,
    preferenceRepo,
    tagRepo,
  };

  return {
    repositories,
    library: createLibraryService(repositories),
    maintenance: createDatabaseMaintenance(db),
    playbackRepo,
    preferenceRepo,
    tagRepo,
    close: () => closeDatabase(db),
  };
}
