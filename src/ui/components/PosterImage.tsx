/**
 * Componente que renderiza un póster de imagen en la terminal usando `chafa`.
 *
 * Si `chafa` no está disponible o no hay imagen, muestra un placeholder de texto.
 * Se usa tanto en la vista de detalles de reproducción (PlayDetails) como en el
 * panel de detalles de la biblioteca (MediaDetails).
 *
 * El renderizado es totalmente asíncrono y desacoplado del ciclo de render de Ink:
 * - Al cambiar el título seleccionado, la UI se actualiza inmediatamente y el
 *   póster muestra "[ Cargando póster…]" mientras chafa se ejecuta en segundo
 *   plano.
 * - Las peticiones de chafa obsoletas se cancelan con AbortController: si el
 *   usuario navega a otro título antes de que chafa termine, el resultado se
 *   descarta sin bloquear la navegación con el teclado.
 *
 * Soporta dos modos de renderizado:
 * 1. **Protocolo gráfico nativo (Kitty SGP)**: Cuando el terminal lo soporta
 *    (Ghostty, Kitty, WezTerm, etc.), se ejecuta `chafa -f kitty` y la salida
 *    se escribe directamente a stdout (bypasseando el Virtual DOM de Ink) para
 *    evitar que Ink corrompa los buffers de escape gráfico.
 * 2. **Modo símbolos ANSI**: Fallback para terminales tradicionales. Usa
 *    `--symbols=sextant` (6 sub-píxeles por carácter) para máxima resolución
 *    en modo texto.
 */

import { Box, Text, useStdout } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { renderImageToAnsi, type GraphicsFormat } from '../../shared/terminalImage.js';
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
██╔══██╗██╔════╝████╗  ██║██║   ██║╚██╗██╔╝██║████╗ ███║██╔══██╗██╔══██╗
██████╔╝██████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝ ██║██║█████╔██║███████║██████╔╝
██╔═══╝ █████╝  ██║╚██╗██║██║   ██║ ██╔═██╗ ██║██║╚██╔╝██║██╔══██║██╔═══╝
██║     ███████╗██║ ╚██║╚██████╔╝██║  ██╗██║██║ ╚═╝ ██║██║  ██║██║
╚═════╝ ╚═════╝ ╚╝  ⚐╝╚╝  ⚐╝╚═╝     ⚐═╝╚═╝  ⚐╝
`.trim();

/** Componente que renderiza un póster de imagen en la terminal. */
export function PosterImage({
  imagePath,
  width = 30,
  height = 20,
}: PosterImageProps): React.JSX.Element {
  const [poster, setPoster] = useState<{ output: string; format: GraphicsFormat } | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const { write } = useStdout();

  // Offsets para posicionar el gráfico nativo sobre el Box del póster.
  // Se pueden ajustar mediante variables de entorno si el layout cambia.
  const offsetX = Number(process.env.MEDIA_MANAGER_POSTER_OFFSET_X ?? '0');
  const offsetY = Number(process.env.MEDIA_MANAGER_POSTER_OFFSET_Y ?? '0');

  const renderPoster = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    // Cancelar cualquier petición de chafa previa inmediatamente.
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    if (!imagePath) {
      setPoster(null);
      setLoading(false);
      return;
    }

    // Estado inmediato: mostrar "[ Cargando póster…]" sin esperar a chafa.
    setLoading(true);

    // Desacoplar del ciclo síncrono de render de Ink. Esto permite que la UI
    // procese la siguiente tecla (flecha arriba/abajo) antes de que chafa
    // empiece a consumir CPU.
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (!mountedRef.current || abortController.signal.aborted) return;

    try {
      const result = await renderImageToAnsi(imagePath, {
        width,
        height,
        signal: abortController.signal,
      });
      // Si la petición fue cancelada (navegó a otro título), ignorar el resultado.
      if (abortController.signal.aborted || !mountedRef.current) return;

      if (result.output) {
        setPoster(result);
        setLoading(false);
        // Forzar volcado inmediato a la terminal tras renderizar el póster.
        write('');
      } else {
        setPoster(null);
        setLoading(false);
      }
    } catch {
      if (abortController.signal.aborted || !mountedRef.current) return;
      setPoster(null);
      setLoading(false);
    }
  }, [imagePath, width, height, write]);

  useEffect(() => {
    mountedRef.current = true;
    // Lanzar renderizado sin await: la UI no debe bloquearse esperando chafa.
    void renderPoster();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [renderPoster]);

  // Bypass de Ink para protocolo gráfico nativo (Kitty SGP).
  // Escribir directamente a stdout para evitar que el Virtual DOM de Ink
  // corrompa los buffers de escape gráfico.
  useEffect(() => {
    if (!poster?.output || poster.format !== 'kitty') return;

    const hideCursor = '\x1b[?25l';
    const showCursor = '\x1b[?25h';
    // Posicionar cursor en la esquina superior izquierda del Box interior.
    // Los offsets se pueden ajustar mediante variables de entorno.
    const moveCursor = `\x1b[${1 + offsetY};${1 + offsetX}H`;
    write(hideCursor);
    write(moveCursor);
    write(poster.output);
    write(showCursor);
    // No hay limpieza necesaria: el gráfico persiste hasta que se re-renderice.
  }, [poster?.output, poster?.format, offsetX, offsetY, write]);

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
    const { format } = poster;

    // Protocolo gráfico nativo (Kitty SGP): renderizar Box vacío con borde.
    // El gráfico se escribe directamente a stdout en el useEffect de arriba.
    if (format === 'kitty') {
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

    // Modo símbolos ANSI: dividir por líneas para evitar interlineado intercalado
    // en Ink. Cada línea se renderiza en un <Text> independiente.
    const lines = poster.output.split('\n');
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
        {lines.map((line, index) => (
          <Text key={index} wrap="truncate-end">
            {line}
          </Text>
        ))}
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
