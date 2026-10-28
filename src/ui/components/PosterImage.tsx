/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * Cuando el terminal soporta protocolo gráfico nativo (Ghostty, Kitty, WezTerm),
 * se implementa el Protocolo Gráfico de Kitty (SGP) de forma cruda en TypeScript
 * (sin librerías de terceros ni subprocesos).
 *
 * Cuando el terminal NO soporta gráficos nativos, usa chafa con
 * --format=symbols --symbols=sextant (fallback ANSI tradicional).
 *
 * Arquitectura: dos componentes separados para garantizar que el orden de
 * los Hooks de React sea siempre consistente (Reglas de Hooks). Cada modo
 * tiene su propio orden fijo de hooks, nunca condicional.
 */

import { Box, Text } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { deleteKittyImage, encodeKittyGraphic } from '../../shared/kittyProtocol.js';
import {
  detectNativeFormat,
  type GraphicsFormat,
  renderImageToAnsi,
} from '../../shared/terminalImage.js';
import { theme } from '../theme.js';

export type PosterImageProps = {
  /** Ruta local al archivo de imagen (póster cacheado). Puede ser null. */
  imagePath: string | null;
  /** Ancho del póster en caracteres de terminal. */
  width?: number;
  /** Alto del póster en caracteres de terminal. */
  height?: number;
};

/** Arte ASCII de fallback cuando chafa no está disponible o falla. */
const FALLBACK_ASCII = `
██████╗ ███████╗██╗   ██╗██╗   ██╗██╗  ██╗██╗███╗   ███╗ █████╗ ██████╗
██╔══██╗██╔════╝████╗  ██║██║   ██║╚██╗██╔╝██║███╗ ███║██╔══██╗██╔══██╗
██████╔╝██████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝ ██║██║█████╔██║███████║██████╔╝
██╔═══╝ █████╝  ██║╚██╗██║██║   ██║ ██╔═██╗ ██║██║╚██╔╝██║██╔══██║██╔══╝
██║     ███████╗██║ ╚██║╚═██████╔╝██║  ██╗██║██║ ╚═╝ ██║██║  ██║██║
╚═════╝ ╚═════╝ ╚╝  ⚐╝╚╝  ⚐╝╚═╝     ⚐═╝╚═╝  ⚐╝
`.trim();

/** Tamaño por defecto del póster. */
const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 20;

/**
 * Componente para modo nativo (Kitty SGP).
 *
 * Renderiza un <Box> vacío para reservar espacio y proyecta el gráfico
 * Kitty directamente a stdout. Tiene su propio orden fijo de hooks.
 */
function NativePosterImage({
  imagePath,
  width,
  height,
}: {
  imagePath: string;
  width: number;
  height: number;
}): React.JSX.Element {
  const mountedRef = useRef(true);
  const imageIdRef = useRef<number | null>(null);
  const columns: number = process.stdout.columns ?? 80;

  const offsetX = Number(process.env.MEDIA_MANAGER_POSTER_OFFSET_X ?? '0');
  const offsetY = Number(process.env.MEDIA_MANAGER_POSTER_OFFSET_Y ?? '0');
  const marginRight = Number(process.env.MEDIA_MANAGER_POSTER_MARGIN_RIGHT ?? '1');

  const posterX: number = Math.max(0, columns - width - marginRight) + offsetX;
  const posterY: number = Math.max(1, 1 + offsetY);

  // Generar un ID único para esta imagen (se usa en el borrado al desmontar).
  const imageId: number = Math.floor(Math.random() * 10000);
  imageIdRef.current = imageId;

  // Diagnosticar a stderr para saber qué está pasando en entornos reales.
  try {
    process.stderr.write(
      `[mm] NativePosterImage: imagePath=${imagePath} width=${width} height=${height} ` +
        `columns=${columns} posterX=${posterX} posterY=${posterY} imageId=${imageId}\n`,
    );
  } catch {
    // No hay nada más que hacer.
  }

  // Bypass de Ink: escribir directamente a process.stdout para evitar que el
  // Virtual DOM de Ink corrompa los buffers de escape gráfico del protocolo Kitty.
  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        // Desacoplar del ciclo síncrono de render de Ink.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled || !mountedRef.current) return;

        // Verificar que el fichero existe antes de intentar codificarlo.
        let fileAccessible = false;
        try {
          await import('node:fs/promises').then(({ access }) => access(imagePath));
          fileAccessible = true;
        } catch {
          fileAccessible = false;
        }

        if (!fileAccessible) {
          try {
            process.stderr.write(`[mm] NativePosterImage: fichero no accesible: ${imagePath}\n`);
          } catch {
            // No hay nada más que hacer.
          }
          return;
        }

        let frames: { sequence: string; isLast: boolean }[] = [];
        try {
          frames =
            (await encodeKittyGraphic({
              imagePath,
              widthPx: width * 10, // aproximación: 10 px por columna
              heightPx: height * 20, // aproximación: 20 px por fila
              columns: width,
              rows: height,
              imageId,
            })) ?? [];
        } catch {
          frames = [];
        }

        try {
          process.stderr.write(`[mm] NativePosterImage: frames generados=${frames.length}\n`);
        } catch {
          // No hay nada más que hacer.
        }

        if (cancelled || !mountedRef.current) return;

        if (!Array.isArray(frames)) {
          frames = [];
        }

        if (frames.length === 0) {
          try {
            process.stderr.write(
              `[mm] NativePosterImage: no se generaron frames, imagen no renderizada\n`,
            );
          } catch {
            // No hay nada más que hacer.
          }
          return;
        }

        const hideCursor = '\x1b[?25l';
        const showCursor = '\x1b[?25h';
        const moveCursor = `\x1b[${posterY};${posterX}H`;

        try {
          process.stdout.write(hideCursor);
          for (const frame of frames) {
            if (frame && typeof frame.sequence === 'string') {
              process.stdout.write(moveCursor + frame.sequence);
            }
          }
          process.stdout.write(showCursor);

          try {
            process.stderr.write(
              `[mm] NativePosterImage: ${frames.length} frames escritos a stdout\n`,
            );
          } catch {
            // No hay nada más que hacer.
          }
        } catch {
          try {
            process.stdout.write(showCursor);
          } catch {
            // No hay nada más que hacer.
          }
          try {
            process.stderr.write(`[mm] NativePosterImage: error escribiendo frames a stdout\n`);
          } catch {
            // No hay nada más que hacer.
          }
        }
      } catch (err) {
        // Escribir el error real a stderr para diagnóstico
        try {
          process.stderr.write(`[mm] Error renderizando póster nativo: ${String(err)}\n`);
        } catch {
          // No hay nada más que hacer.
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      // CRÍTICO: borrar la imagen gráfica de Kitty para este ID al desmontar
      // o cambiar de imagen, evitando artefactos flotantes.
      if (imageIdRef.current !== null) {
        try {
          process.stdout.write(deleteKittyImage(imageIdRef.current));
        } catch {
          // Si el borrado falla, se ignora.
        }
      }
      try {
        process.stdout.write('\x1b[?25h');
      } catch {
        // No hay nada más que hacer.
      }
    };
  }, [imagePath, width, height, posterX, posterY, imageId]);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      width={width}
      height={height}
      flexShrink={0}
    />
  );
}

/**
 * Componente para modo fallback ANSI (chafa símbolos).
 *
 * Tiene su propio orden fijo de hooks (useState + useCallback + useEffect),
 * nunca condicional.
 */
function FallbackPosterImage({
  imagePath,
  width,
  height,
}: {
  imagePath: string | null;
  width: number;
  height: number;
}): React.JSX.Element {
  const [poster, setPoster] = useState<{ output: string; format: GraphicsFormat } | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const renderPoster = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    if (!imagePath) {
      setPoster(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!mountedRef.current || abortController.signal.aborted) return;

    try {
      const result = await renderImageToAnsi(imagePath, {
        width,
        height,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted || !mountedRef.current) return;

      if (result.output) {
        setPoster(result);
        setLoading(false);
      } else {
        setPoster(null);
        setLoading(false);
      }
    } catch {
      if (abortController.signal.aborted || !mountedRef.current) return;
      setPoster(null);
      setLoading(false);
    }
  }, [imagePath, width, height]);

  useEffect(() => {
    mountedRef.current = true;
    void renderPoster();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [renderPoster]);

  if (!imagePath) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border}
        width={width}
        height={height}
        flexShrink={0}
      >
        <Text>{theme.muted('  [ PÓSTER ]')}</Text>
        <Text>{theme.muted('  (sin imagen)')}</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border}
        width={width}
        height={height}
        flexShrink={0}
      >
        <Text>{theme.muted('  [ PÓSTER ]')}</Text>
        <Text>{theme.muted('  Cargando póster…')}</Text>
      </Box>
    );
  }

  if (poster?.output) {
    const output: string = poster.output ?? '';
    const lines: string[] = output.split('\n');
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border}
        width={width}
        height={height}
        flexShrink={0}
        flexDirection="column"
        overflow="hidden"
      >
        {lines.map((line: string, index: number) => (
          <Text key={index} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      width={width}
      height={height}
      flexShrink={0}
    >
      <Text>{theme.muted('  [ PÓSTER ]')}</Text>
      <Text>{theme.muted('  (imagen no disponible)')}</Text>
      <Text> </Text>
      {FALLBACK_ASCII.split('\n').map((line: string, i: number) => (
        <Text key={i}>{theme.muted(`  ${line}`)}</Text>
      ))}
    </Box>
  );
}

/** Componente principal: decide qué modo renderizar. */
export function PosterImage({
  imagePath,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: PosterImageProps): React.JSX.Element {
  const nativeFormat: GraphicsFormat = detectNativeFormat();

  // Decidir qué componente renderizar. Cada componente tiene su propio orden
  // fijo de hooks, nunca condicional, así que no hay violación de Reglas de Hooks.
  if (nativeFormat === 'native' && typeof imagePath === 'string' && imagePath.length > 0) {
    return <NativePosterImage imagePath={imagePath} width={width} height={height} />;
  }

  return <FallbackPosterImage imagePath={imagePath} width={width} height={height} />;
}
