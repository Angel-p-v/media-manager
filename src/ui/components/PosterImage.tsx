/**
 * Componente que renderiza un póster de imagen en la terminal usando `chafa`.
 *
 * Si `chafa` no está disponible o no hay imagen, muestra un placeholder de texto.
 * Se usa tanto en la vista de detalles de reproducción (PlayDetails) como en el
 * panel de detalles de la biblioteca (MediaDetails).
 *
 * El renderizado es asíncrono y no bloqueante: si el usuario navega rápidamente
 * entre títulos, las peticiones de póster obsoletas se cancelan con
 * `AbortController` y solo se procesa el elemento actualmente seleccionado.
 */

import { Box, Text, useStdout } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { renderImageToAnsi } from '../../shared/terminalImage.js';
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
██╔══██╗██╔════╝████╗  ██║██║   ██║╚██╗██╔╝██║████╗ ████║██╔══██╗██╔══██╗
██████╔╝██████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝ ██║██║█████╔██║███████║██████╔╝
██╔═══╝ █████╝  ██║╚██╗██║██║   ██║ ██╔═██╗ ██║██║╚██╔╝██║██╔══██║██╔═══╝
██║     ███████╗██║ ╚████║╚██████╔╝██║  ██╗██║██║ ╚═╝ ██║██║  ██║██║
╚═════╝ ╚═════╝ ╚╝  ╚═══╝ ╚╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝
`.trim();

/** Componente que renderiza un póster de imagen en la terminal. */
export function PosterImage({
  imagePath,
  width = 30,
  height = 20,
}: PosterImageProps): React.JSX.Element {
  const [ansiArt, setAnsiArt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const { write } = useStdout();

  const renderPoster = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    // Cancelar cualquier petición de póster previa.
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    if (!imagePath) {
      setAnsiArt('');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const art = await renderImageToAnsi(imagePath, { width, height });
      // Si la petición fue cancelada (navegó a otro título), ignorar el resultado.
      if (abortController.signal.aborted || !mountedRef.current) return;

      if (art) {
        setAnsiArt(art);
        setLoading(false);
        // Forzar volcado inmediato a la terminal tras renderizar el póster.
        write('');
      } else {
        setAnsiArt('');
        setLoading(false);
      }
    } catch {
      if (abortController.signal.aborted || !mountedRef.current) return;
      setAnsiArt('');
      setLoading(false);
    }
  }, [imagePath, width, height, write]);

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

  if (ansiArt) {
    return (
      <Box borderStyle="round" borderColor={theme.border} flexShrink={0}>
        <Text>{ansiArt}</Text>
      </Box>
    );
  }

  // Fallback: chafa no disponible o error al renderizar → arte ASCII informativo.
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
      {FALLBACK_ASCII.split('\n').map((line, i) => (
        <Text key={i}>{theme.muted(`  ${line}`)}</Text>
      ))}
    </Box>
  );
}
