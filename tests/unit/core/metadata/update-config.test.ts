import { describe, expect, it, vi } from 'vitest';

import { MetadataService } from '../../../../src/core/metadata/service.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMockCalls(): unknown[][] {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

describe('MetadataService.updateConfig (proveedores públicos)', () => {
  it('updateConfig es un no-op: los proveedores públicos no necesitan claves API', () => {
    const service = new MetadataService({ logger });

    expect(service.isProviderConfigured('tvmaze')).toBe(true);
    expect(service.isProviderConfigured('default')).toBe(true);

    service.updateConfig({});
    expect(service.isProviderConfigured('tvmaze')).toBe(true);
  });

  it('searchTvMaze funciona sin configuración previa', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse({
        id: 123,
        name: 'Severance',
        type: 'Scripted',
        language: 'English',
        genres: ['Drama'],
        status: 'Ended',
        runtime: 60,
        premiered: '2022-02-18',
        officialSite: null,
        schedule: { time: '21:00', days: ['Friday'] },
        rating: { average: 8.5 },
        weight: 90,
        network: null,
        webChannel: null,
        externals: { tvrage: null, thetvdb: null, imdb: null },
        image: { medium: null, original: null },
        summary: null,
        updated: 1234567890,
        _links: { self: { href: 'https://api.tvmaze.com/shows/123' } },
      }),
    );

    const service = new MetadataService({ logger });
    const results = await service.searchTvMaze('Severance');

    expect(fetchMockCalls()).toHaveLength(1);
    expect(results.length).toBe(1);
    expect(results[0]!.provider).toBe('tvmaze');
    expect(results[0]!.title).toBe('Severance');
  });

  it('search devuelve resultado local por defecto cuando no hay resultados', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 }));

    const service = new MetadataService({ logger });
    const results = await service.search('NoExisteXyz');

    expect(fetchMockCalls()).toHaveLength(1);
    expect(results.length).toBe(1);
    expect(results[0]!.provider).toBe('default');
    expect(results[0]!.title).toBe('NoExisteXyz');
  });
});
