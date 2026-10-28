/**
 * Utilidad para renderizar imágenes en la terminal.
 *
 * Cuando el terminal lo soporta (Kitty, WezTerm, Ghostty, iTerm2), se usa
 * `terminal-image` para obtener calidad de imagen fotográfica real a través
 * del protocolo gráfico nativo (Kitty SGP, iTerm2 IIP o Sixel). La salida
 * del protocolo se escribe directamente a stdout (bypasseando el Virtual
 * DOM de Ink) para evitar que Ink corrompa los buffers de escape gráfico.
 *
 * De lo contrario, se usa el modo símbolos de chafa con
 * `--symbols=sextant` (6 sub-píxeles por carácter, 3× más resolución
 * vertical que medios bloques) y `--dither=none` para colores sólidos
 * puros sin ruido.
 *
 * Si `chafa` no está instalado o la imagen no existe, se devuelve una
 * cadena vacía y el llamante debe mostrar un placeholder.
 *
 * Soporta cancelación mediante `AbortSignal` (solo aplica al modo símbolos
 * de chafa; `terminal-image` no soporta cancelación).
 */

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

import terminalImage from 'terminal-image';

/** Tamaño por defecto del póster en la vista de detalles (ancho x alto en caracteres). */
export const DEFAULT_POSTER_SIZE = { width: 22, height: 12 };

/** Protocolo de renderizado detectado. */
export type GraphicsFormat = 'symbols' | 'native';

/** Resultado del renderizado de una imagen. */
export type RenderResult = {
  /** Salida del renderizado (secuencias ANSI o protocolo gráfico nativo). */
  output: string;
  /** Protocolo de renderizado utilizado. */
  format: GraphicsFormat;
};

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
 * Detecta si el terminal actual soporta protocolo gráfico nativo
 * (Kitty SGP, iTerm2 IIP, Sixel, usado por Ghostty, Kitty, WezTerm, etc.).
 *
 * Orden de prioridad:
 * 1. Variable de entorno MEDIA_MANAGER_GRAPHICS (forzado explícito)
 * 2. GHOSTTY_RESOURCES_DIR (Ghostty)
 * 3. KITTY_WINDOW_ID o TERM_PROGRAM=Kitty/WezTerm/Ghostty (Kitty SGP)
 *
 * Devuelve 'native' si se detecta soporte nativo, 'symbols' en caso contrario.
 */
export function detectNativeFormat(): GraphicsFormat {
  const forced = process.env.MEDIA_MANAGER_GRAPHICS ?? '';
  const forcedLower = forced.toLowerCase();
  if (
    forcedLower === 'native' ||
    forcedLower === 'kitty' ||
    forcedLower === 'iterm' ||
    forcedLower === 'sixel'
  )
    return 'native';
  if (forcedLower === 'symbols' || forcedLower === 'ansi' || forcedLower === 'none')
    return 'symbols';

  const ghosttyResources = process.env.GHOSTTY_RESOURCES_DIR ?? '';
  const termProgram = process.env.TERM_PROGRAM ?? '';
  const kittyWindowId = process.env.KITTY_WINDOW_ID ?? '';
  const term = process.env.TERM ?? '';

  if (ghosttyResources) return 'native';
  if (termProgram === 'kitty') return 'native';
  if (termProgram === 'WezTerm') return 'native';
  if (termProgram === 'Ghostty') return 'native';
  if (termProgram === 'iTerm.app') return 'native';
  if (kittyWindowId) return 'native';
  if (term.toLowerCase().includes('ghostty')) return 'native';
  if (term.toLowerCase().includes('kitty')) return 'native';
  if (term.toLowerCase().includes('iterm')) return 'native';
  if (term === 'sixel') return 'native';

  return 'symbols';
}

/**
 * Convierte una imagen a arte Unicode o protocolo gráfico nativo.
 *
 * Cuando se detecta una terminal con protocolo gráfico nativo, se usa
 * `terminal-image` para generar la salida (Kitty SGP, iTerm2 IIP o Sixel
 * según la capacidad de la terminal). De lo contrario, se usa `chafa` con
 * `--symbols=sextant` para bloques de sextante (6 sub-píxeles por carácter,
 * 3× más resolución vertical que medios bloques).
 *
 * El resultado se limpia con `.trimEnd()` para eliminar saltos de línea o
 * retornos de carro finales.
 *
 * Devuelve una cadena de texto con secuencias de escape ANSI o protocolo
 * gráfico nativo que se puede mostrar directamente en la terminal.
 *
 * Devuelve cadena vacía si `chafa` no está disponible o la imagen no existe.
 *
 * @param signal - `AbortSignal` opcional para cancelar la ejecución de chafa
 *   (solo aplica al modo símbolos; `terminal-image` no soporta cancelación).
 */
export async function renderImageToAnsi(
  imagePath: string,
  options: { width?: number; height?: number; signal?: AbortSignal } = {},
): Promise<RenderResult> {
  const {
    width = DEFAULT_POSTER_SIZE.width,
    height = DEFAULT_POSTER_SIZE.height,
    signal,
  } = options;

  try {
    await access(imagePath);
  } catch {
    return { output: '', format: 'symbols' };
  }

  const nativeFormat = detectNativeFormat();

  if (nativeFormat === 'native') {
    try {
      const output = await terminalImage.file(imagePath, {
        width,
        height,
      });
      return { output, format: 'native' };
    } catch {
      // terminal-image falló, caer a chafa símbolos como fallback.
    }
  }

  // Modo símbolos ANSI con chafa (también usado como fallback cuando
  // terminal-image falla en modo nativo).
  try {
    const { stdout } = await execFilePromiseWithAbort(
      'chafa',
      [
        '--format=symbols',
        '--colors=full',
        '--symbols=sextant',
        '--dither=none',
        '--stretch',
        '--align=top,left',
        `--size=${width}x${height}`,
        '--animate=false',
        imagePath,
      ],
      { encoding: 'utf-8' },
      signal,
    );
    return { output: stdout.trimEnd(), format: 'symbols' };
  } catch {
    return { output: '', format: 'symbols' };
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
