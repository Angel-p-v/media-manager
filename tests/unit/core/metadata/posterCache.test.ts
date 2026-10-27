import { mkdtemp, rm, writeFile, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cachePoster,
  clearPosterCache,
  getCachedPoster,
  sanitizeFileName,
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
    const result = await cachePoster(null, 'black-torch', 'tv', logger);
    expect(result).toBe(null);
  });

  it('sanitizeFileName elimina etiquetas, temporada/episodio y calidad', () => {
    expect(sanitizeFileName('Black Torch [Judas] S01E01 1080p', 'tv')).toBe('black-torch-tv');
    expect(sanitizeFileName('Spider-Man: Into the Spider-Verse', 'movie')).toBe(
      'spider-man-into-the-spider-verse-movie',
    );
    expect(sanitizeFileName('Cowboy Bebop', 'anime')).toBe('cowboy-bebop-anime');
    expect(sanitizeFileName('  ', 'tv')).toBe('tv');
  });

  it('getCachedPoster devuelve null cuando no hay caché', async () => {
    const result = await getCachedPoster('black-torch', 'tv', workDir);
    expect(result).toBe(null);
  });

  it('getCachedPoster devuelve la ruta del póster almacenado', async () => {
    await writeFile(path.join(workDir, 'black-torch-tv.jpg'), 'fake-image-data');

    const result = await getCachedPoster('black-torch', 'tv', workDir);

    expect(result).toBe(path.join(workDir, 'black-torch-tv.jpg'));
  });

  it('getCachedPoster ignora archivos de otros títulos', async () => {
    await writeFile(path.join(workDir, 'black-torch-tv.jpg'), 'fake-image-data');
    await writeFile(
      path.join(workDir, 'spider-man-into-the-spider-verse-movie.jpg'),
      'other-image',
    );

    const result = await getCachedPoster('black-torch', 'tv', workDir);

    expect(result).toBe(path.join(workDir, 'black-torch-tv.jpg'));
  });

  it('clearPosterCache devuelve 0 cuando no hay archivos', async () => {
    const result = await clearPosterCache(workDir, 30);

    expect(result.deleted).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('clearPosterCache borra archivos más viejos que maxAgeDays', async () => {
    const oldFile = path.join(workDir, 'black-torch-tv.jpg');
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
    const newFile = path.join(workDir, 'cowboy-bebop-anime.jpg');
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
    await writeFile(path.join(workDir, 'a-tv.jpg'), 'a');
    await writeFile(path.join(workDir, 'b-movie.jpg'), 'b');

    const result = await clearPosterCache(workDir, 0);

    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);
  });
});
