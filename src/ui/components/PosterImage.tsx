/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * El póster se renderiza SIEMPRE dentro del flujo de Ink (dentro de un
 * `<Box>`), de modo que queda exactamente en la posición que el layout de
 * Ink le asigne. No se escriben secuencias gráficas fuera de Ink que
 * pudieran descolocarse al redibujar.
 *
 * Modos de renderizado:
 * - 'auto' (por defecto): usa Sharp para convertir la imagen a bloques de
 *   color ANSI truecolor dentro del Box de Ink. Buena calidad (colores
 *   reales 24-bit) y posicionamiento perfecto en cualquier terminal.
 * - 'symbols': usa Chafa dentro del Box de Ink. Posicionamiento perfecto,
 *   compatible con cualquier terminal, pero calidad limitada (arte ANSI).
 * - 'native': igual que 'auto' (se mantiene por compatibilidad, pero el
 *   renderizado gráfico nativo como overlay sobre stdout no puede
 *   posicionarse con precisión dentro de un <Box> de Ink porque Ink no
 *   expone las coordenadas físicas de pantalla de sus componentes).
 *
 * Cada vista controla la posición mediante la estructura de componentes
 * (dónde coloca el <PosterImage> en el árbol de React), no mediante
 * coordenadas absolutas de terminal.
 *
 * Ningún mensaje de depuración se escribe a stdout/stderr.
 */

import { Box, Text } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { imageToAnsi } from '../../shared/imageToAnsi.js';
import { renderImageToAnsi } from '../../shared/terminalImage.js';
import { theme } from '../theme.js';

export type PosterImageProps = {
  /** Ruta local al archivo de imagen (póster cacheado). Puede ser null. */
  imagePath: string | null;
  /** Ancho del póster en caracteres de terminal. Si se omite, se calcula de forma responsiva. */
  width?: number;
  /** Alto del póster en caracteres de terminal. Si se omite, se calcula de forma responsiva. */
  height?: number;
  /** Modo de renderizado: 'auto' (Sharp truecolor dentro de Ink), 'symbols' (Chafa dentro de Ink) o 'native' (igual que 'auto'). */
  mode?: 'auto' | 'native' | 'symbols';
};

/** Dimensiones por defecto del póster cuando no se puede calcular de forma responsiva. */
const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 20;

/**
 * Calcula dimensiones responsivas para el póster basándose en el tamaño de la
 * terminal, reservando espacio para la cabecera, la barra de estado y los
 * márgenes. Exportado para tests.
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
 * Componente que renderiza el póster como bloques de color ANSI truecolor
 * dentro del Box de Ink.
 *
 * Usa Sharp para procesar la imagen y generar bloques de color (█) con el
 * color de fondo truecolor de cada píxel. Como se renderiza dentro del
 * flujo de Ink, el póster queda exactamente en la posición que el layout de
 * Ink le asigne.
 */
function SharpPosterImage({
  imagePath,
  width,
  height,
}: {
  imagePath: string;
  width: number;
  height: number;
}): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(!!imagePath);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const renderPoster = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    if (!imagePath) {
      setLines([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!mountedRef.current || abortController.signal.aborted) return;

    try {
      const result = await imageToAnsi({ imagePath, width, height });
      if (abortController.signal.aborted || !mountedRef.current) return;

      if (result.lines.length > 0) {
        setLines(result.lines);
        setLoading(false);
      } else {
        setLines([]);
        setLoading(false);
      }
    } catch {
      if (abortController.signal.aborted || !mountedRef.current) return;
      setLines([]);
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

  if (lines.length > 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border}
        width={width}
        height={height}
        flexShrink={0}
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
    >
      <Text>{theme.muted('  [ PÓSTER ]')}</Text>
      <Text>{theme.muted(imagePath ? '  (póster no disponible en disco)' : '  (sin póster)')}</Text>
    </Box>
  );
}

/**
 * Componente modo fallback ANSI (chafa símbolos).
 *
 * Renderiza el arte Unicode de chafa dentro del Box. La salida se divide por
 * líneas (`.split('\n')`) y cada línea se renderiza como un `<Text>`. Esto
 * garantiza que el póster quede exactamente en la posición que Ink le asigne
 * dentro del layout.
 */
function ChafaPosterImage({
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
      >
        <Text>{theme.muted('  [ PÓSTER ]')}</Text>
        <Text>{theme.muted('  (sin póster)')}</Text>
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

  if (poster) {
    const lines: string[] = poster.split('\n');
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border}
        width={width}
        height={height}
        flexShrink={0}
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
    >
      <Text>{theme.muted('  [ PÓSTER ]')}</Text>
      <Text>{theme.muted('  (póster no disponible en disco)')}</Text>
    </Box>
  );
}

/** Componente principal: renderiza el póster dentro del Box de Ink. */
export function PosterImage({
  imagePath,
  width,
  height,
  mode = 'auto',
}: PosterImageProps): React.JSX.Element {
  const { width: posterWidth, height: posterHeight } = computePosterSize();
  const resolvedWidth: number = width ?? posterWidth;
  const resolvedHeight: number = height ?? posterHeight;

  // Siempre renderizamos dentro del flujo de Ink para que el póster quede
  // exactamente en la posición que el layout de Ink le asigne. El modo
  // 'native' (overlay de stdout con protocolo Kitty) no puede posicionarse
  // con precisión dentro de un <Box> de Ink porque Ink no expone las
  // coordenadas físicas de pantalla de sus componentes.

  if (!imagePath) {
    return <SharpPosterImage imagePath="" width={resolvedWidth} height={resolvedHeight} />;
  }

  if (mode === 'symbols') {
    return <ChafaPosterImage imagePath={imagePath} width={resolvedWidth} height={resolvedHeight} />;
  }

  return <SharpPosterImage imagePath={imagePath} width={resolvedWidth} height={resolvedHeight} />;
}
