import { mkdtemp, rm, writeFile, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cachePoster,
  clearPosterCache,
  getCachedPoster,
} from '../../../../src/core/metadata/posterCache.js';

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

  it('clearPosterCache devuelve 0 cuando no hay archivos', async () => {
    const result = await clearPosterCache(workDir, 30);

    expect(result.deleted).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('clearPosterCache borra archivos más viejos que maxAgeDays', async () => {
    const oldFile = path.join(workDir, '42-old.jpg');
    await writeFile(oldFile, 'old-image-data');

    // Establecer el mtime a 40 días atrás (más viejo que maxAgeDays=30)
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000;
    await utimes(oldFile, fortyDaysAgo / 1000, fortyDaysAgo / 1000);

    const result = await clearPosterCache(workDir, 30);

    expect(result.deleted).toBe(1);
    expect(result.errors).toEqual([]);

    // Verificar que el archivo ya no existe
    await expect(stat(oldFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('clearPosterCache no borra archivos más recientes que maxAgeDays', async () => {
    const newFile = path.join(workDir, '43-new.jpg');
    await writeFile(newFile, 'new-image-data');

    // mtime ahora (más reciente que maxAgeDays=30)
    const now = Date.now() / 1000;
    await utimes(newFile, now, now);

    const result = await clearPosterCache(workDir, 30);

    expect(result.deleted).toBe(0);
    expect(result.errors).toEqual([]);

    // Verificar que el archivo todavía existe
    await expect(stat(newFile)).resolves.toBeDefined();
  });

  it('clearPosterCache con maxAgeDays 0 borra todos los archivos', async () => {
    await writeFile(path.join(workDir, '44-a.jpg'), 'a');
    await writeFile(path.join(workDir, '45-b.jpg'), 'b');

    const result = await clearPosterCache(workDir, 0);

    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);
  });
});
