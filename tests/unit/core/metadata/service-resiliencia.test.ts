import { describe, expect, it, vi } from 'vitest';

import { MetadataService } from '../../../../src/core/metadata/service.js';
import { MetadataError } from '../../../../src/shared/errors.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const tvmazeConfig = { logger };
const noKeyConfig = { logger };

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
  describe('searchTvMaze', () => {
    it('lanza MetadataError cuando TVMaze responde 429', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(errorResponse(429));
      const service = new MetadataService(tvmazeConfig);
      await expect(service.searchTvMaze('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('lanza MetadataError cuando TVMaze responde 500', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(errorResponse(500));
      const service = new MetadataService(tvmazeConfig);
      await expect(service.searchTvMaze('sever')).rejects.toBeInstanceOf(MetadataError);
    });

    it('propaga error de red', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'));
      const service = new MetadataService(tvmazeConfig);
      await expect(service.searchTvMaze('sever')).rejects.toThrow('fetch failed');
    });

    it('devuelve resultados mapeados con respuesta exitosa', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        okResponse(200, {
          id: 123,
          name: 'Severance',
          type: 'Scripted',
          language: 'English',
          genres: ['Drama', 'Thriller'],
          status: 'Ended',
          runtime: 60,
          premiered: '2022-02-18',
          officialSite: null,
          schedule: { time: '21:00', days: ['Friday'] },
          rating: { average: 8.5 },
          weight: 90,
          network: { name: 'Apple TV+', country: { name: 'United States' } },
          webChannel: null,
          externals: { tvrage: null, thetvdb: null, imdb: 'tt1375666' },
          image: { medium: '/poster.jpg', original: '/poster.jpg' },
          summary: '<p>Una serie</p>',
          updated: 1234567890,
          _links: { self: { href: 'https://api.tvmaze.com/shows/123' } },
        }),
      );
      const service = new MetadataService(tvmazeConfig);
      const results = await service.searchTvMaze('sever');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        provider: 'tvmaze',
        externalId: 123,
        title: 'Severance',
        overview: 'Una serie',
        voteAverage: 8.5,
      });
    });
  });

  describe('getTvMazeDetails', () => {
    it('usa póster cacheado cuando cachePoster falla', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          okResponse(200, {
            id: 456,
            name: 'Película',
            type: 'Scripted',
            language: 'Spanish',
            genres: ['Drama'],
            status: 'Ended',
            runtime: 60,
            premiered: '2023-01-01',
            officialSite: null,
            schedule: { time: null, days: [] },
            rating: { average: 7.0 },
            weight: 0,
            network: null,
            webChannel: null,
            externals: { tvrage: null, thetvdb: null, imdb: null },
            image: { medium: null, original: '/poster.jpg' },
            summary: '<p>Sinopsis</p>',
            updated: 1234567890,
            _links: { self: { href: 'https://api.tvmaze.com/shows/456' } },
          }),
        )
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      const service = new MetadataService(tvmazeConfig);
      const result = await service.getTvMazeDetails(456, 'tv');

      expect(result).toMatchObject({
        provider: 'tvmaze',
        externalId: 456,
        title: 'Película',
      });
    });

    it('descarga y guarda el póster de TVMaze', async () => {
      // Buffer JPEG válido: magic bytes 0xff 0xd8 0xff + relleno para superar los 100 bytes mínimos
      const posterBuffer = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.alloc(100, 0x00),
      ]);

      globalThis.fetch = vi.fn((input: string | URL | Request) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('api.tvmaze.com/shows/')) {
          return Promise.resolve(
            okResponse(200, {
              id: 789,
              name: 'Película 2',
              type: 'Scripted',
              language: 'English',
              genres: ['Drama'],
              status: 'Ended',
              runtime: 60,
              premiered: '2024-01-01',
              officialSite: null,
              schedule: { time: null, days: [] },
              rating: { average: 8.0 },
              weight: 0,
              network: null,
              webChannel: null,
              externals: { tvrage: null, thetvdb: null, imdb: null },
              image: { medium: '/poster.jpg', original: '/nuevo-poster.jpg' },
              summary: '<p>Sinopsis 2</p>',
              updated: 1234567890,
              _links: { self: { href: 'https://api.tvmaze.com/shows/789' } },
            }),
          );
        }
        // Descarga del póster: respuesta con buffer de imagen
        return Promise.resolve(
          new Response(posterBuffer, {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          }),
        );
      });

      const service = new MetadataService(tvmazeConfig);
      const result = await service.getTvMazeDetails(789, 'tv');

      expect(result.externalId).toBe(789);
    });
  });

  describe('search con proveedores públicos', () => {
    it('search funciona sin API keys', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        okResponse(200, {
          id: 456,
          name: 'Naruto',
          type: 'TV',
          language: 'Japanese',
          genres: ['Action', 'Adventure'],
          status: 'Ended',
          runtime: 24,
          premiered: '2002-10-03',
          officialSite: null,
          schedule: { time: '1:25', days: ['Thursday'] },
          rating: { average: 8.2 },
          weight: 90,
          network: null,
          webChannel: null,
          externals: { tvrage: null, thetvdb: null, imdb: null },
          image: { medium: null, original: null },
          summary: '<p>Un ninja busca ser Hokage.</p>',
          updated: 1234567890,
          _links: { self: { href: 'https://api.tvmaze.com/shows/456' } },
        }),
      );

      const service = new MetadataService(noKeyConfig);
      const results = await service.search('Naruto');

      expect(results.length).toBe(1);
      expect(results[0]!.provider).toBe('tvmaze');
      expect(results[0]!.title).toBe('Naruto');
    });
  });
});
