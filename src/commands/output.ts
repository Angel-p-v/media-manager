import pc from 'picocolors';

import type { MediaType } from '../core/config/schema.js';
import type { MediaFileRow, MediaRow } from '../core/db/types.js';

/** Representación estable de un título en la salida `--json`. */
export type MediaJson = {
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  folderPath: string;
};

/** Representación estable de un fichero en la salida `--json`. */
export type MediaFileJson = {
  id: number;
  season: number | null;
  episode: number | null;
  filePath: string;
  sizeBytes: number | null;
};

const TYPE_LABEL: Record<MediaType, string> = {
  series: 'serie',
  anime: 'anime',
  movie: 'película',
};

/** Etiqueta legible del tipo de contenido. */
export function mediaTypeLabel(type: MediaType): string {
  return TYPE_LABEL[type];
}

/** Proyecta un título a la forma pública que consumen los scripts. */
export function toMediaJson(media: MediaRow): MediaJson {
  return {
    id: media.id,
    type: media.type,
    title: media.title,
    year: media.year,
    folderPath: media.folderPath,
  };
}

/** Proyecta un fichero a la forma pública que consumen los scripts. */
export function toMediaFileJson(file: MediaFileRow): MediaFileJson {
  return {
    id: file.id,
    season: file.season,
    episode: file.episode,
    filePath: file.filePath,
    sizeBytes: file.sizeBytes,
  };
}

/** Imprime títulos en una tabla compacta de terminal. */
export function printMediaList(rows: readonly MediaRow[]): void {
  for (const row of rows) {
    const id = pc.dim(String(row.id).padStart(4));
    const type = pc.cyan(TYPE_LABEL[row.type].padEnd(8));
    const year = row.year === null ? '' : pc.dim(` (${row.year})`);
    console.log(`${id}  ${type} ${pc.bold(row.title)}${year}`);
  }
}

/** Formatea la temporada y el episodio de un fichero para mostrarlos al usuario. */
export function formatEpisode(file: Pick<MediaFileRow, 'season' | 'episode'>): string {
  if (file.episode === null) return pc.dim('—');
  const episode = `E${String(file.episode).padStart(2, '0')}`;
  return file.season === null ? episode : `T${String(file.season).padStart(2, '0')}${episode}`;
}

/** Convierte bytes a una unidad legible sin depender de librerías externas. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let unit = units[0];

  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}
