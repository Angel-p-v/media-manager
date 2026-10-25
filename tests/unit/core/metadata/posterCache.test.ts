import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cachePoster, getCachedPoster } from '../../../../src/core/metadata/posterCache.js';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  level: 'debug' as const,
  format: 'text' as const,
  child: vi.fn(),
};

describe('posterCache', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'mm-poster-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('cachePoster devuelve null para posterUrl nulo', async () => {
    const result = await cachePoster(null, 1, logger);
    expect(result).toBe(null);
  });

  it('getCachedPoster devuelve null cuando no hay caché', async () => {
    const result = await getCachedPoster(999, workDir);
    expect(result).toBe(null);
  });

  it('getCachedPoster devuelve la ruta del póster cacheado', async () => {
    await writeFile(path.join(workDir, '42-poster.jpg'), 'fake-image-data');

    const result = await getCachedPoster(42, workDir);

    expect(result).toBe(path.join(workDir, '42-poster.jpg'));
  });

  it('getCachedPoster ignora archivos que no coinciden con el mediaId', async () => {
    await writeFile(path.join(workDir, '42-poster.jpg'), 'fake-image-data');
    await writeFile(path.join(workDir, '99-other.jpg'), 'other-image');

    const result = await getCachedPoster(42, workDir);

    expect(result).toBe(path.join(workDir, '42-poster.jpg'));
  });
});
