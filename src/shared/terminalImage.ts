/**
 * Utilidad para renderizar imágenes en la terminal.
 *
 * Usa `chafa` (comando externo) para convertir una imagen a arte Unicode con
 * colores ANSI, compatible con cualquier terminal. `chafa` está disponible en
 * la mayoría de distribuciones Linux y es ligero y rápido.
 *
 * Si `chafa` no está instalado o la imagen no existe, se devuelve una cadena
 * vacía y el llamante debe mostrar un placeholder.
 *
 * Soporta cancelación mediante `AbortSignal`: si el usuario navega a otro
 * título antes de que chafa termine, el proceso se mata y la promesa se rechaza.
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
 * Usa `--format=symbols` con `--symbols=half` para bloques de medio bloque
 * horizontal (aprovecha las mitades superior/inferior de cada carácter para
 * duplicar la resolución vertical sin insertar líneas en blanco), `--colors=full`
 * para TrueColor (24-bit), y `--stretch` junto a `--size=WxH` para forzar que
 * chafa ocupe el 100% del canvas del Box contenedor.
 *
 * El resultado se limpia con `.trimEnd()` para eliminar saltos de línea o
 * retornos de carro finales que descuadren la última fila del Box de Ink.
 *
 * Devuelve una cadena de texto con secuencias de escape ANSI que se puede
 * mostrar directamente en la terminal (incluido dentro de un `<Text>` de Ink).
 *
 * Devuelve cadena vacía si `chafa` no está disponible o la imagen no existe.
 *
 * @param signal - `AbortSignal` opcional para cancelar la ejecución de chafa.
 */
export async function renderImageToAnsi(
  imagePath: string,
  options: { width?: number; height?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const {
    width = DEFAULT_POSTER_SIZE.width,
    height = DEFAULT_POSTER_SIZE.height,
    signal,
  } = options;

  try {
    await access(imagePath);
  } catch {
    return '';
  }

  try {
    const { stdout } = await execFilePromiseWithAbort(
      'chafa',
      [
        '--format=symbols',
        '--colors=full',
        '--symbols=half',
        '--stretch',
        '--align=top,left',
        `--size=${width}x${height}`,
        '--animate=false',
        imagePath,
      ],
      { encoding: 'utf-8' },
      signal,
    );
    return stdout.trimEnd();
  } catch {
    return '';
  }
}

/**
 * Ejecuta `execFile` envuelto en una promesa con soporte para `AbortSignal`.
 * Si se emite 'abort', se mata el proceso hijo y se rechaza la promesa.
 */
function execFilePromiseWithAbort(
  file: string,
  args: string[],
  options: { encoding: string },
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error instanceof Error ? error : new Error('Error ejecutando chafa'));
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });

    if (signal) {
      const onAbort = () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // El proceso ya puede haber terminado.
        }
        reject(new Error('Renderizado cancelado por el usuario.'));
      };

      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
  });
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
