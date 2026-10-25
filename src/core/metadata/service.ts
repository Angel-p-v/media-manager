import { cachePoster, getCachedPoster } from './posterCache.js';
import { rateLimiters } from './rateLimiter.js';
import { MetadataError, formatError } from '../../shared/errors.js';

import type { Logger } from '../../shared/logger.js';

/** Respuesta de búsqueda de TMDB. */
type TmdbSearchResponse = {
  results: TmdbSearchResult[];
};

/** Resultado de búsqueda de TMDB. */
type TmdbSearchResult = {
  id: number;
  title: string | null;
  name: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  release_date: string | null;
  first_air_date: string | null;
  original_language: string | null;
  media_type: 'movie' | 'tv' | 'person';
};

/** Detalles de TMDB para una película o serie. */
type TmdbDetails = {
  id: number;
  title: string | null;
  name: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  first_air_date: string | null;
  release_date: string | null;
  original_language: string | null;
};

/** Respuesta de búsqueda de TVDB. */
type TvdbSearchResponse = {
  results: TvdbSearchResult[];
};

/** Resultado de búsqueda de TVDB. */
type TvdbSearchResult = {
  id: number;
  name: string;
  overview: string | null;
  slug: string;
  first_aired: string | null;
  original_language: string | null;
  type: 'series' | 'movie' | 'person';
  backdrop_path: string | null;
  artwork: TvdbArtwork | null;
};

type TvdbArtwork = {
  '240'?: TvdbArtworkItem;
  '1071'?: TvdbArtworkItem;
};

type TvdbArtworkItem = {
  original: string;
};

/** Detalles de TVDB para una serie o película. */
type TvdbDetails = {
  id: number;
  name: string;
  overview: string | null;
  first_aired: string | null;
  original_language: string | null;
  type: 'series' | 'movie' | 'person';
  backdrop_path: string | null;
  artwork: TvdbArtwork | null;
};

/** Respuesta de búsqueda de OMDB. */
type OmdbSearchResponse = {
  Search?: OmdbSearchResult[];
  totalResults: string;
  Response: string;
  Error?: string;
};

/** Resultado de búsqueda de OMDB. */
type OmdbSearchResult = {
  Title: string;
  Year: string | null;
  imdbID: string;
  Type: string;
  Poster: string;
};

/** Detalles de OMDB para un título por IMDb ID. */
type OmdbDetails = {
  Title: string;
  Year: string | null;
  imdbID: string;
  Type: string;
  Plot: string | null;
  Poster: string;
  imdbRating: string | null;
  Released: string | null;
  Language: string | null;
  Response: string;
};

/** Configuración del servicio de metadatos. */
export type MetadataServiceConfig = {
  tmdbApiKey?: string;
  tvdbApiKey?: string;
  omdbApiKey?: string;
  logger: {
    debug(msg: string, bindings?: Record<string, unknown>): void;
    warn(msg: string, bindings?: Record<string, unknown>): void;
    error(msg: string, bindings?: Record<string, unknown>): void;
  };
};

/** Resultado de búsqueda de metadatos. */
export type MetadataSearchResult = {
  provider: 'tmdb' | 'tvdb' | 'omdb';
  externalId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  releaseDate: string | null;
  originalLanguage: string | null;
  /** Ruta local al póster descargado en caché, si existe. */
  localPosterPath: string | null;
};

/**
 * Adapta el logger de la configuración (que tiene un tipo limitado) al tipo
 * Logger completo que requiere cachePoster.
 */
type ConfigLogger = {
  debug(msg: string, bindings?: Record<string, unknown>): void;
  warn(msg: string, bindings?: Record<string, unknown>): void;
  error(msg: string, bindings?: Record<string, unknown>): void;
};

function adaptLogger(configLogger: ConfigLogger): Logger {
  return {
    level: 'debug',
    format: 'text',
    error: (event: string, fields?: Record<string, unknown>) => configLogger.error(event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => configLogger.warn(event, fields),
    info: (event: string, fields?: Record<string, unknown>) => configLogger.debug(event, fields),
    debug: (event: string, fields?: Record<string, unknown>) => configLogger.debug(event, fields),
    child: () => adaptLogger(configLogger),
  };
}

/**
 * Servicio para obtener metadatos externos de TMDB y TVDB.
 *
 * Requiere claves API configuradas. Si no hay claves, las operaciones
 * fallan con un error informativo.
 */
export class MetadataService {
  private readonly config: MetadataServiceConfig;

  constructor(config: MetadataServiceConfig) {
    this.config = config;
  }

  /**
   * Busca títulos en TMDB por consulta de texto.
   * Devuelve resultados mapeados a un formato común.
   */
  async searchTmdb(query: string): Promise<MetadataSearchResult[]> {
    if (!this.config.tmdbApiKey) {
      throw new MetadataError(
        'TMDB API key no configurada. Añade metadata.tmdb_api_key a tu config.yaml.',
      );
    }

    await rateLimiters.tmdb.waitForSlot();

    const url = new URL('https://api.themoviedb.org/3/search/multi');
    url.searchParams.set('query', query);
    url.searchParams.set('api_key', this.config.tmdbApiKey);
    url.searchParams.set('language', 'es-ES');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new MetadataError(`TMDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as TmdbSearchResponse;

    return data.results
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => ({
        provider: 'tmdb' as const,
        externalId: r.id,
        title: r.title ?? r.name ?? '',
        overview: r.overview,
        posterPath: r.poster_path,
        backdropPath: r.backdrop_path,
        voteAverage: r.vote_average,
        releaseDate: r.release_date ?? r.first_air_date,
        originalLanguage: r.original_language,
        localPosterPath: null,
      }));
  }

  /**
   * Obtiene detalles de un título de TMDB por ID externo.
   */
  async getTmdbDetails(
    externalId: number,
    mediaType: 'movie' | 'tv' = 'movie',
  ): Promise<MetadataSearchResult> {
    if (!this.config.tmdbApiKey) {
      throw new MetadataError(
        'TMDB API key no configurada. Añade metadata.tmdb_api_key a tu config.yaml.',
      );
    }

    await rateLimiters.tmdb.waitForSlot();

    const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${externalId}`);
    url.searchParams.set('api_key', this.config.tmdbApiKey);
    url.searchParams.set('language', 'es-ES');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new MetadataError(`TMDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as TmdbDetails;

    let localPosterPath = await cachePoster(
      data.poster_path,
      data.id,
      adaptLogger(this.config.logger),
    );

    // Fallback: si la descarga falló, usar el póster previamente cacheado
    localPosterPath ??= await getCachedPoster(data.id);

    return {
      provider: 'tmdb',
      externalId: data.id,
      title: data.title ?? data.name ?? '',
      overview: data.overview,
      posterPath: data.poster_path,
      backdropPath: data.backdrop_path,
      voteAverage: data.vote_average,
      releaseDate: data.release_date ?? data.first_air_date,
      originalLanguage: data.original_language,
      localPosterPath,
    };
  }

  /**
   * Busca títulos en TVDB por consulta de texto.
   * Devuelve resultados mapeados a un formato común.
   */
  async searchTvdb(query: string): Promise<MetadataSearchResult[]> {
    if (!this.config.tvdbApiKey) {
      throw new MetadataError(
        'TVDB API key no configurada. Añade metadata.tvdb_api_key a tu config.yaml.',
      );
    }

    await rateLimiters.tvdb.waitForSlot();

    // TVDB v4 API requiere autenticación con Bearer token
    const url = new URL('https://api.thetvdb.com/v4/search');
    url.searchParams.set('query', query);
    url.searchParams.set('type', 'movie,series');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.tvdbApiKey}`,
      },
    });

    if (!response.ok) {
      throw new MetadataError(`TVDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as TvdbSearchResponse;

    return data.results.map((r) => {
      const posterPath = r.artwork?.['240']?.original ?? null;
      const backdropPath = r.artwork?.['1071']?.original ?? null;
      return {
        provider: 'tvdb' as const,
        externalId: r.id,
        title: r.name,
        overview: r.overview,
        posterPath,
        backdropPath,
        voteAverage: null, // TVDB no proporciona calificación promedio en búsqueda
        releaseDate: r.first_aired,
        originalLanguage: r.original_language,
        localPosterPath: null,
      };
    });
  }

  /**
   * Obtiene detalles de un título de TVDB por ID externo.
   */
  async getTvdbDetails(
    externalId: number,
    mediaType: 'movie' | 'tv' = 'tv',
  ): Promise<MetadataSearchResult> {
    if (!this.config.tvdbApiKey) {
      throw new MetadataError(
        'TVDB API key no configurada. Añade metadata.tvdb_api_key a tu config.yaml.',
      );
    }

    await rateLimiters.tvdb.waitForSlot();

    const url = new URL(`https://api.thetvdb.com/v4/${mediaType}/${externalId}`);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.tvdbApiKey}`,
      },
    });

    if (!response.ok) {
      throw new MetadataError(`TVDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as TvdbDetails;
    const posterPath = data.artwork?.['240']?.original ?? null;
    const backdropPath = data.artwork?.['1071']?.original ?? null;

    let localPosterPath = await cachePoster(posterPath, data.id, adaptLogger(this.config.logger));

    // Fallback: si la descarga falló, usar el póster previamente cacheado
    localPosterPath ??= await getCachedPoster(data.id);

    return {
      provider: 'tvdb',
      externalId: data.id,
      title: data.name,
      overview: data.overview,
      posterPath,
      backdropPath,
      voteAverage: null,
      releaseDate: data.first_aired,
      originalLanguage: data.original_language,
      localPosterPath,
    };
  }

  /**
   * Convierte un IMDb ID de OMDB (p. ej. "tt1375666") a un número para usar como
   * externalId. OMDB identifica los títulos con imdbID alfanumérico; se extraen
   * los dígitos para encajar en el tipo `externalId: number`. Los IDs con ceros
   * iniciales (p. ej. "tt0123456") pierden esos ceros al reconstruirse, lo que
   * puede impedir encontrar el título en `getOmdbDetails`.
   */
  /**
   * Convierte un IMDb ID de OMDB (p. ej. "tt1375666") a un número para usar como
   * externalId. OMDB identifica los títulos con imdbID alfanumérico; se extraen
   * los dígitos para encajar en el tipo `externalId: number`. Los IDs con ceros
   * iniciales (p. ej. "tt0123456") pierden esos ceros al reconstruirse, lo que
   * puede impedir encontrar el título en `getOmdbDetails`.
   */
  private imdbIdToNumber(imdbId: string): number {
    return Number(imdbId.replace(/^tt/, ''));
  }

  /**
   * Reconstruye un IMDb ID a partir de un externalId numérico (p. ej. 1375666 → "tt1375666").
   */
  private numberToImdbId(externalId: number): string {
    return `tt${externalId}`;
  }

  /**
   * Busca títulos en OMDB por consulta de texto.
   * Devuelve resultados mapeados a un formato común.
   */
  async searchOmdb(query: string): Promise<MetadataSearchResult[]> {
    if (!this.config.omdbApiKey) {
      throw new MetadataError(
        'OMDB API key no configurada. Añade metadata.omdb_api_key a tu config.yaml.',
      );
    }

    await rateLimiters.omdb.waitForSlot();

    const url = new URL('http://www.omdbapi.com/');
    url.searchParams.set('apikey', this.config.omdbApiKey);
    url.searchParams.set('s', query);
    url.searchParams.set('type', 'movie');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new MetadataError(`OMDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as OmdbSearchResponse;

    if (data.Response !== 'True' || !data.Search) {
      return [];
    }

    return data.Search.map((r) => ({
      provider: 'omdb' as const,
      externalId: this.imdbIdToNumber(r.imdbID),
      title: r.Title,
      overview: null, // OMDB no proporciona sinopsis en búsqueda
      posterPath: r.Poster === 'N/A' ? null : r.Poster,
      backdropPath: null, // OMDB no proporciona backdrop en búsqueda
      voteAverage: null,
      releaseDate: r.Year ?? null,
      originalLanguage: null, // OMDB no proporciona idioma en búsqueda
      localPosterPath: null,
    }));
  }

  /**
   * Obtiene detalles de un título de OMDB por IMDb ID (externalId).
   */
  async getOmdbDetails(
    externalId: number,
    _mediaType: 'movie' | 'tv' = 'movie',
  ): Promise<MetadataSearchResult> {
    if (!this.config.omdbApiKey) {
      throw new MetadataError(
        'OMDB API key no configurada. Añade metadata.omdb_api_key a tu config.yaml.',
      );
    }

    await rateLimiters.omdb.waitForSlot();

    const url = new URL('http://www.omdbapi.com/');
    url.searchParams.set('apikey', this.config.omdbApiKey);
    url.searchParams.set('i', this.numberToImdbId(externalId));
    url.searchParams.set('plot', 'short');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new MetadataError(`OMDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as OmdbDetails;

    if (data.Response !== 'True') {
      throw new MetadataError(`OMDB no encontró el título ${externalId}`);
    }

    const localPosterPath = await cachePoster(
      data.Poster === 'N/A' ? null : data.Poster,
      externalId,
      adaptLogger(this.config.logger),
    );

    return {
      provider: 'omdb',
      externalId,
      title: data.Title,
      overview: data.Plot,
      posterPath: data.Poster === 'N/A' ? null : data.Poster,
      backdropPath: null,
      voteAverage: data.imdbRating ? Number(data.imdbRating) : null,
      releaseDate: data.Released,
      originalLanguage: data.Language,
      localPosterPath,
    };
  }

  /**
   * Busca en todos los proveedores configurados (TMDB primero, luego TVDB y OMDB como fallback).
   */
  async search(query: string): Promise<MetadataSearchResult[]> {
    const results: MetadataSearchResult[] = [];

    if (this.config.tmdbApiKey) {
      try {
        const tmdbResults = await this.searchTmdb(query);
        results.push(...tmdbResults);
      } catch (error) {
        this.config.logger.warn('TMDB búsqueda falló', {
          error: formatError(error),
        });
      }
    }

    if (this.config.tvdbApiKey) {
      try {
        const tvdbResults = await this.searchTvdb(query);
        results.push(...tvdbResults);
      } catch (error) {
        this.config.logger.warn('TVDB búsqueda falló', {
          error: formatError(error),
        });
      }
    }

    if (this.config.omdbApiKey) {
      try {
        const omdbResults = await this.searchOmdb(query);
        results.push(...omdbResults);
      } catch (error) {
        this.config.logger.warn('OMDB búsqueda falló', {
          error: formatError(error),
        });
      }
    }

    return results;
  }

  /**
   * Obtiene detalles de un título en todos los proveedores configurados.
   * Devuelve el primer resultado exitoso.
   */
  async getDetails(
    externalId: number,
    provider: 'tmdb' | 'tvdb' | 'omdb',
    mediaType: 'movie' | 'tv' = 'movie',
  ): Promise<MetadataSearchResult> {
    if (provider === 'tmdb') {
      return this.getTmdbDetails(externalId, mediaType);
    }
    if (provider === 'tvdb') {
      return this.getTvdbDetails(externalId, mediaType === 'tv' ? 'tv' : 'movie');
    }
    return this.getOmdbDetails(externalId, mediaType);
  }

  /**
   * Verifica si hay al menos un proveedor configurado.
   */
  hasProviderConfigured(): boolean {
    return !!this.config.tmdbApiKey || !!this.config.tvdbApiKey || !!this.config.omdbApiKey;
  }

  /**
   * Verifica si un proveedor específico está configurado.
   */
  isProviderConfigured(provider: 'tmdb' | 'tvdb' | 'omdb'): boolean {
    if (provider === 'tmdb') return !!this.config.tmdbApiKey;
    if (provider === 'tvdb') return !!this.config.tvdbApiKey;
    return !!this.config.omdbApiKey;
  }
}
