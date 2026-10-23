import { AmbiguousError, NotFoundError } from '../../shared/errors.js';

import type { MediaType } from '../config/schema.js';
import type { FileRepository } from '../db/repositories/fileRepo.js';
import type { IndexRunRepository } from '../db/repositories/indexRunRepo.js';
import type { ListMediaOptions, MediaRepository } from '../db/repositories/mediaRepo.js';
import type { PlaybackRepository } from '../db/repositories/playbackRepo.js';
import type { IndexRunRow, MediaFileRow, MediaRow } from '../db/types.js';

/** Repositorios que necesita la capa de consulta, inyectados por el llamante. */
export type LibraryRepositories = {
  mediaRepo: MediaRepository;
  fileRepo: FileRepository;
  indexRunRepo: IndexRunRepository;
  playbackRepo: PlaybackRepository;
};

export type SearchMediaOptions = {
  type?: MediaType;
  limit?: number;
};

export type MediaDetails = {
  media: MediaRow;
  files: MediaFileRow[];
};

export type LibraryStats = {
  media: Record<'total' | MediaType, number>;
  files: number;
  lastRun: IndexRunRow | null;
  inProgress: number;
};

/**
 * Casos de uso de consulta de la biblioteca.
 *
 * La capa de presentación (CLI o TUI) solo habla con esta interfaz: no conoce
 * SQL ni la forma de las tablas.
 */
export type LibraryService = {
  list(options?: ListMediaOptions): MediaRow[];
  count(type?: MediaType): number;
  search(query: string, options?: SearchMediaOptions): MediaRow[];
  /** Resuelve un id o un título y devuelve el título con sus ficheros. */
  find(query: string): MediaDetails;
  /** Títulos en curso (con progreso guardado y no completados). */
  listInProgress(limit?: number): MediaRow[];
  stats(): LibraryStats;
};

/** Crea el servicio de biblioteca sobre un conjunto de repositorios. */
export function createLibraryService(repositories: LibraryRepositories): LibraryService {
  const { mediaRepo, fileRepo, indexRunRepo, playbackRepo } = repositories;

  const detailsFor = (media: MediaRow): MediaDetails => ({
    media,
    files: fileRepo.listByMedia(media.id),
  });

  return {
    list(options: ListMediaOptions = {}): MediaRow[] {
      return mediaRepo.list(options);
    },

    count(type?: MediaType): number {
      return mediaRepo.count(type);
    },

    search(query: string, options: SearchMediaOptions = {}): MediaRow[] {
      return mediaRepo.search(query, options);
    },

    find(query: string): MediaDetails {
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        throw new NotFoundError('Indica un id o un título para consultar la biblioteca.');
      }

      // Un número puede ser un id o el título de una película (`1917`). Se intenta
      // primero como id y, si no existe, se busca por título.
      if (/^\d+$/.test(trimmed)) {
        const byId = mediaRepo.findById(Number(trimmed));
        if (byId) return detailsFor(byId);
      }

      const matches = mediaRepo.search(trimmed, { limit: 20 });
      const normalized = normalizeForMatch(trimmed);
      const exact = matches.filter((media) => normalizeForMatch(media.title) === normalized);
      const candidates = exact.length > 0 ? exact : matches;

      if (candidates.length === 0) {
        throw new NotFoundError(`No hay ningún título que coincida con «${trimmed}».`);
      }

      if (candidates.length > 1) {
        const options = candidates
          .slice(0, 10)
          .map((media) => `  · #${media.id} ${formatTitle(media)}`)
          .join('\n');
        throw new AmbiguousError(
          `Hay varios títulos que coinciden con «${trimmed}»:\n${options}\nUsa el id para elegir uno.`,
        );
      }

      return detailsFor(candidates[0]!);
    },

    listInProgress(limit = 200): MediaRow[] {
      const entries = playbackRepo.listInProgress(limit);
      // Devolvemos solo los MediaRow únicos (un título puede tener varios ficheros en progreso)
      const seen = new Set<number>();
      return entries
        .map((entry) => entry.media)
        .filter((media) => {
          if (seen.has(media.id)) return false;
          seen.add(media.id);
          return true;
        });
    },

    stats(): LibraryStats {
      return {
        media: {
          total: mediaRepo.count(),
          series: mediaRepo.count('series'),
          anime: mediaRepo.count('anime'),
          movie: mediaRepo.count('movie'),
        },
        files: fileRepo.count(),
        lastRun: indexRunRepo.latest() ?? null,
        inProgress: playbackRepo.count(),
      };
    },
  };
}

/** Compara títulos sin depender de mayúsculas, acentos ni espacios repetidos. */
function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Formatea un título con su año para listados de desambiguación. */
function formatTitle(media: MediaRow): string {
  return media.year === null ? media.title : `${media.title} (${media.year})`;
}
