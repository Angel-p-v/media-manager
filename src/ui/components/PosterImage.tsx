/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * Cuando el terminal soporta protocolo gráfico nativo de Kitty (Ghostty, Kitty,
 * WezTerm), se implementa el Protocolo Gráfico de Kitty (SGP) de forma cruda
 * en TypeScript (sin librerías de terceros ni subprocesos).
 *
 * Cuando el terminal NO soporta gráficos nativos, usa chafa con
 * --format=symbols --symbols=sextant (fallback ANSI tradicional).
 *
 * Arquitectura: dos componentes separados para garantizar que el orden de
 * los Hooks de React sea siempre consistente (Reglas de Hooks). Cada modo
 * tiene su propio orden fijo de hooks, nunca condicional.
 *
 * Ningún mensaje de depuración se escribe a stdout/stderr.
 */

import { Box, Text, useStdout } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { deleteKittyImage, encodeKittyGraphic } from '../../shared/kittyProtocol.js';
import { detectNativeFormat, renderImageToAnsi } from '../../shared/terminalImage.js';
import { theme } from '../theme.js';

export type PosterImageProps = {
  /** Ruta local al archivo de imagen (póster cacheado). Puede ser null. */
  imagePath: string | null;
  /** Ancho del póster en caracteres de terminal. Si se omite, se calcula de forma responsiva. */
  width?: number;
  /** Alto del póster en caracteres de terminal. Si se omite, se calcula de forma responsiva. */
  height?: number;
};

/** Dimensiones por defecto del póster cuando no se puede calcular de forma responsiva. */
const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 20;

/**
 * Calcula dimensiones responsivas para el póster basándose en el tamaño de la
 * terminal, reservando espacio para la cabecera, la barra de estado y los
 * márgenes. El ancho limita el póster a un tercio de la terminal; el alto se
 * usa como referencia para el área de renderizado.
 *
 * Exportado para tests.
 */
export function computePosterSize(): { width: number; height: number } {
  const terminalRows: number = process.stdout.rows ?? 24;
  const terminalCols: number = process.stdout.columns ?? 80;

  // El póster vive en un panel lateral: ocupa como máximo un tercio del ancho.
  const availableCols = Math.max(10, Math.floor(terminalCols / 3) - 4);
  // Cabecera (1 fila) + barra de estado (1 fila) + márgenes y padding (≈2 filas).
  const availableRows = Math.max(6, terminalRows - 4);

  return {
    width: Math.min(DEFAULT_WIDTH, availableCols),
    height: Math.min(DEFAULT_HEIGHT, availableRows),
  };
}

/**
 * Componente para modo nativo (Kitty SGP).
 *
 * Renderiza un <Box> vacío para reservar espacio y proyecta el gráfico
 * Kitty directamente a stdout vía useStdout(). Posiciona el cursor sobre
 * el Box usando secuencias de guardar/restaurar cursor, y repinta tras
 * cada render de Ink. Tiene su propio orden fijo de hooks.
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
  const stdout = useStdout();
  const mountedRef = useRef(true);
  const imageIdRef = useRef<number | null>(null);

  // ID estable y único generado una vez por montaje. No cambia en re-renders,
  // evitando reenvíos innecesarios y colisiones de ID.
  const imageId: number = React.useRef(Math.floor(Math.random() * 10000)).current;
  imageIdRef.current = imageId;

  // Bypass de Ink: escribir directamente a stdout vía useStdout() para evitar
  // que el Virtual DOM de Ink corrompa los buffers de escape gráfico del
  // protocolo Kitty. Se usa guardar/restaurar cursor para posicionar la
  // imagen sobre el Box vacío sin confiar en c=/r= para el posicionamiento.
  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        // Desacoplar del ciclo síncrono de render de Ink.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled || !mountedRef.current) return;

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

        if (cancelled || !mountedRef.current) return;

        if (!Array.isArray(frames) || frames.length === 0) {
          return;
        }

        const hideCursor = '\x1b[?25l';
        const showCursor = '\x1b[?25h';
        const saveCursor = '\x1b7';
        const restoreCursor = '\x1b8';

        // Concatenar todos los frames en una sola escritura a stdout.
        let fullOutput = hideCursor;
        for (const frame of frames) {
          if (frame && typeof frame.sequence === 'string') {
            fullOutput += saveCursor + frame.sequence + restoreCursor;
          }
        }
        fullOutput += showCursor;

        try {
          stdout.write(fullOutput);
        } catch {
          try {
            stdout.write(showCursor);
          } catch {
            // No hay nada más que hacer.
          }
        }
      } catch {
        // El póster simplemente no se renderiza en modo nativo.
      }
    };

    void run();

    return () => {
      cancelled = true;
      // CRÍTICO: borrar la imagen gráfica de Kitty para este ID al desmontar
      // o cambiar de imagen, evitando artefactos flotantes.
      if (imageIdRef.current !== null) {
        try {
          stdout.write(deleteKittyImage(imageIdRef.current));
        } catch {
          // Si el borrado falla, se ignora.
        }
      }
      try {
        stdout.write('\x1b[?25h');
      } catch {
        // No hay nada más que hacer.
      }
    };
  }, [imagePath, width, height, imageId, stdout]);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      width={width}
      height={height}
      flexShrink={0}
      overflow="hidden"
    />
  );
}

/**
 * Componente para modo fallback ANSI (chafa símbolos).
 *
 * Renderiza el arte Unicode de chafa dentro del Box. Tiene su propio orden
 * fijo de Hooks (useState + useCallback + useEffect), nunca condicional.
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
  const [poster, setPoster] = useState<string | null>(null);
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
        setPoster(result.output);
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
        overflow="hidden"
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
        overflow="hidden"
      >
        <Text>{theme.muted('  [ PÓSTER ]')}</Text>
        <Text>{theme.muted('  Cargando póster…')}</Text>
      </Box>
    );
  }

  if (poster) {
    const lines: string[] = poster.split('\n');
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border}
        width={width}
        height={height}
        flexShrink={0}
        overflow="hidden"
        flexDirection="column"
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
      overflow="hidden"
    >
      <Text>{theme.muted('  [ PÓSTER ]')}</Text>
      <Text>{theme.muted('  (imagen no disponible)')}</Text>
    </Box>
  );
}

/** Componente principal: decide Kitty nativo o fallback chafa. */
export function PosterImage({ imagePath, width, height }: PosterImageProps): React.JSX.Element {
  const { width: posterWidth, height: posterHeight } = computePosterSize();
  const resolvedWidth: number = width ?? posterWidth;
  const resolvedHeight: number = height ?? posterHeight;

  const isKittyTerminal: boolean = detectNativeFormat() === 'native';

  // Kitty nativo solo cuando el terminal lo soporta y hay imagen.
  if (isKittyTerminal && typeof imagePath === 'string' && imagePath.length > 0) {
    return (
      <NativePosterImage imagePath={imagePath} width={resolvedWidth} height={resolvedHeight} />
    );
  }

  return (
    <FallbackPosterImage imagePath={imagePath} width={resolvedWidth} height={resolvedHeight} />
  );
}
