import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetadataService } from '../../../../src/core/metadata/service.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const omdbConfig = {
  logger,
  omdbApiKey: 'test-omdb-key',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockOmdbResponse(body: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function calledUrl(index = 0): string {
  return String(fetchMock.mock.calls[index]![0]);
}

describe('MetadataService (OMDB)', () => {
  it('hasProviderConfigured es true solo con omdbApiKey', () => {
    const service = new MetadataService(omdbConfig);

    expect(service.hasProviderConfigured()).toBe(true);
  });

  it('isProviderConfigured devuelve true para omdb con clave', () => {
    const service = new MetadataService(omdbConfig);

    expect(service.isProviderConfigured('omdb')).toBe(true);
    expect(service.isProviderConfigured('tmdb')).toBe(false);
    expect(service.isProviderConfigured('tvdb')).toBe(false);
  });

  it('searchOmdb mapea resultados de OMDB', async () => {
    mockOmdbResponse({
      Response: 'True',
      Search: [
        {
          Title: 'Severance',
          Year: '2022',
          imdbID: 'tt1375666',
          Type: 'series',
          Poster: 'https://example.com/poster.jpg',
        },
      ],
      totalResults: '1',
    });

    const service = new MetadataService(omdbConfig);
    const results = await service.searchOmdb('Severance');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl()).toContain('s=Severance');
    expect(calledUrl()).toContain('apikey=test-omdb-key');
    expect(results.length).toBe(1);
    expect(results[0]!.provider).toBe('omdb');
    expect(results[0]!.externalId).toBe(1375666);
    expect(results[0]!.title).toBe('Severance');
    expect(results[0]!.releaseDate).toBe('2022');
    expect(results[0]!.posterPath).toBe('https://example.com/poster.jpg');
  });

  it('searchOmdb devuelve array vacío cuando no hay resultados', async () => {
    mockOmdbResponse({ Response: 'False', Error: 'Movie not found!', totalResults: '0' });

    const service = new MetadataService(omdbConfig);
    const results = await service.searchOmdb('NoExiste');

    expect(results).toEqual([]);
  });

  it('searchOmdb lanza error si falta omdbApiKey', async () => {
    const service = new MetadataService({ logger });

    await expect(service.searchOmdb('Severance')).rejects.toThrow('OMDB API key no configurada');
  });

  it('getOmdbDetails mapea detalles de OMDB', async () => {
    mockOmdbResponse({
      Response: 'True',
      Title: 'Severance',
      Year: '2022',
      imdbID: 'tt1375666',
      Type: 'series',
      Plot: 'Una oficina donde...',
      Poster: 'https://example.com/poster.jpg',
      imdbRating: '8.7',
      Released: '18 Feb 2022',
      Language: 'English',
    });

    const service = new MetadataService(omdbConfig);
    const details = await service.getOmdbDetails(1375666);

    expect(calledUrl()).toContain('i=tt1375666');
    expect(details.provider).toBe('omdb');
    expect(details.externalId).toBe(1375666);
    expect(details.title).toBe('Severance');
    expect(details.overview).toBe('Una oficina donde...');
    expect(details.voteAverage).toBe(8.7);
    expect(details.releaseDate).toBe('18 Feb 2022');
    expect(details.originalLanguage).toBe('English');
    expect(details.posterPath).toBe('https://example.com/poster.jpg');
  });

  it('getOmdbDetails trata Poster N/A como null', async () => {
    mockOmdbResponse({
      Response: 'True',
      Title: 'Sin póster',
      Year: '2022',
      imdbID: 'tt9999999',
      Type: 'movie',
      Plot: 'Sin póster disponible.',
      Poster: 'N/A',
      imdbRating: null,
      Released: null,
      Language: null,
    });

    const service = new MetadataService(omdbConfig);
    const details = await service.getOmdbDetails(9999999);

    expect(details.posterPath).toBeNull();
    expect(details.voteAverage).toBeNull();
    expect(details.releaseDate).toBeNull();
    expect(details.originalLanguage).toBeNull();
  });

  it('getOmdbDetails lanza error cuando OMDB no encuentra el título', async () => {
    mockOmdbResponse({ Response: 'False', Error: 'Movie not found!' });

    const service = new MetadataService(omdbConfig);

    await expect(service.getOmdbDetails(9999999)).rejects.toThrow(
      'OMDB no encontró el título 9999999',
    );
  });

  it('search incluye OMDB como fallback cuando solo omdb está configurado', async () => {
    // OMDB se intenta antes que AniList en el código, así que su mock va primero
    mockOmdbResponse({
      Response: 'True',
      Search: [
        {
          Title: 'Severance',
          Year: '2022',
          imdbID: 'tt1375666',
          Type: 'series',
          Poster: 'https://example.com/poster.jpg',
        },
      ],
      totalResults: '1',
    });
    // AniList se intenta después (sin API key), devuelve vacío
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { Media: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const service = new MetadataService(omdbConfig);
    const results = await service.search('Severance');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.length).toBe(1);
    expect(results[0]!.provider).toBe('omdb');
  });

  it('getDetails con provider omdb llama a getOmdbDetails', async () => {
    mockOmdbResponse({
      Response: 'True',
      Title: 'Severance',
      Year: '2022',
      imdbID: 'tt1375666',
      Type: 'series',
      Plot: 'Sinopsis.',
      Poster: 'https://example.com/p.jpg',
      imdbRating: '8.7',
      Released: '18 Feb 2022',
      Language: 'English',
    });

    const service = new MetadataService(omdbConfig);
    const details = await service.getDetails(1375666, 'omdb', 'tv');

    expect(details.provider).toBe('omdb');
    expect(details.title).toBe('Severance');
  });
});
