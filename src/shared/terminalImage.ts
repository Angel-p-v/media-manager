/**
 * Utilidad para renderizar imágenes en la terminal.
 *
 * Usa `chafa` (comando externo) para convertir una imagen a arte Unicode con
 * colores ANSI, compatible con cualquier terminal. `chafa` está disponible en
 * la mayoría de distribuciones Linux y es ligero y rápido.
 *
 * Si `chafa` no está instalado o la imagen no existe, se devuelve una cadena
 * vacía y el llamante debe mostrar un placeholder.
 */

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

/** Tamaño por defecto del póster en la vista de detalles (ancho x alto en caracteres). */
export const DEFAULT_POSTER_SIZE = { width: 22, height: 12 };

/** Comprueba si `chafa` está disponible en el sistema. */
export async function isChafaAvailable(): Promise<boolean> {
  try {
    await execFilePromise('chafa', ['--version'], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convierte una imagen a arte Unicode con colores ANSI usando `chafa`.
 *
 * Devuelve una cadena de texto con secuencias de escape ANSI que se puede
 * mostrar directamente en la terminal (incluido dentro de un `<Text>` de Ink).
 *
 * Devuelve cadena vacía si `chafa` no está disponible o la imagen no existe.
 */
export async function renderImageToAnsi(
  imagePath: string,
  options: { width?: number; height?: number } = {},
): Promise<string> {
  const { width = DEFAULT_POSTER_SIZE.width, height = DEFAULT_POSTER_SIZE.height } = options;

  try {
    await access(imagePath);
  } catch {
    return '';
  }

  try {
    const { stdout } = await execFilePromise(
      'chafa',
      ['--format=ansi', '--colors=256', `--size=${width}x${height}`, '--animate=false', imagePath],
      { encoding: 'utf-8' },
    );
    return stdout;
  } catch {
    return '';
  }
}

/** Ejecuta `execFile` envuelto en una promesa (para facilitar tests). */
function execFilePromise(
  file: string,
  args: string[],
  options: { encoding: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error instanceof Error ? error : new Error('Error ejecutando chafa'));
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
}
