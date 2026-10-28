/**
 * Codificador crudo del Protocolo Gráfico de Kitty (Kitty Graphics Protocol, SGP).
 *
 * Lee una imagen local, la convierte a Base64 y la fragmenta en bloques de
 * 4096 bytes (requerido por el protocolo). Genera la secuencia de escape exacta:
 *
 *   \x1b_Ga=T,f=100,t=f,s=<ancho_px>,v=<alto_px>,c=<columnas>,r=<filas>,i=<ID>,z=1;<base64>\x1b\\
 *
 * Esta utilidad es pura (sin efectos secundarios fuera de lectura de fichero)
 * y no depende de `terminal-image`, `chafa` ni de ningún subproceso externo.
 * Proporciona control total sobre el buffer, Z-index y ciclo de vida de la
 * imagen dentro de una TUI reactiva (Ink).
 *
 * Referencia: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import { createReadStream } from 'node:fs';

/** Tamaño de cada fragmento Base64 en bytes (requerido por el protocolo Kitty). */
const CHUNK_SIZE = 4096;

/** Parámetros de entrada para codificar una imagen al protocolo Kitty. */
export type KittyEncodeOptions = {
  /** Ruta local al fichero de imagen. */
  imagePath: string;
  /** Ancho del área de renderizado en píxeles. */
  widthPx: number;
  /** Alto del área de renderizado en píxeles. */
  heightPx: number;
  /** Número de columnas (caracteres) que ocupa el póster en la terminal. */
  columns: number;
  /** Número de filas (caracteres) que ocupa el póster en la terminal. */
  rows: number;
  /** Identificador único de la imagen (para borrado selectivo). */
  imageId: number;
};

/** Resultado del codificado: una lista de fragmentos de secuencia de escape. */
export type KittyFrame = {
  /** Secuencia completa de escape Kitty para este fragmento. */
  sequence: string;
  /** Indica si es el último fragmento (m=1). */
  isLast: boolean;
};

/**
 * Codifica un fichero de imagen local en una o más secuencias de escape del
 * Protocolo Gráfico de Kitty.
 *
 * El protocolo requiere que los datos Base64 se dividan en bloques de como
 * máximo 4096 bytes. Cada bloque lleva su propio encabezado de parámetros
 * (t=f para todos excepto el último, t=T para el último).
 *
 * @param options - Parámetros de codificación (ruta, dimensiones, ID).
 * @returns Array de secuencias de escape listas para escribirse a stdout.
 * @throws Error si el fichero no existe o no se puede leer.
 */
export async function encodeKittyGraphic(options: KittyEncodeOptions): Promise<KittyFrame[]> {
  const { imagePath, widthPx, heightPx, columns, rows, imageId } = options;

  // Leer el fichero como Buffer.
  const buffer = await readFileBuffer(imagePath);

  // Codificar a Base64 (estándar RFC 4648, sin saltos de línea).
  const base64 = buffer.toString('base64');

  // Dividir en fragmentos de como máximo CHUNK_SIZE bytes del Base64.
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + CHUNK_SIZE));
  }

  const frames: KittyFrame[] = [];
  const lastIndex = chunks.length - 1;

  chunks.forEach((chunk, index) => {
    const isLast = index === lastIndex;
    // t=T (Transmit) en el último fragmento, t=f (fragment) en los anteriores.
    const transmission = isLast ? 'T' : 'f';
    // m=1 indica que este es el mensaje final (último fragmento).
    const message = isLast ? '1' : '0';

    // Construir la secuencia de escape Kitty.
    // Formato: ESC _ G a=T,<params> ;<data> ESC \
    const params = `a=${transmission},f=100,t=f,s=${widthPx},v=${heightPx},c=${columns},r=${rows},i=${imageId},z=1,m=${message}`;
    const sequence = `\x1b_G${params};${chunk}\x1b\\`;

    frames.push({ sequence, isLast });
  });

  return frames;
}

/**
 * Genera la secuencia de borrado de Kitty para un ID de imagen específico.
 *
 * Formato: ESC _ G a=d,d=i,i=<imageId> ESC \
 *
 * Esto elimina la imagen gráfica asociada al ID, evitando artefactos
 * flotantes al cambiar de póster o desmontar el componente.
 *
 * @param imageId - Identificador único de la imagen a borrar.
 * @returns Secuencia de escape de borrado Kitty.
 */
export function deleteKittyImage(imageId: number): string {
  return `\x1b_Ga=d,d=i,i=${imageId}\x1b\\`;
}

/**
 * Genera la secuencia de borrado de todas las imágenes gráficas Kitty.
 *
 * Formato: ESC _ G a=d ESC \
 *
 * @returns Secuencia de escape de borrado de todas las imágenes.
 */
export function deleteAllKittyImages(): string {
  return `\x1b_Ga=d;\x1b\\`;
}

/** Lee un fichero completo y lo devuelve como Buffer. */
function readFileBuffer(imagePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(imagePath);

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', reject);
  });
}
