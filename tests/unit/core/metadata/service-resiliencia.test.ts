import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { MetadataService } from '../../../../src/core/metadata/service.js';
import { MetadataError } from '../../../../src/shared/errors.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const tmdbConfig = {
  tmdbApiKey: 'test-tmdb-key',
  logger,
};
const tvdbConfig = {
  tvdbApiKey: 'test-tvdb-key',
  logger,
};
const omdbConfig = {
  omdbApiKey: 'test-omdb-key',
  logger,
};

const noKeyConfig = { logger };

function mockFetch(response: Response | null, error: Error | null = null): void {
  vi.stubGlobal(
    'fetch',
    error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(response),
  );
}

function okResponse(status = 200, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: 'error' }), { status });
}

describe('MetadataService resiliencia', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('searchTmdb', () => {
    it('lanza MetadataError sin API key TMDB', async () => {
      const service = new MetadataService(noKeyConfig);
      await expect(service.searchTmdb('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('lanza MetadataError cuando TMDB responde 429', async () => {
      mockFetch(errorResponse(429));
      const service = new MetadataService(tmdbConfig);
      await expect(service.searchTmdb('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('lanza MetadataError cuando TMDB responde 500', async () => {
      mockFetch(errorResponse(500));
      const service = new MetadataService(tmdbConfig);
      await expect(service.searchTmdb('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('propaga error de red (fetch rechazado)', async () => {
      mockFetch(null, new TypeError('fetch failed'));
      const service = new MetadataService(tmdbConfig);
      await expect(service.searchTmdb('sever')).rejects.toThrow('fetch failed');
    });

    it('devuelve resultados mapeados con respuesta exitosa', async () => {
      mockFetch(
        okResponse(200, {
          results: [
            {
              media_type: 'tv',
              id: 123,
              name: 'Severance',
              overview: 'Una serie',
              poster_path: '/poster.jpg',
              backdrop_path: '/backdrop.jpg',
              vote_average: 8.5,
              first_air_date: '2022-02-18',
              original_language: 'en',
            },
            { media_type: 'person', id: 999, name: 'Ignorado' },
          ],
        }),
      );
      const service = new MetadataService(tmdbConfig);
      const results = await service.searchTmdb('sever');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        provider: 'tmdb',
        externalId: 123,
        title: 'Severance',
        overview: 'Una serie',
        posterPath: '/poster.jpg',
        voteAverage: 8.5,
      });
    });
  });

  describe('getTmdbDetails con fallback de póster', () => {
    it('usa póster cacheado cuando cachePoster falla', async () => {
      // fetch de detalles: OK
      // fetch de póster (cachePoster): fallo de red
      let fetchCall = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          fetchCall += 1;
          if (fetchCall === 1) {
            // Detalles de TMDB
            return okResponse(200, {
              id: 456,
              title: 'Película',
              overview: 'Sinopsis',
              poster_path: '/poster.jpg',
              backdrop_path: null,
              vote_average: 7.0,
              release_date: '2023-01-01',
              original_language: 'es',
            });
          }
          // Póster: error de red
          throw new TypeError('fetch failed');
        }),
      );

      const service = new MetadataService(tmdbConfig);
      const result = await service.getTmdbDetails(456, 'movie');

      expect(result).toMatchObject({
        provider: 'tmdb',
        externalId: 456,
        title: 'Película',
        localPosterPath: null, // fallback: no hay caché previa
      });
    });
  });

  describe('searchTvdb', () => {
    it('lanza MetadataError cuando TVDB responde 429', async () => {
      mockFetch(errorResponse(429));
      const service = new MetadataService(tvdbConfig);
      await expect(service.searchTvdb('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('propaga error de red (fetch rechazado)', async () => {
      mockFetch(null, new TypeError('ECONNREFUSED'));
      const service = new MetadataService(tvdbConfig);
      await expect(service.searchTvdb('sever')).rejects.toThrow('ECONNREFUSED');
    });

    it('devuelve resultados mapeados con respuesta exitosa', async () => {
      mockFetch(
        okResponse(200, {
          results: [
            {
              id: 789,
              name: 'Serie TV',
              overview: 'Una serie de TV',
              first_aired: '2021-01-01',
              original_language: 'en',
              artwork: { '240': { original: '/poster.jpg' } },
            },
          ],
        }),
      );
      const service = new MetadataService(tvdbConfig);
      const results = await service.searchTvdb('serie');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        provider: 'tvdb',
        externalId: 789,
        title: 'Serie TV',
        posterPath: '/poster.jpg',
      });
    });
  });

  describe('searchOmdb', () => {
    it('lanza MetadataError sin API key OMDB', async () => {
      const service = new MetadataService(noKeyConfig);
      await expect(service.searchOmdb('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('propaga error de red (fetch rechazado)', async () => {
      mockFetch(null, new Error('network error'));
      const service = new MetadataService(omdbConfig);
      await expect(service.searchOmdb('sever')).rejects.toThrow('network error');
    });
  });
});
