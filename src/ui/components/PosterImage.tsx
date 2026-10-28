/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * Modo nativo (Ghostty / Kitty / WezTerm):
 *  - El `return` es únicamente un `<Box>` vacío (placeholder) que Ink pinta
 *    normalmente. Sobre ese box se dibuja la imagen mediante el protocolo
 *    Kitty escrito directamente a `stdout` vía `useStdout()`, evitando que el
 *    Virtual DOM de Ink corrompa los buffers de escape gráfico.
 *  - Un `useEffect` procesa la imagen con Sharp, obtiene la secuencia Kitty y
 *    la escribe envuelta en `setTimeout(50 ms)`, justo después de que Ink
 *    pinte la caja y limpie el fondo.
 *  - El `return` del `useEffect` ejecuta la secuencia de borrado del ID de la
 *    imagen para que no queden artefactos flotantes al cambiar de vista.
 *
 * Modo fallback ANSI (terminales estándar):
 *  - Se usa `child_process.exec()` a `chafa --format=symbols --symbols=sextant`
 *    y la salida se divide por líneas (`.split('\n')`) para renderizarla como
 *    texto estándar dentro de un `<Box>`.
 *
 * Ningún mensaje de depuración se escribe a stdout/stderr.
 */

import { Box, Text, useStdout } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { computePixelDimensions, processImage } from '../../shared/imageProcessor.js';
import { deleteKittyImage, encodeKittyGraphic } from '../../shared/kittyProtocol.js';
import { renderImageToAnsi, supportsKittyGraphics } from '../../shared/terminalImage.js';
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
 * Posición absoluta aproximada del póster en la terminal.
 *
 * Ink no expone las coordenadas de pantalla de un componente, por lo que se
 * calcula una estimación razonable a partir del tamaño de la terminal. Se
 * usa para mover el cursor antes de escribir la secuencia Kitty (overlay
 * directo sobre el placeholder).
 */
function computeAbsolutePosition(width: number, height: number): { x: number; y: number } {
  const terminalCols: number = process.stdout.columns ?? 80;
  const terminalRows: number = process.stdout.rows ?? 24;

  // Alinear a la derecha, cerca del borde superior, dejando un margen de 1
  // celda para no sobresalir de la pantalla alternativa.
  const x: number = Math.max(0, terminalCols - width - 1);
  const y: number = Math.max(1, Math.floor(terminalRows / 2) - Math.floor(height / 2));

  return { x, y };
}

/**
 * Componente modo nativo (Kitty SGP). Bypass de Ink: escribe directamente a
 * `stdout` para no corromper los buffers de escape gráfico.
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drawPoster = useCallback(async (): Promise<void> => {
    const imageId: number = Math.floor(Math.random() * 100000);
    imageIdRef.current = imageId;

    const pixels = computePixelDimensions(width, height);
    let buffer: Buffer;
    try {
      buffer = await processImage(imagePath, pixels);
    } catch {
      return;
    }
    if (!mountedRef.current) return;

    const frames = encodeKittyGraphic({
      buffer,
      columns: width,
      rows: height,
      imageId,
    });
    if (!mountedRef.current || frames.length === 0) return;

    const { x, y } = computeAbsolutePosition(width, height);
    const moveCursor = `\x1b[${y};${x}H`;
    const hideCursor = '\x1b[?25l';
    const showCursor = '\x1b[?25h';

    // Sincronización: escribir 50 ms después de que Ink pinte el placeholder
    // y limpie el fondo, para que la imagen quede sobre la caja vacía.
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      try {
        stdout.write(hideCursor);
        for (const frame of frames) {
          stdout.write(moveCursor + frame.sequence);
        }
        stdout.write(showCursor);
      } catch {
        try {
          stdout.write(showCursor);
        } catch {
          // No hay nada más que hacer.
        }
      }
    }, 50);
  }, [imagePath, width, height, stdout]);

  useEffect(() => {
    mountedRef.current = true;
    void drawPoster();

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Limpieza obligatoria: borrar la imagen por su ID para evitar
      // artefactos flotantes al cambiar de vista.
      if (imageIdRef.current !== null) {
        try {
          stdout.write(deleteKittyImage(imageIdRef.current));
        } catch {
          // Si el borrado falla, se ignora.
        }
      }
    };
  }, [imagePath, width, height, stdout, drawPoster]);

  // Return únicamente un placeholder vacío; la imagen se dibuja sobre él vía stdout.
  return <Box borderStyle="round" flexShrink={0} height={height} width={width} />;
}

/**
 * Componente modo fallback ANSI (chafa símbolos).
 *
 * Renderiza el arte Unicode de chafa dentro del Box. La salida se divide por
 * líneas (`.split('\n')`) y cada línea se renderiza como un `<Text>`.
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
      <Text>{theme.muted('  (imagen no disponible)')}</Text>
    </Box>
  );
}

/** Componente principal: decide Kitty nativo o fallback chafa. */
export function PosterImage({ imagePath, width, height }: PosterImageProps): React.JSX.Element {
  const { width: posterWidth, height: posterHeight } = computePosterSize();
  const resolvedWidth: number = width ?? posterWidth;
  const resolvedHeight: number = height ?? posterHeight;

  const isKittyTerminal: boolean = supportsKittyGraphics();

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
