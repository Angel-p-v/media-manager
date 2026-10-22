import type { MediaType } from '../config/schema.js';

/** Fila de la tabla `media`. */
export type MediaRow = {
  id: number;
  type: MediaType;
  title: string;
  sortTitle: string;
  year: number | null;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
};

/** Fila de la tabla `media_files`. */
export type MediaFileRow = {
  id: number;
  mediaId: number;
  season: number | null;
  episode: number | null;
  title: string | null;
  filePath: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
  indexedAt: string;
};

/** Datos necesarios para crear o actualizar un título. */
export type MediaInput = {
  type: MediaType;
  title: string;
  year?: number | null;
  folderPath: string;
};

/** Datos necesarios para crear o actualizar un fichero. */
export type MediaFileInput = {
  mediaId: number;
  season?: number | null;
  episode?: number | null;
  title?: string | null;
  filePath: string;
  sizeBytes?: number | null;
  mtimeMs?: number | null;
};

/** Resumen de una ejecución de indexación. */
export type IndexRunRow = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  filesSeen: number;
  filesAdded: number;
  filesRemoved: number;
  status: 'running' | 'completed' | 'failed';
};
