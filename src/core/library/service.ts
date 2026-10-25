import { AmbiguousError, NotFoundError } from '../../shared/errors.js';

import type { MediaType, MetadataConfig } from '../config/schema.js';
import type { FileRepository } from '../db/repositories/fileRepo.js';
import type { IndexRunRepository } from '../db/repositories/indexRunRepo.js';
import type { ListMediaOptions, MediaRepository } from '../db/repositories/mediaRepo.js';
import type { MetadataRepository, MediaMetadataRow } from '../db/repositories/metadataRepo.js';
import type { PlaybackRepository } from '../db/repositories/playbackRepo.js';
import type { PreferenceRepository } from '../db/repositories/preferencesRepo.js';
import type { TagRepository, TagRow } from '../db/repositories/tagRepo.js';
import type { IndexRunRow, MediaFileRow, MediaRow } from '../db/types.js';
import type { MetadataService } from '../metadata/service.js';

/** Repositorios que necesita la capa de consulta, inyectados por el llamante. */
export type LibraryRepositories = {
  mediaRepo: MediaRepository;
  fileRepo: FileRepository;
  indexRunRepo: IndexRunRepository;
  playbackRepo: PlaybackRepository;
  preferenceRepo: PreferenceRepository;
  tagRepo: TagRepository;
  metadataRepo: MetadataRepository;
  metadataService: MetadataService;
  metadataConfig: MetadataConfig;
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
  /** Número de títulos marcados como favoritos. */
  countFavorites(): number;
  /** Lista todos los tags disponibles. */
  listTags(): TagRow[];
  /** Obtiene un tag por nombre. */
  getTagByName(name: string): TagRow | undefined;
  /** Asigna un tag a un título. */
  assignTag(mediaId: number, tagName: string): void;
  /** Quita un tag de un título. */
  unassignTag(mediaId: number, tagName: string): void;
  /** Lista los tags de un título. */
  listTagsForMedia(mediaId: number): TagRow[];
  /** Obtiene metadatos externos de un título. */
  getMetadata(mediaId: number): MediaMetadataRow | undefined;
  /** Establece o actualiza metadatos externos de un título. */
  setMetadata(input: {
    mediaId: number;
    provider: 'tmdb' | 'tvdb' | 'omdb';
    externalId: number;
    title?: string | null;
    overview?: string | null;
    posterPath?: string | null;
    backdropPath?: string | null;
    voteAverage?: number | null;
    firstAirDate?: string | null;
    releaseDate?: string | null;
    originalLanguage?: string | null;
  }): MediaMetadataRow;
  /** Elimina metadatos externos de un título. */
  removeMetadata(mediaId: number): boolean;
  /**
   * Obtiene metadatos de un título, refrescándolos automáticamente si están
   * expirados según el TTL configurado. Si no hay API key configurada, devuelve
   * los metadatos almacenados (o undefined si no existen).
   */
  getOrFetchMetadata(mediaId: number): Promise<MediaMetadataRow | undefined>;
  /**
   * Refresca todos los metadatos cuyo caché ha expirado según el TTL configurado.
   * Devuelve cuántos se refrescaron y cuántos fallaron.
   */
  refreshExpiredMetadata(): Promise<{ refreshed: number; failed: number }>;
  /** Devuelve la cantidad de metadatos expirados según el TTL configurado. */
  getExpiredMetadataCount(): number;
  /** Devuelve true si hay algún proveedor de metadatos configurado. */
  hasMetadataProviderConfigured(): boolean;
};

/**
 * Comportamiento de los filtros watched/unwatched en mediaRepo.list():
 *
 * - watched: título tiene AL MENOS UN archivo con completedAt !== null
 * - unwatched: título NO TIENE archivos con completedAt !== null
 *   (incluye títulos nunca reproducidos y parcialmente vistos sin completar)
 */

/** Crea el servicio de biblioteca sobre un conjunto de repositorios. */
export function createLibraryService(repositories: LibraryRepositories): LibraryService {
  const {
    mediaRepo,
    fileRepo,
    indexRunRepo,
    playbackRepo,
    preferenceRepo,
    tagRepo,
    metadataRepo,
    metadataService,
    metadataConfig,
  } = repositories;

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

      const candidate = candidates[0];
      if (!candidate) throw new NotFoundError('No se encontró el título');
      return detailsFor(candidate);
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

    countFavorites(): number {
      return preferenceRepo.countFavorites();
    },

    listTags(): TagRow[] {
      return tagRepo.list();
    },

    getTagByName(name: string): TagRow | undefined {
      return tagRepo.getByName(name);
    },

    assignTag(mediaId: number, tagName: string): void {
      const tag = tagRepo.getByName(tagName);
      if (!tag) {
        // Crear el tag si no existe
        const created = tagRepo.create({ name: tagName });
        tagRepo.assign(mediaId, created.id);
      } else {
        tagRepo.assign(mediaId, tag.id);
      }
    },

    unassignTag(mediaId: number, tagName: string): void {
      const tag = tagRepo.getByName(tagName);
      if (tag) {
        tagRepo.unassign(mediaId, tag.id);
      }
    },

    listTagsForMedia(mediaId: number): TagRow[] {
      return tagRepo.listByMedia(mediaId);
    },

    getMetadata(mediaId: number): MediaMetadataRow | undefined {
      return metadataRepo.get(mediaId);
    },

    setMetadata(input: {
      mediaId: number;
      provider: 'tmdb' | 'tvdb';
      externalId: number;
      title?: string | null;
      overview?: string | null;
      posterPath?: string | null;
      backdropPath?: string | null;
      voteAverage?: number | null;
      firstAirDate?: string | null;
      releaseDate?: string | null;
      originalLanguage?: string | null;
      localPosterPath?: string | null;
    }): MediaMetadataRow {
      return metadataRepo.set({
        mediaId: input.mediaId,
        provider: input.provider,
        externalId: input.externalId,
        title: input.title ?? null,
        overview: input.overview ?? null,
        posterPath: input.posterPath ?? null,
        backdropPath: input.backdropPath ?? null,
        voteAverage: input.voteAverage ?? null,
        firstAirDate: input.firstAirDate ?? null,
        releaseDate: input.releaseDate ?? null,
        originalLanguage: input.originalLanguage ?? null,
        localPosterPath: input.localPosterPath ?? null,
        updatedAt: new Date().toISOString(),
      });
    },

    removeMetadata(mediaId: number): boolean {
      return metadataRepo.remove(mediaId);
    },

    /**
     * Obtiene metadatos de un título, refrescándolos automáticamente si están
     * expirados según el TTL configurado. Si no hay API key configurada, devuelve
     * los metadatos almacenados (o undefined si no existen).
     */
    async getOrFetchMetadata(mediaId: number): Promise<MediaMetadataRow | undefined> {
      await Promise.resolve();
      const existing = metadataRepo.get(mediaId);
      const ttlHours = metadataConfig.cacheTtlHours ?? 24;
      const now = new Date();

      // Si existen metadatos y no han expirado, devolverlos directamente
      if (existing) {
        const fetchedAt = new Date(existing.fetchedAt);
        const ageHours = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60);
        if (ageHours < ttlHours) {
          return existing;
        }
      }

      // Si hay API key configurada, intentar refrescar desde la API externa
      if (metadataService.hasProviderConfigured()) {
        // Intentar TMDB primero, luego TVDB
        for (const provider of ['tmdb', 'tvdb'] as const) {
          if (!metadataService.isProviderConfigured(provider)) continue;

          try {
            // Buscar por título para obtener el externalId (simplificado: usamos el existing o buscamos)
            // Nota: en una implementación completa necesitaríamos buscar por título del media
            // Aquí solo refrescamos si ya tenemos externalId guardado
            if (existing?.externalId) {
              const mediaType = existing.provider === 'tvdb' ? 'tv' : 'movie';
              const details = await metadataService.getDetails(
                existing.externalId,
                provider,
                mediaType,
              );
              return metadataRepo.set({
                mediaId,
                provider,
                externalId: details.externalId,
                title: details.title,
                overview: details.overview,
                posterPath: details.posterPath,
                backdropPath: details.backdropPath,
                voteAverage: details.voteAverage,
                releaseDate: details.releaseDate,
                originalLanguage: details.originalLanguage,
                localPosterPath: details.localPosterPath ?? null,
                updatedAt: now.toISOString(),
              });
            }
          } catch {
            // Si falla un proveedor, probar el siguiente
            continue;
          }
        }
      }

      return existing;
    },

    /**
     * Refresca todos los metadatos cuyo caché ha expirado según el TTL configurado.
     * Devuelve cuántos se refrescaron y cuántos fallaron.
     */
    async refreshExpiredMetadata(): Promise<{ refreshed: number; failed: number }> {
      const ttlHours = metadataConfig.cacheTtlHours ?? 24;
      const expired = metadataRepo.listExpired(ttlHours);

      let refreshed = 0;
      let failed = 0;

      for (const existing of expired) {
        if (!metadataService.hasProviderConfigured()) {
          failed++;
          continue;
        }

        let updated = false;
        for (const provider of ['tmdb', 'tvdb'] as const) {
          if (!metadataService.isProviderConfigured(provider)) continue;

          try {
            const mediaType = existing.provider === 'tvdb' ? 'tv' : 'movie';
            const details = await metadataService.getDetails(
              existing.externalId,
              provider,
              mediaType,
            );
            metadataRepo.set({
              mediaId: existing.mediaId,
              provider,
              externalId: details.externalId,
              title: details.title,
              overview: details.overview,
              posterPath: details.posterPath,
              backdropPath: details.backdropPath,
              voteAverage: details.voteAverage,
              releaseDate: details.releaseDate,
              originalLanguage: details.originalLanguage,
              localPosterPath: details.localPosterPath ?? null,
              updatedAt: new Date().toISOString(),
            });
            refreshed++;
            updated = true;
            break;
          } catch {
            // Si falla un proveedor, probar el siguiente
            continue;
          }
        }

        if (!updated) {
          failed++;
        }
      }

      return { refreshed, failed };
    },

    /** Devuelve la cantidad de metadatos expirados según el TTL configurado. */
    getExpiredMetadataCount(): number {
      const ttlHours = metadataConfig.cacheTtlHours ?? 24;
      return metadataRepo.listExpired(ttlHours).length;
    },

    /** Devuelve true si hay algún proveedor de metadatos configurado. */
    hasMetadataProviderConfigured(): boolean {
      return metadataService.hasProviderConfigured();
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
