/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * Cuando el terminal soporta protocolo gráfico nativo de Kitty (Ghostty, Kitty,
 * WezTerm), se usa `<Image protocol="kitty">` de `ink-picture`, que se encarga
 * de decodificar JPEG/PNG, redimensionar, transmitir la imagen una vez,
 * recolocarla tras cada render de Ink y borrarla al desmontar.
 *
 * Cuando el terminal NO soporta gráficos nativos, se usa `chafa` con
 * --format=symbols --symbols=sextant como fallback ANSI.
 *
 * Ningún mensaje de depuración se escribe a stdout/stderr.
 */

import { Box, Text } from 'ink';
import Image from 'ink-picture';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
 * márgenes. El ancho limita el póster a un tercio de la terminal; el alto se
 * usa como referencia para el `<Image>` (el Box no fija altura para no
 * restringir la columna contigua en layouts flex).
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
 * Componente para modo nativo (Kitty SGP) mediante ink-picture.
 *
 * Delegada toda la complejidad del protocolo (codificación, chunking,
 * posicionamiento, repintado tras cada render de Ink y borrado al desmontar)
 * a la librería. No hay encoder propio ni cursor manual.
 *
 * El Box no fija altura: se estira con la columna vecina para no recortar
 * el contenido de la vista. El `<Image>` recibe la altura como referencia.
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
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      width={width}
      height={height}
      flexShrink={0}
      overflow="hidden"
    >
      <Image
        src={imagePath}
        width={width}
        height={height}
        alt="Póster del título"
        objectFit="contain"
        protocol="kitty"
      />
    </Box>
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
