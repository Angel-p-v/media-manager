import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetadataService } from '../../../../src/core/metadata/service.js';
import { MetadataError } from '../../../../src/shared/errors.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const anilistConfig = {
  anilistApiKey: 'test-anilist-key',
  logger,
};

const noKeyConfig = { logger };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockAnilistResponse(data: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function calledUrl(index = 0): string {
  return String(fetchMock.mock.calls[index]![0]);
}

function calledBody(index = 0): unknown {
  const call = fetchMock.mock.calls[index]!;
  if (!call[1] || typeof call[1] !== 'object') return null;
  const init = call[1] as { body?: string | null };
  const bodyRaw = init.body;
  if (!bodyRaw) return null;
  return JSON.parse(bodyRaw);
}

describe('MetadataService (AniList)', () => {
  it('isProviderConfigured devuelve true para anilist con clave', () => {
    const service = new MetadataService(anilistConfig);

    expect(service.isProviderConfigured('anilist')).toBe(true);
    expect(service.isProviderConfigured('tmdb')).toBe(false);
    expect(service.isProviderConfigured('tvdb')).toBe(false);
    expect(service.isProviderConfigured('omdb')).toBe(false);
  });

  it('isProviderConfigured devuelve true para anilist (sin clave requerida)', () => {
    const service = new MetadataService(noKeyConfig);

    expect(service.isProviderConfigured('anilist')).toBe(true);
  });

  it('hasProviderConfigured es true con anilistApiKey', () => {
    const service = new MetadataService(anilistConfig);

    expect(service.hasProviderConfigured()).toBe(true);
  });

  it('searchAnilist funciona sin anilistApiKey (consulta pública)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { Media: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const service = new MetadataService(noKeyConfig);

    const result = await service.searchAnilist('one piece');

    expect(result).toEqual([]);
  });

  it('searchAnilist lanza MetadataError cuando AniList responde 429', async () => {
    mockAnilistResponse({ errors: [{ message: 'rate limit' }] }, 429);
    const service = new MetadataService(anilistConfig);

    await expect(service.searchAnilist('one piece')).rejects.toBeInstanceOf(MetadataError);
  });

  it('searchAnilist mapea resultados de AniList', async () => {
    mockAnilistResponse({
      data: {
        Media: [
          {
            id: 123,
            title: {
              romaji: 'One Piece',
              english: 'One Piece',
              native: 'ワンピース',
              userPreferred: 'One Piece',
            },
            description: 'Un pirata busca el tesoro.',
            coverImage: { large: '/poster.jpg', medium: '/poster-med.jpg' },
            averageScore: 8.7,
            startDate: { year: 1999, month: 10, day: 20 },
            language: 'JA',
            genres: ['Action', 'Adventure'],
          },
        ],
      },
    });

    const service = new MetadataService(anilistConfig);
    const results = await service.searchAnilist('one piece');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl()).toBe('https://graphql.anilist.co');
    const body = calledBody(0);
    expect(body).toMatchObject({ query: expect.any(String), variables: { search: 'one piece' } });
    expect(results.length).toBe(1);
    expect(results[0]!.provider).toBe('anilist');
    expect(results[0]!.externalId).toBe(123);
    expect(results[0]!.title).toBe('One Piece');
    expect(results[0]!.overview).toBe('Un pirata busca el tesoro.');
    expect(results[0]!.voteAverage).toBe(8.7);
    expect(results[0]!.releaseDate).toBe('1999-10-20');
    expect(results[0]!.originalLanguage).toBe('JA');
    expect(results[0]!.posterPath).toBe('/poster.jpg');
  });

  it('searchAnilist devuelve array vacío cuando Media es null', async () => {
    mockAnilistResponse({ data: { Media: null } });

    const service = new MetadataService(anilistConfig);
    const results = await service.searchAnilist('inexistente');

    expect(results).toEqual([]);
  });

  it('getAnilistDetails mapea detalles de AniList', async () => {
    mockAnilistResponse({
      data: {
        Media: {
          id: 456,
          title: {
            romaji: 'Naruto',
            english: 'Naruto',
            native: 'NARUTO',
            userPreferred: 'Naruto',
          },
          description: 'Un ninja busca ser Hokage.',
          coverImage: { large: '/poster.jpg', medium: '/poster-med.jpg' },
          averageScore: 8.2,
          startDate: { year: 2002, month: 10, day: 3 },
          endDate: { year: 2007, month: 2, day: 8 },
          language: 'JA',
          format: 'TV',
          status: 'FINISHED',
          episodes: 220,
          duration: 23,
          genres: ['Action', 'Adventure'],
          synonyms: [],
        },
      },
    });

    const service = new MetadataService(anilistConfig);
    const details = await service.getAnilistDetails(456);

    expect(details.provider).toBe('anilist');
    expect(details.externalId).toBe(456);
    expect(details.title).toBe('Naruto');
    expect(details.overview).toBe('Un ninja busca ser Hokage.');
    expect(details.voteAverage).toBe(8.2);
    expect(details.releaseDate).toBe('2002-10-03');
    expect(details.originalLanguage).toBe('JA');
    expect(details.posterPath).toBe('/poster.jpg');
  });

  it('getAnilistDetails lanza MetadataError cuando no encuentra el anime', async () => {
    mockAnilistResponse({ data: { Media: null } });

    const service = new MetadataService(anilistConfig);

    await expect(service.getAnilistDetails(999999)).rejects.toBeInstanceOf(MetadataError);
  });

  it('getAnilidDetails funciona sin anilistApiKey (consulta pública)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { Media: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const service = new MetadataService(noKeyConfig);

    // Sin resultados de AniList, lanza MetadataError (no por falta de API key)
    await expect(service.getAnilistDetails(456)).rejects.toBeInstanceOf(MetadataError);
  });
});
