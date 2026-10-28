/**
 * Componente que renderiza un póster de imagen en la terminal.
 *
 * El póster se renderiza SIEMPRE dentro del flujo de Ink (dentro de un
 * `<Box>`), de modo que queda exactamente en la posición que el layout de
 * Ink le asigne. No se escriben secuencias gráficas fuera de Ink que
 * pudieran descolocarse al redibujar.
 *
 * Modos de renderizado:
 * - 'auto' (por defecto): usa Chafa dentro del Box de Ink. Posicionamiento
 *   perfecto, compatible con cualquier terminal.
 * - 'native': usa el Protocolo Gráfico de Kitty como overlay directo sobre
 *   stdout. Máxima calidad en Ghostty/Kitty/WezTerm, pero el posicionamiento
 *   es aproximado (esquina basada en `placement`) porque Ink no expone las
 *   coordenadas físicas de pantalla de sus componentes.
 * - 'symbols': usa Chafa forzosamente, ignorando la capacidad nativa.
 *
 * Cada vista puede controlar el modo y el placement mediante props, sin
 * modificar el protocolo gráfico.
 *
 * Ningún mensaje de depuración se escribe a stdout/stderr.
 */

import { Box, Text, useStdout } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { detectGraphicsCapability } from '../../shared/terminalCapabilities.js';
import { renderImageToAnsi } from '../../shared/terminalImage.js';
import { theme } from '../theme.js';

export type PosterImageProps = {
  /** Ruta local al archivo de imagen (póster cacheado). Puede ser null. */
  imagePath: string | null;
  /** Ancho del póster en caracteres de terminal. Si se omite, se calcula de forma responsiva. */
  width?: number;
  /** Alto del póster en caracteres de terminal. Si se omite, se calcula de forma responsiva. */
  height?: number;
  /** Modo de renderizado: 'auto', 'native' o 'symbols'. */
  mode?: 'auto' | 'native' | 'symbols';
  /** Posición relativa sugerida para el modo nativo (overlay). Ignorado en modo 'symbols'. */
  placement?: 'left' | 'right' | 'top';
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
 * Calcula una posición fija y predecible en la terminal para el modo nativo
 * (overlay). Se usa solo cuando el usuario fuerza `mode='native'`, porque
 * Ink no expone las coordenadas físicas de pantalla de sus componentes.
 *
 * @param width - Ancho del póster en celdas de terminal.
 * @param height - Alto del póster en celdas de terminal.
 * @param placement - Posición relativa sugerida.
 * @returns Coordenadas (x, y) absolutas de terminal.
 */
function computeNativePosition(
  width: number,
  height: number,
  placement: 'left' | 'right' | 'top' = 'right',
): { x: number; y: number } {
  const terminalCols: number = process.stdout.columns ?? 80;
  const terminalRows: number = process.stdout.rows ?? 24;

  let x: number;
  let y: number;

  switch (placement) {
    case 'left':
      x = Math.max(0, 1);
      y = Math.max(1, Math.floor(terminalRows / 4));
      break;
    case 'top':
      x = Math.max(0, Math.floor((terminalCols - width) / 2));
      y = Math.max(1, 1);
      break;
    case 'right':
    default:
      x = Math.max(0, terminalCols - width - 1);
      y = Math.max(1, Math.floor(terminalRows / 4));
      break;
  }

  // Limitar para no salirse de la pantalla.
  x = Math.min(x, Math.max(0, terminalCols - width));
  y = Math.min(y, Math.max(1, terminalRows - height));

  return { x, y };
}

/**
 * Componente modo nativo (Kitty SGP). Overlay directo sobre stdout con
 * coordenadas aproximadas. Solo se usa cuando el usuario fuerza
 * `mode='native'`.
 */
function NativePosterImage({
  imagePath,
  width,
  height,
  placement,
}: {
  imagePath: string;
  width: number;
  height: number;
  placement: 'left' | 'right' | 'top';
}): React.JSX.Element {
  const stdout = useStdout();
  const mountedRef = useRef(true);
  const imageIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideCursor = '\x1b[?25l';
  const showCursor = '\x1b[?25h';

  const drawPoster = useCallback(async (): Promise<void> => {
    const imageId: number = Math.floor(Math.random() * 100000);
    imageIdRef.current = imageId;

    const { x, y } = computeNativePosition(width, height, placement);
    const moveCursor = `\x1b[${y};${x}H`;

    try {
      stdout.write(hideCursor);
      stdout.write(moveCursor);
    } catch {
      // No hay nada más que hacer si no podemos escribir a stdout.
    }

    try {
      const sharpModule = await import('sharp');
      const sharpFn = sharpModule.default;
      const buffer = await sharpFn(imagePath)
        .resize(width * 16, height * 32, {
          fit: 'contain',
          kernel: sharpFn.kernel.lanczos3,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toFormat('png')
        .toBuffer();

      if (!mountedRef.current) return;

      const base64 = buffer.toString('base64');
      const CHUNK_SIZE = 4096;
      const chunks: string[] = [];
      for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
        chunks.push(base64.slice(i, i + CHUNK_SIZE));
      }

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index] ?? '';
        const isLast = index === chunks.length - 1;
        const message = isLast ? '0' : '1';
        const params = `a=T,f=100,t=d,c=${width},r=${height},i=${imageId},z=1,m=${message}`;
        const sequence = `\x1b_G${params};${chunk}\x1b\\`;

        try {
          if (index === 0) {
            stdout.write(moveCursor);
          }
          stdout.write(sequence);
        } catch {
          // Ignorar errores de escritura individual.
        }

        if (isLast) {
          try {
            stdout.write(showCursor);
          } catch {
            // No hay nada más que hacer.
          }
        }
      }
    } catch {
      try {
        stdout.write(showCursor);
      } catch {
        // No hay nada más que hacer.
      }
    }
  }, [imagePath, width, height, placement, stdout]);

  useEffect(() => {
    mountedRef.current = true;
    void drawPoster();

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Limpieza obligatoria: borrar la imagen por su ID.
      if (imageIdRef.current !== null) {
        try {
          stdout.write(`\x1b_Ga=d,d,i,i=${imageIdRef.current}\x1b\\`);
        } catch {
          // Si el borrado falla, se ignora.
        }
      }
      try {
        stdout.write(showCursor);
      } catch {
        // No hay nada más que hacer.
      }
    };
  }, [imagePath, width, height, placement, stdout, drawPoster]);

  // Return únicamente un placeholder vacío; la imagen se dibuja sobre él vía stdout.
  return (
    <Box borderColor="gray" borderStyle="round" flexShrink={0} height={height} width={width} />
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
  placement = 'right',
}: PosterImageProps): React.JSX.Element {
  const { width: posterWidth, height: posterHeight } = computePosterSize();
  const resolvedWidth: number = width ?? posterWidth;
  const resolvedHeight: number = height ?? posterHeight;

  const capability = detectGraphicsCapability();
  const useNative =
    mode === 'native' ||
    (mode === 'auto' &&
      capability === 'native' &&
      typeof imagePath === 'string' &&
      imagePath.length > 0);

  // Modo nativo: overlay sobre stdout con coordenadas aproximadas.
  // Solo se activa explícitamente o en terminales detectadas como nativas.
  if (useNative && typeof imagePath === 'string' && imagePath.length > 0) {
    return (
      <NativePosterImage
        imagePath={imagePath}
        width={resolvedWidth}
        height={resolvedHeight}
        placement={placement}
      />
    );
  }

  // Modo symbols: chafa dentro del Box de Ink (posicionamiento perfecto).
  return <ChafaPosterImage imagePath={imagePath} width={resolvedWidth} height={resolvedHeight} />;
}
