import { mkdirSync } from 'node:fs';
import { writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Logger } from '../../shared/logger.js';

const CACHE_DIR = join(homedir(), '.cache', 'media-manager', 'posters');

mkdirSync(CACHE_DIR, { recursive: true });

/**
 * Descarga un póster desde una URL y lo guarda en el caché local.
 *
 * Devuelve la ruta local al archivo descargado, o null si la descarga falla.
 * Si el fichero ya existe en caché, se reutiliza sin volver a descargar.
 */
export async function cachePoster(
  posterUrl: string | null,
  mediaId: number,
  logger: Logger,
): Promise<string | null> {
  if (!posterUrl) return null;

  const fileName = `${mediaId}-${posterUrl.split('/').pop() ?? 'poster'}`;
  const localPath = join(CACHE_DIR, fileName);

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
