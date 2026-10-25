import { mkdirSync } from 'node:fs';
import { readdir, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Logger } from '../../shared/logger.js';

const DEFAULT_CACHE_DIR = join(homedir(), '.cache', 'media-manager', 'posters');

mkdirSync(DEFAULT_CACHE_DIR, { recursive: true });

/**
 * Descarga un póster desde una URL y lo guarda en el caché local.
 *
 * Devuelve la ruta local al archivo descargado, o null si la descarga falla.
 * Si el fichero ya existe en caché, se reutiliza sin volver a descargar.
 *
 * `cacheDir` permite inyectar un directorio alternativo (útil en tests).
 */
export async function cachePoster(
  posterUrl: string | null,
  mediaId: number,
  logger: Logger,
  cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<string | null> {
  if (!posterUrl) return null;

  const fileName = `${mediaId}-${posterUrl.split('/').pop() ?? 'poster'}`;
  const localPath = join(cacheDir, fileName);

  try {
    // Si ya existe en caché, no volver a descargar
    try {
      await access(localPath);
      logger.debug('poster.cache.hit', { mediaId, localPath });
      return localPath;
    } catch {
      // No existe, seguir con la descarga
    }

    const response = await fetch(posterUrl);
    if (!response.ok) {
      logger.warn('poster.download.failed', { mediaId, posterUrl, status: response.status });
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, buffer);

    logger.debug('poster.cache.stored', { mediaId, localPath, bytes: buffer.length });
    return localPath;
  } catch (error) {
    logger.warn('poster.cache.error', { mediaId, posterUrl, error: (error as Error).message });
    return null;
  }
}

/**
 * Devuelve la ruta de un póster previamente cacheado para un mediaId, si existe.
 *
 * Se usa como fallback cuando la descarga desde la API externa falla (red caída,
 * 404, etc.), permitiendo mostrar el último póster conocido en lugar de nada.
 *
 * `cacheDir` permite inyectar un directorio alternativo (útil en tests).
 */
export async function getCachedPoster(
  mediaId: number,
  cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<string | null> {
  try {
    const entries = await readdir(cacheDir);
    const prefix = `${mediaId}-`;
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const localPath = join(cacheDir, entry);
        try {
          await access(localPath);
          return localPath;
        } catch {
          // El fichero desapareció entre el listado y el access; seguir buscando
        }
      }
    }
  } catch {
    // El directorio de caché no existe aún; no hay nada que devolver
  }
  return null;
}
