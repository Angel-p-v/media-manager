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

/** Configuración del servicio de metadatos. */
export type MetadataServiceConfig = {
  tmdbApiKey?: string;
  tvdbApiKey?: string;
  logger: {
    debug(msg: string, bindings?: Record<string, unknown>): void;
    warn(msg: string, bindings?: Record<string, unknown>): void;
    error(msg: string, bindings?: Record<string, unknown>): void;
  };
};

/** Resultado de búsqueda de metadatos. */
export type MetadataSearchResult = {
  provider: 'tmdb' | 'tvdb';
  externalId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  releaseDate: string | null;
  originalLanguage: string | null;
};

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
      throw new Error('TMDB API key no configurada. Añade metadata.tmdb_api_key a tu config.yaml.');
    }

    const url = new URL('https://api.themoviedb.org/3/search/multi');
    url.searchParams.set('query', query);
    url.searchParams.set('api_key', this.config.tmdbApiKey);
    url.searchParams.set('language', 'es-ES');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`TMDB API respondió ${response.status}`);
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
      throw new Error('TMDB API key no configurada. Añade metadata.tmdb_api_key a tu config.yaml.');
    }

    const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${externalId}`);
    url.searchParams.set('api_key', this.config.tmdbApiKey);
    url.searchParams.set('language', 'es-ES');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`TMDB API respondió ${response.status}`);
    }

    const data = (await response.json()) as TmdbDetails;

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
    };
  }

  /**
   * Verifica si hay al menos un proveedor configurado.
   */
  hasProviderConfigured(): boolean {
    return !!this.config.tmdbApiKey || !!this.config.tvdbApiKey;
  }
}
