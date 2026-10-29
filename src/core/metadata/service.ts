import { rateLimiters } from './rateLimiter.js';
import { MetadataError, formatError } from '../../shared/errors.js';

import type { Logger } from '../../shared/logger.js';

/** Serie de TVMaze. */
type TvMazeShow = {
  id: number;
  name: string;
  type: string;
  language: string;
  genres: string[];
  status: string;
  runtime: number | null;
  premiered: string | null;
  officialSite: string | null;
  schedule: { time: string | null; days: string[] };
  rating: { average: number | null };
  weight: number;
  network: { name: string | null; country: { name: string | null } | null } | null;
  webChannel: { name: string | null; country: { name: string | null } | null } | null;
  externals: { tvrage: number | null; thetvdb: number | null; imdb: string | null };
  image: { medium: string | null; original: string | null } | null;
  summary: string | null;
  updated: number;
  _links: {
    self: { href: string };
    previousepisode?: { href: string };
    nextepisode?: { href: string };
    lastepisode?: { href: string };
  };
};

/** Resultado de búsqueda de metadatos. */
export type MetadataSearchResult = {
  provider: 'tvmaze' | 'default';
  externalId: number;
  title: string;
  overview: string | null;
  voteAverage: number | null;
  releaseDate: string | null;
  originalLanguage: string | null;
};

/** Configuración del servicio de metadatos (sin claves API - usa proveedores públicos). */
export type MetadataServiceConfig = {
  logger: {
    debug(msg: string, bindings?: Record<string, unknown>): void;
    warn(msg: string, bindings?: Record<string, unknown>): void;
    error(msg: string, bindings?: Record<string, unknown>): void;
  };
};

/**
 * Adapta el logger limitado de la configuración al tipo Logger completo usado
 * internamente para los eventos de depuración.
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
 * Servicio para obtener metadatos externos usando proveedores públicos
 * gratuitos sin necesidad de claves API.
 *
 * - TVMaze (https://www.tvmaze.com/api): Series y películas, sin API key.
 */
export class MetadataService {
  private readonly logger: Logger;

  constructor(config: MetadataServiceConfig) {
    this.logger = adaptLogger(config.logger);
  }

  /**
   * Actualiza la configuración en tiempo de ejecución (mantenido por compatibilidad).
   * Los proveedores públicos no requieren configuración, así que esto es un no-op.
   */
  updateConfig(_newConfig: Partial<MetadataServiceConfig>): void {
    // No hay claves API que actualizar: los proveedores son públicos y gratuitos.
  }

  /**
   * Busca títulos en TVMaze por consulta de texto.
   * Devuelve resultados mapeados a un formato común.
   * TVMaze es gratuito y no requiere API key.
   */
  async searchTvMaze(query: string): Promise<MetadataSearchResult[]> {
    await rateLimiters.tvmaze.waitForSlot();

    const url = new URL('https://api.tvmaze.com/singlesearch/shows');
    url.searchParams.set('q', query);
    url.searchParams.set('embed', 'episodes');

    this.logger.debug('[METADATA API] TVMaze búsqueda', {
      provider: 'tvmaze',
      query,
      url: url.toString(),
    });

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    // TVMaze devuelve 404 cuando no encuentra nada: devolver array vacío
    if (response.status === 404) {
      this.logger.debug('[METADATA API] TVMaze sin resultados', {
        provider: 'tvmaze',
        query,
        status: response.status,
      });
      return [];
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.debug('[METADATA API] TVMaze error HTTP', {
        provider: 'tvmaze',
        query,
        status: response.status,
        statusText: response.statusText,
        body: body.slice(0, 500),
      });
      throw new MetadataError(`TVMaze API respondió ${response.status}`);
    }

    const data = (await response.json()) as TvMazeShow;

    this.logger.debug('[METADATA API] TVMaze resultado', {
      provider: 'tvmaze',
      query,
      title: data.name,
      id: data.id,
      hasSummary: !!data.summary,
    });

    return [
      {
        provider: 'tvmaze' as const,
        externalId: data.id,
        title: data.name,
        overview: data.summary ? stripHtml(data.summary) : null,
        voteAverage: data.rating.average ?? null,
        releaseDate: data.premiered,
        originalLanguage: data.language,
      },
    ];
  }

  /**
   * Obtiene detalles de un título de TVMaze por ID externo.
   */
  async getTvMazeDetails(
    externalId: number,
    _mediaType: 'movie' | 'tv' = 'tv',
  ): Promise<MetadataSearchResult> {
    await rateLimiters.tvmaze.waitForSlot();

    const url = new URL(`https://api.tvmaze.com/shows/${externalId}`);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new MetadataError(`TVMaze API respondió ${response.status}`);
    }

    const data = (await response.json()) as TvMazeShow;

    return {
      provider: 'tvmaze',
      externalId: data.id,
      title: data.name,
      overview: data.summary ? stripHtml(data.summary) : null,
      voteAverage: data.rating.average ?? null,
      releaseDate: data.premiered,
      originalLanguage: data.language,
    };
  }

  /**
   * Busca en el proveedor público disponible (TVMaze, series y películas).
   * Siempre devuelve al menos un resultado local basado en la consulta.
   */
  async search(query: string): Promise<MetadataSearchResult[]> {
    // TVMaze (cubre series y películas).
    try {
      const tvmazeResults = await this.searchTvMaze(query);
      if (tvmazeResults.length > 0) {
        return tvmazeResults;
      }
    } catch (error) {
      this.logger.warn('TVMaze búsqueda falló', {
        error: formatError(error),
      });
    }

    // Si no hay resultados de ningún proveedor, devolver un resultado local
    // basado en la consulta para no dejar al usuario sin nada.
    return [
      {
        provider: 'default',
        externalId: 0,
        title: query.trim(),
        overview: null,
        voteAverage: null,
        releaseDate: null,
        originalLanguage: null,
      },
    ];
  }

  /**
   * Obtiene detalles de un título en el proveedor público disponible.
   * Devuelve el primer resultado exitoso.
   */
  async getDetails(
    externalId: number,
    provider: 'tvmaze' | 'default',
    mediaType: 'movie' | 'tv' = 'tv',
  ): Promise<MetadataSearchResult> {
    // externalId === 0 indica un resultado local (sin proveedor externo).
    if (externalId === 0) {
      return {
        provider,
        externalId: 0,
        title: '',
        overview: null,
        voteAverage: null,
        releaseDate: null,
        originalLanguage: null,
      };
    }

    if (provider === 'tvmaze') {
      return this.getTvMazeDetails(externalId, mediaType);
    }
    return {
      provider: 'default',
      externalId,
      title: '',
      overview: null,
      voteAverage: null,
      releaseDate: null,
      originalLanguage: null,
    };
  }

  /**
   * Verifica si hay al menos un proveedor disponible.
   * Los proveedores públicos siempre están disponibles.
   */
  hasProviderConfigured(): boolean {
    return true;
  }

  /**
   * Verifica si un proveedor específico está configurado.
   * TVMaze siempre está disponible (no requiere API key).
   */
  isProviderConfigured(_provider: 'tvmaze' | 'default'): boolean {
    return true;
  }
}

/**
 * Elimina etiquetas HTML de una cadena de texto.
 * TVMaze devuelve sinopsis con HTML (ej. <a>, <b>, <i>).
 */
function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
