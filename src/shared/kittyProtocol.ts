/**
 * Codificador crudo del Protocolo Gráfico de Kitty (Kitty Graphics Protocol, SGP).
 *
 * Lee una imagen local, la convierte a Base64 y la fragmenta en bloques de
 * 4096 bytes (requerido por el protocolo). Genera la secuencia de escape exacta:
 *
 *   \x1b_Ga=T,f=<fmt>,t=d,s=<ancho_px>,v=<alto_px>,c=<columnas>,r=<filas>,i=<ID>,z=1,q=2,m=<1|0>;<base64>\x1b\\
 *
 * Esta utilidad es pura (sin efectos secundarios fuera de lectura de fichero)
 * y no depende de `terminal-image`, `chafa` ni de ningún subproceso externo.
 * Proporciona control total sobre el buffer, Z-index y ciclo de vida de la
 * imagen dentro de una TUI reactiva (Ink).
 *
 * Nunca lanza excepciones: si la imagen no se puede leer o codificar, retorna
 * un array vacío para que el llamante siga funcionando sin póster.
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
  /** Indica si es el último fragmento (m=0). */
  isLast: boolean;
};

/**
 * Detecta el formato de imagen a partir de los magic bytes del fichero.
 *
 * @param buffer - Primeros bytes del fichero de imagen.
 * @returns Valor de `f` para el protocolo Kitty (100=PNG, 32=RGBA, 24=RGB, 0=auto).
 */
function detectImageFormat(buffer: Buffer): number {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 100; // PNG
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 0; // JPEG, auto-detectar (Kitty soporta JPEG nativo)
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    return 0; // WEBP (RIFF), auto-detectar
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 0; // GIF, auto-detectar
  }
  return 0; // Auto-detectar por defecto
}

/**
 * Codifica un fichero de imagen local en una o más secuencias de escape del
 * Protocolo Gráfico de Kitty.
 *
 * El protocolo requiere que los datos Base64 se dividan en bloques de como
 * máximo 4096 bytes. Solo el primer fragmento lleva los parámetros completos
 * (a=T, f, t=d, s, v, c, r, i, z, q). Los fragmentos siguientes llevan
 * únicamente `m` y `q`. El último fragmento usa m=0, los anteriores m=1.
 *
 * Nunca lanza: si la imagen no se puede leer o codificar, retorna [].
 *
 * @param options - Parámetros de codificación (ruta, dimensiones, ID).
 * @returns Array de secuencias de escape listas para escribirse a stdout.
 */
export async function encodeKittyGraphic(options: KittyEncodeOptions): Promise<KittyFrame[]> {
  const { imagePath, widthPx, heightPx, columns, rows, imageId } = options;

  // Validación defensiva: la ruta debe ser un string no vacío.
  if (typeof imagePath !== 'string' || imagePath.length === 0) {
    return [];
  }

  let buffer: Buffer;
  try {
    buffer = await readFileBuffer(imagePath);
  } catch {
    return [];
  }

  if (!buffer || buffer.length === 0) {
    return [];
  }

  // Detectar formato de imagen por magic bytes.
  const imageFormat = detectImageFormat(buffer);

  // Codificar a Base64 (estándar RFC 4648, sin saltos de línea).
  const base64: string = buffer.toString('base64');

  if (base64.length === 0) {
    return [];
  }

  // Dividir en fragmentos de como máximo CHUNK_SIZE bytes del Base64.
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + CHUNK_SIZE));
  }

  const frames: KittyFrame[] = [];
  const lastIndex: number = chunks.length - 1;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk: string = chunks[index] ?? '';
    const isLast: boolean = index === lastIndex;
    // m=1 indica que hay más chunks por venir; m=0 es el último.
    const message: string = isLast ? '0' : '1';

    if (index === 0) {
      // Primer fragmento: lleva todos los parámetros del protocolo.
      // t=d (datos inline, no desde fichero), q=2 (no esperar respuesta).
      const params = `a=T,f=${imageFormat},t=d,s=${widthPx},v=${heightPx},c=${columns},r=${rows},i=${imageId},z=1,q=2,m=${message}`;
      const sequence = `\x1b_G${params};${chunk}\x1b\\`;
      frames.push({ sequence, isLast });
    } else {
      // Fragmentos de continuación: solo m y q, sin repetir parámetros.
      const params = `m=${message},q=2`;
      const sequence = `\x1b_G${params};${chunk}\x1b\\`;
      frames.push({ sequence, isLast });
    }
  }

  return frames;
}

/**
 * Genera la secuencia de borrado de Kitty para un ID de imagen específico.
 *
 * Formato: ESC _ G a=d,d=i,i=<imageId> ESC \
 *
 * @param imageId - Identificador único de la imagen a borrar.
 * @returns Secuencia de escape de borrado Kitty.
 */
export function deleteKittyImage(imageId: number): string {
  return `\x1b_Ga=d,d,i,i=${imageId}\x1b\\`;
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
      try {
        resolve(Buffer.concat(chunks));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    stream.on('error', reject);
  });
}
