/**
 * Componente que renderiza un póster de imagen en la terminal usando `chafa`.
 *
 * Si `chafa` no está disponible o no hay imagen, muestra un placeholder de texto.
 * Se usa tanto en la vista de detalles de reproducción (PlayDetails) como en el
 * panel de detalles de la biblioteca (MediaDetails).
 */

import { Box, Text } from 'ink';
import React, { useCallback, useEffect, useState } from 'react';

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

/** Componente que renderiza un póster de imagen en la terminal. */
export function PosterImage({
  imagePath,
  width = 22,
  height = 12,
}: PosterImageProps): React.JSX.Element {
  const [ansiArt, setAnsiArt] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const renderPoster = useCallback(async (): Promise<void> => {
    if (!imagePath) {
      setAnsiArt('');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const art = await renderImageToAnsi(imagePath, { width, height });
      setAnsiArt(art);
    } catch {
      setAnsiArt('');
    } finally {
      setLoading(false);
    }
  }, [imagePath, width, height]);

  useEffect(() => {
    void renderPoster();
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
        <Text>{theme.muted('  descargando…')}</Text>
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

  // Fallback: chafa no disponible o error al renderizar
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      width={width}
      height={height}
      flexShrink={0}
    >
      <Text>{theme.muted('  [ PÓSTER ]')}</Text>
      <Text>{theme.muted('  (chafa no disponible)')}</Text>
      <Text>{theme.muted(`  ${imagePath}`)}</Text>
    </Box>
  );
}
