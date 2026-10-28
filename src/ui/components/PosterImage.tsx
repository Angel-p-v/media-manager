/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * Cuando el terminal soporta protocolo gráfico nativo (Ghostty, Kitty, WezTerm),
 * se implementa el Protocolo Gráfico de Kitty (SGP) de forma cruda en TypeScript
 * (sin librerías de terceros ni subprocesos). El componente:
 *
 * 1. Renderiza un <Box> vacío con borde para reservar espacio en el layout de Ink.
 * 2. En un useEffect, codifica la imagen a Base64, la fragmenta en bloques de
 *    4096 bytes y escribe las secuencias de escape directamente a stdout vía
 *    `useStdout()`, posicionando el cursor sobre el Box.
 * 3. Al desmontar o cambiar de imagen, envía obligatoriamente la secuencia de
 *    borrado de Kitty para ese ID único (evita artefactos flotantes).
 *
 * Cuando el terminal NO soporta gráficos nativos, usa chafa con
 * --format=symbols --symbols=sextant (fallback ANSI tradicional) y renderiza
 * el resultado como líneas de texto normales dentro del Box.
 */

import { Box, Text, useStdout } from 'ink';
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

/** Componente que renderiza un póster de imagen en la terminal. */
export function PosterImage({
  imagePath,
  width = 30,
  height = 20,
}: PosterImageProps): React.JSX.Element {
  const stdout = useStdout();
  const [poster, setPoster] = useState<{ output: string; format: GraphicsFormat } | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const imageIdRef = useRef<number | null>(null);
  const columns = process.stdout.columns ?? 80;

  // Offsets y márgenes para posicionamiento (configurables vía variables de entorno)
  const offsetX = Number(process.env.MEDIA_MANAGER_POSTER_OFFSET_X ?? '0');
  const offsetY = Number(process.env.MEDIA_MANAGER_POSTER_OFFSET_Y ?? '0');
  const marginRight = Number(process.env.MEDIA_MANAGER_POSTER_MARGIN_RIGHT ?? '1');

  // Cálculo de coordenadas absolutas para el overlay nativo (derecha superior)
  const posterX = Math.max(0, columns - width - marginRight) + offsetX;
  const posterY = Math.max(1, 1 + offsetY);

  const nativeFormat = detectNativeFormat();

  // ── Ruta nativa: protocolo gráfico de Kitty (crudo) ──────────────────────

  if (nativeFormat === 'native' && imagePath) {
    // Generar un ID único para esta imagen (se usa en el borrado al desmontar).
    const imageId = Math.floor(Math.random() * 10000);
    imageIdRef.current = imageId;

    // Bypass de Ink: escribir directamente a stdout para evitar que el Virtual
    // DOM de Ink corrompa los buffers de escape gráfico del protocolo Kitty.
    useEffect(() => {
      let cancelled = false;

      const run = async (): Promise<void> => {
        // Desacoplar del ciclo síncrono de render de Ink.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled || !mountedRef.current) return;

        try {
          const frames = await encodeKittyGraphic({
            imagePath,
            widthPx: width * 10, // aproximación: 10 px por columna
            heightPx: height * 20, // aproximación: 20 px por fila
            columns: width,
            rows: height,
            imageId,
          });

          if (cancelled || !mountedRef.current) return;

          const hideCursor = '\x1b[?25l';
          const showCursor = '\x1b[?25h';
          const moveCursor = `\x1b[${posterY};${posterX}H`;

          stdout.write(hideCursor);
          for (const frame of frames) {
            stdout.write(moveCursor + frame.sequence);
          }
          stdout.write(showCursor);
        } catch {
          // Si falla el codificado nativo, se queda sin póster (sin fallback a chafa
          // en modo nativo: el modo nativo es exclusivo de terminales gráficas).
        }
      };

      void run();

      return () => {
        cancelled = true;
        // CRÍTICO: borrar la imagen gráfica de Kitty para este ID al desmontar
        // o cambiar de imagen, evitando artefactos flotantes.
        if (imageIdRef.current !== null) {
          stdout.write(deleteKittyImage(imageIdRef.current));
        }
        stdout.write('\x1b[?25h');
      };
    }, [imagePath, width, height, posterX, posterY, imageId, stdout]);

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

  // ── Ruta fallback: chafa ANSI (modo símbolos) ────────────────────────────

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
