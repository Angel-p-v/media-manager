import path from 'node:path';

import { parseEpisode } from './parsers/episode.js';
import { parseMovie } from './parsers/movie.js';
import { parseTitleAndYear } from './parsers/text.js';

import type { LibraryRoot, MediaType } from '../config/schema.js';

/** Un fichero de vídeo con los datos que necesita la base de datos. */
export type ClassifiedFile = {
  type: MediaType;
  title: string;
  year: number | null;
  /** Carpeta del título. Para películas es la ruta del propio fichero. */
  folderPath: string;
  filePath: string;
  sizeBytes: number;
  mtimeMs: number;
  season: number | null;
  episode: number | null;
};

export type ClassifyInput = {
  root: LibraryRoot;
  filePath: string;
  sizeBytes: number;
  mtimeMs: number;
};

/**
 * Asigna un fichero escaneado a un título de la biblioteca.
 *
 * - Series y anime: la primera carpeta bajo la raíz es el título (`Show (2022)`);
 *   el fichero debe contener un patrón de temporada/episodio.
 * - Películas: cada fichero es un título; su `folderPath` es la propia ruta para
 *   no fusionar varias películas que compartan carpeta.
 *
 * Devuelve `null` para casos ambiguos (fichero suelto en la raíz de series, nombre
 * sin episodio reconocible, ruta fuera de la raíz): nunca inventa datos.
 */
export function classifyFile(input: ClassifyInput): ClassifiedFile | null {
  const relative = path.relative(input.root.path, input.filePath);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  if (input.root.type === 'movie') {
    const movie = parseMovie(input.filePath);
    if (!movie) return null;
    return {
      type: 'movie',
      title: movie.title,
      year: movie.year,
      folderPath: input.filePath,
      filePath: input.filePath,
      sizeBytes: input.sizeBytes,
      mtimeMs: input.mtimeMs,
      season: null,
      episode: null,
    };
  }

  const [folderName, ...rest] = relative.split(path.sep);
  // Un fichero suelto en la raíz no tiene carpeta de título: es ambiguo.
  if (!folderName || rest.length === 0) return null;

  const title = parseTitleAndYear(folderName);
  const episode = parseEpisode(input.filePath);
  if (!title || !episode) return null;

  return {
    type: input.root.type,
    title: title.title,
    year: title.year,
    folderPath: path.join(input.root.path, folderName),
    filePath: input.filePath,
    sizeBytes: input.sizeBytes,
    mtimeMs: input.mtimeMs,
    season: episode.season,
    episode: episode.episode,
  };
}
