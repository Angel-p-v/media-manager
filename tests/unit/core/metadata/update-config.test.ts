import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetadataService } from '../../../../src/core/metadata/service.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
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

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MetadataService.updateConfig', () => {
  it('actualiza tmdbApiKey en tiempo de ejecución y searchTmdb la usa', async () => {
    // Crear sin API key: searchTmdb debería fallar.
    const service = new MetadataService({ logger });
    await expect(service.searchTmdb('sever')).rejects.toBeInstanceOf(Error);

    // Actualizar con API key de TMDB en caliente.
    service.updateConfig({ tmdbApiKey: 'new-tmdb-key' });

    // Ahora searchTmdb debería intentar llamar a la API (fallará por fetch no mockeado
    // pero no por falta de clave).
    fetchMock.mockResolvedValueOnce(okResponse({ results: [] }));
    await expect(service.searchTmdb('sever')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('api_key=new-tmdb-key');
  });

  it('actualiza múltiples claves API a la vez', () => {
    const service = new MetadataService({ logger });
    expect(service.isProviderConfigured('tmdb')).toBe(false);
    expect(service.isProviderConfigured('tvdb')).toBe(false);

    service.updateConfig({
      tmdbApiKey: 'tmdb-key',
      tvdbApiKey: 'tvdb-key',
      omdbApiKey: 'omdb-key',
      anilistApiKey: 'anilist-key',
    });

    expect(service.isProviderConfigured('tmdb')).toBe(true);
    expect(service.isProviderConfigured('tvdb')).toBe(true);
    expect(service.isProviderConfigured('omdb')).toBe(true);
    expect(service.isProviderConfigured('anilist')).toBe(true);
  });

  it('updateConfig no borra claves previas al actualizar solo una', () => {
    const service = new MetadataService({
      logger,
      tmdbApiKey: 'tmdb-key',
    });
    expect(service.isProviderConfigured('tmdb')).toBe(true);

    service.updateConfig({ tvdbApiKey: 'tvdb-key' });

    expect(service.isProviderConfigured('tmdb')).toBe(true);
    expect(service.isProviderConfigured('tvdb')).toBe(true);
  });
});
