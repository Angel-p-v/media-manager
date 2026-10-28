/**
 * Utilidad para renderizar imágenes en la terminal.
 *
 * Usa `chafa` (comando externo) para convertir una imagen a arte Unicode con
 * colores ANSI, compatible con cualquier terminal. `chafa` está disponible en
 * la mayoría de distribuciones Linux y es ligero y rápido.
 *
 * Cuando el terminal lo soporta (Kitty, WezTerm, Ghostty, iTerm2, Foot),
 * se usa el protocolo gráfico nativo (Kitty SGP, iTerm2 IIP o Sixel) para
 * obtener calidad de imagen fotográfica real. De lo contrario, se usa el
 * modo símbolos de chafa con `--symbols=sextant` (6 sub-píxeles por carácter,
 * 3× más resolución vertical que medios bloques) y `--dither=none` para
 * colores sólidos puros sin ruido.
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
 * Detecta si el terminal actual soporta un protocolo gráfico nativo que
 * permita a chafa renderizar la imagen con calidad fotográfica real en
 * lugar de símbolos ANSI.
 *
 * Devuelve el valor de `--format` adecuado ('kitty', 'iterm', 'sixel') o
 * `undefined` si no se detecta ninguna capacidad nativa (se usará el modo
 * símbolos por defecto).
 */
function detectNativeFormat(): string | undefined {
  const termProgram = process.env.TERM_PROGRAM ?? '';
  const term = process.env.TERM ?? '';
  const kittyWindowId = process.env.KITTY_WINDOW_ID ?? '';

  // Kitty Graphics Protocol (KGP): Kitty, WezTerm, Ghostty, Konsole (con KGP)
  if (kittyWindowId) return 'kitty';
  if (termProgram === 'kitty') return 'kitty';
  if (termProgram === 'WezTerm') return 'kitty';
  if (termProgram === 'Ghostty') return 'kitty';

  // iTerm2 Inline Images Protocol (IIP)
  if (termProgram === 'iTerm.app') return 'iterm';

  // Sixel graphics protocol: Foot, Windows Terminal, xterm (vt340), Rio
  if (term === 'sixel' || termProgram === 'foot') return 'sixel';

  return undefined;
}

/**
 * Convierte una imagen a arte Unicode o protocolo gráfico nativo usando `chafa`.
 *
 * Usa `--format=symbols` con `--symbols=sextant` para que cada carácter de
 * la terminal mapee 6 sub-píxeles (2 columnas × 3 filas), triplicando la
 * resolución vertical respecto a medios bloques. Cuando se detecta una
 * terminal con protocolo gráfico nativo (Kitty, iTerm2, Sixel), se usa ese
 * formato para obtener calidad fotográfica real.
 *
 * `--colors=full` para TrueColor (24-bit), `--dither=none` para evitar el
 * punteado aleatorio que añade ruido a caras y letras pequeñas, y `--stretch`
 * junto a `--size=WxH` para forzar que chafa ocupe el 100% del canvas del
 * Box contenedor.
 *
 * El resultado se limpia con `.trimEnd()` para eliminar saltos de línea o
 * retornos de carro finales que descuadren la última fila del Box de Ink.
 *
 * Devuelve una cadena de texto con secuencias de escape ANSI (o protocolo
 * gráfico nativo) que se puede mostrar directamente en la terminal.
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

  const nativeFormat = detectNativeFormat();
  const formatFlag = nativeFormat ? `--format=${nativeFormat}` : '--format=symbols';

  try {
    const { stdout } = await execFilePromiseWithAbort(
      'chafa',
      [
        formatFlag,
        '--colors=full',
        nativeFormat ? undefined : '--symbols=sextant',
        '--dither=none',
        '--stretch',
        '--align=top,left',
        `--size=${width}x${height}`,
        '--animate=false',
        imagePath,
      ].filter((arg): arg is string => arg !== undefined),
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
