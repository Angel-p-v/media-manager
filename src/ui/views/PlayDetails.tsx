import { Box, Text, useApp, useInput } from 'ink';
import React, { useCallback, useEffect, useState } from 'react';

import { readVideoMediaInfo } from '../../core/video/ffprobe.js';
import { PosterImage } from '../components/PosterImage.js';
import { theme } from '../theme.js';

import type { MediaFileRow } from '../../core/db/types.js';
import type { MediaDetails as Details, LibraryService } from '../../core/library/service.js';

/** Número máximo de episodios visibles por página en la lista. */
const EPISODES_PER_PAGE = 12;

/** Pista de audio real extraída de los metadatos del fichero de vídeo. */
export type RealAudioTrack = {
  index: number;
  language: string;
  codec: string;
  channels: number | null;
  sampleRate: string | null;
  title: string | null;
};

/** Pista de subtítulo real extraída de los metadatos del fichero de vídeo. */
export type RealSubtitleTrack = {
  index: number;
  language: string;
  codec: string;
  title: string | null;
};

/** Props de la vista de detalles de reproducción. */
export type PlayDetailsProps = {
  /** Título seleccionado en la biblioteca. */
  details: Details | null;
  /** Servicio de biblioteca (para obtener metadatos y pósters cacheados). */
  library: LibraryService;
  /** Reproduce el fichero seleccionado con las pistas de audio/subtítulo elegidas. */
  onPlay: (input: {
    fileId: number;
    audioTrackIndex: number | null;
    subtitleTrackIndex: number | null;
  }) => void;
  /** Vuelve a la vista de biblioteca. */
  onBack: () => void;
};

/**
 * Vista de detalles de reproducción tipo Jellyfin.
 *
 * Diseño:
 * - Izquierda: póster (placeholder) y metadatos principales del título.
 * - Derecha: sinopsis, listado de episodios con paginación (máx. 12 por página,
 *   scroll al navegar más allá), selección de pista de audio (←→) y subtítulos
 *   (Mayús+←→).
 *
 * Los idiomas de audio y subtítulos se extraen de los metadatos reales de cada
 * fichero de vídeo mediante ffprobe, no se infieren del nombre de archivo.
 *
 * Navegación:
 * - ↑ / ↓ : navega por los episodios/ficheros (con paginación de 12)
 * - ← / → : navega por las pistas de audio detectadas
 * - Mayús+← / Mayús+→ : navega por las pistas de subtítulos detectadas
 * - p : reproduce el fichero seleccionado con las pistas elegidas
 * - q / Esc : vuelve a la biblioteca
 */
export function PlayDetails({
  details,
  library,
  onPlay,
  onBack,
}: PlayDetailsProps): React.JSX.Element {
  const { exit } = useApp();

  if (details === null) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        <Text>{theme.error('No se cargaron los detalles del título.')}</Text>
        <Text>{theme.muted('Vuelve a la biblioteca y selecciona un título.')}</Text>
      </Box>
    );
  }

  const { media, files } = details;
  const year = media.year === null ? '' : ` (${media.year})`;
  const typeLabel =
    media.type === 'series' ? 'serie' : media.type === 'anime' ? 'anime' : 'película';

  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [visibleStart, setVisibleStart] = useState(0);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(null);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | null>(null);
  const [audioTracks, setAudioTracks] = useState<readonly RealAudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<readonly RealSubtitleTrack[]>([]);
  const [videoCodec, setVideoCodec] = useState<string | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  /** Ruta local al póster cacheado del título (si existe). */
  const [posterPath, setPosterPath] = useState<string | null>(null);

  const selectedFile = files[selectedFileIndex];
  const selectedAudio = audioTracks[selectedAudioIndex ?? -1];
  const selectedSubtitle = subtitleTracks[selectedSubtitleIndex ?? -1];

  const handlePlaySelected = useCallback((): void => {
    if (selectedFile === undefined) return;
    onPlay({
      fileId: selectedFile.id,
      audioTrackIndex: selectedAudioIndex,
      subtitleTrackIndex: selectedSubtitleIndex,
    });
  }, [onPlay, selectedFile, selectedAudioIndex, selectedSubtitleIndex]);

  const handleBack = useCallback((): void => {
    onBack();
  }, [onBack]);

  /** Carga los metadatos reales (audio/subtítulos/vídeo) del fichero seleccionado con ffprobe. */
  const loadFileMetadata = useCallback(async (file: MediaFileRow | undefined): Promise<void> => {
    if (file === undefined) {
      setAudioTracks([]);
      setSubtitleTracks([]);
      setVideoCodec(null);
      setVideoWidth(null);
      setVideoHeight(null);
      setSelectedAudioIndex(null);
      setSelectedSubtitleIndex(null);
      return;
    }

    setLoadingMetadata(true);
    setMetadataError(null);
    try {
      const info = await readVideoMediaInfo(file.filePath);
      setAudioTracks(info.audioTracks);
      setSubtitleTracks(info.subtitleTracks);
      setVideoCodec(info.videoCodec);
      setVideoWidth(info.videoWidth);
      setVideoHeight(info.videoHeight);
      // Seleccionar la primera pista de audio y "Ninguna" para subtítulos por defecto
      setSelectedAudioIndex(info.audioTracks.length > 0 ? 0 : null);
      setSelectedSubtitleIndex(null);
    } catch (error) {
      setMetadataError(
        error instanceof Error ? error.message : 'No se pudieron leer los metadatos.',
      );
      setAudioTracks([]);
      setSubtitleTracks([]);
      setVideoCodec(null);
      setVideoWidth(null);
      setVideoHeight(null);
      setSelectedAudioIndex(null);
      setSelectedSubtitleIndex(null);
    } finally {
      setLoadingMetadata(false);
    }
  }, []);

  // Cargar metadatos del fichero seleccionado cuando cambia.
  useEffect(() => {
    void loadFileMetadata(selectedFile);
  }, [selectedFile, loadFileMetadata]);

  // Obtener el póster cacheado del título cuando cambian los detalles.
  useEffect(() => {
    if (details === null) {
      setPosterPath(null);
      return;
    }
    const saved = library.getMetadata(details.media.id);
    setPosterPath(saved?.localPosterPath ?? null);
  }, [details, library]);

  /** Ajusta la ventana visible para que el índice seleccionado siempre esté visible. */
  const ensureVisible = useCallback(
    (nextIndex: number): void => {
      setSelectedFileIndex(nextIndex);
      const pageEnd = visibleStart + EPISODES_PER_PAGE;
      if (nextIndex < visibleStart) {
        setVisibleStart(Math.max(0, nextIndex));
      } else if (nextIndex >= pageEnd) {
        setVisibleStart(nextIndex - EPISODES_PER_PAGE + 1);
      }
    },
    [visibleStart],
  );

  // Navegación por teclado dentro de esta vista.
  // Se usa useInput en lugar de useKeymap para poder distinguir
  // Mayús+flecha (subtítulos) de flecha simple (audio).
  useInput(
    (
      input: string,
      key: {
        escape?: boolean;
        ctrl?: boolean;
        shift?: boolean;
        leftArrow?: boolean;
        rightArrow?: boolean;
        upArrow?: boolean;
        downArrow?: boolean;
      },
    ): void => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (key.escape || input === 'q') {
        handleBack();
        return;
      }

      if (input === 'p') {
        handlePlaySelected();
        return;
      }

      // Navegación de episodios con flechas arriba/abajo.
      if (key.upArrow || input === '\u001b[A') {
        ensureVisible(Math.max(0, selectedFileIndex - 1));
        return;
      }
      if (key.downArrow || input === '\u001b[B') {
        ensureVisible(Math.min(files.length - 1, selectedFileIndex + 1));
        return;
      }

      // Navegación de pistas de audio con flechas izquierda/derecha (sin shift).
      if (!key.shift && (key.leftArrow || input === '\u001b[D')) {
        setSelectedAudioIndex((prev) =>
          prev === null || prev <= 0 ? null : Math.max(0, prev - 1),
        );
        return;
      }
      if (!key.shift && (key.rightArrow || input === '\u001b[C')) {
        setSelectedAudioIndex((prev) =>
          prev === null
            ? audioTracks.length > 0
              ? 0
              : null
            : Math.min(audioTracks.length - 1, prev + 1),
        );
        return;
      }

      // Navegación de pistas de subtítulos con Mayús+flechas izquierda/derecha.
      if (key.shift && (key.leftArrow || input === '\u001b[D')) {
        setSelectedSubtitleIndex((prev) =>
          prev === null || prev <= 0 ? null : Math.max(0, prev - 1),
        );
        return;
      }
      if (key.shift && (key.rightArrow || input === '\u001b[C')) {
        setSelectedSubtitleIndex((prev) =>
          prev === null
            ? subtitleTracks.length > 0
              ? 0
              : null
            : Math.min(subtitleTracks.length - 1, prev + 1),
        );
        return;
      }
    },
  );

  // Nombre corto del fichero (sin ruta absoluta).
  const fileName = selectedFile ? (selectedFile.filePath.split('/').pop() ?? '—') : '—';

  // Ventana visible de episodios (paginación de 12).
  const visibleFiles = files.slice(visibleStart, visibleStart + EPISODES_PER_PAGE);
  const totalPages = Math.ceil(files.length / EPISODES_PER_PAGE);
  const currentPage = Math.floor(selectedFileIndex / EPISODES_PER_PAGE) + 1;

  return (
    <Box flexGrow={1} flexDirection="row">
      {/* ==================== Izquierda: póster ==================== */}
      <Box flexDirection="column" paddingX={1} paddingY={1} flexShrink={0}>
        <PosterImage imagePath={posterPath} width={22} height={12} />
        <Box marginTop={1}>
          <Text>
            {theme.highlight(media.title)}
            {year}
          </Text>
          <Text>{theme.muted(`#${media.id} · ${typeLabel}`)}</Text>
        </Box>
      </Box>

      {/* ==================== Derecha: detalles ==================== */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        <Box flexDirection="row" flexGrow={1}>
          {/* Columna principal: metadatos y episodios */}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text>{theme.label('Título')}</Text>
            <Text>{theme.value(`${media.title}${year}`)}</Text>
            <Text> </Text>

            <Text>{theme.label('Tipo')}</Text>
            <Text>{theme.value(typeLabel)}</Text>
            <Text> </Text>
            {videoCodec !== null && (
              <>
                <Text>{theme.label('Códec vídeo')}</Text>
                <Text>
                  {theme.value(
                    videoCodec +
                      (videoWidth !== null && videoHeight !== null
                        ? ` ${videoWidth}x${videoHeight}`
                        : ''),
                  )}
                </Text>
                <Text> </Text>
              </>
            )}

            {media.year !== null && (
              <>
                <Text>{theme.label('Año')}</Text>
                <Text>{theme.value(String(media.year))}</Text>
                <Text> </Text>
              </>
            )}

            <Text>{theme.label('Sinopsis')}</Text>
            <Text>
              {files.length > 0
                ? theme.value(`Serie con ${files.length} fichero(s) indexado(s).`)
                : theme.muted('Sin sinopsis disponible. Pulsa «r» para obtener metadatos.')}
            </Text>
            <Text> </Text>

            <Text>
              {theme.label('Episodios / ficheros')}{' '}
              {theme.muted(`(↑↓ navegan · pág ${currentPage}/${totalPages})`)}
            </Text>
            {files.length === 0 ? (
              <Text>{theme.muted('  sin ficheros indexados')}</Text>
            ) : (
              visibleFiles.map((file, relativeIndex) => {
                const absoluteIndex = visibleStart + relativeIndex;
                const active = absoluteIndex === selectedFileIndex;
                const season =
                  file.season === null ? '' : `T${String(file.season).padStart(2, '0')}`;
                const episode =
                  file.episode === null ? '' : `E${String(file.episode).padStart(2, '0')}`;
                const label = `${season}${episode}` || '—';
                const fileName = file.filePath.split('/').pop() ?? file.filePath;
                return (
                  <Text key={file.id} bold={active} {...(active ? { color: 'cyan' as const } : {})}>
                    {`  ${active ? '▸ ' : '   '}${label.padEnd(8)} ${fileName}`}
                  </Text>
                );
              })
            )}
            {files.length > EPISODES_PER_PAGE && (
              <Text>
                {theme.muted(
                  `  ${files.length - visibleFiles.length} más (pág ${currentPage}/${totalPages})`,
                )}
              </Text>
            )}
            <Text> </Text>
          </Box>

          {/* Columna secundaria: selección de pistas */}
          <Box flexDirection="column" flexShrink={0} paddingX={1}>
            {loadingMetadata ? (
              <>
                <Text>
                  {theme.label('Pista de audio')} {theme.muted('(←→)')}
                </Text>
                <Text>{theme.muted('  cargando metadatos…')}</Text>
                <Text> </Text>
                <Text>
                  {theme.label('Pista de subtítulos')} {theme.muted('(Mayús+←→)')}
                </Text>
                <Text>{theme.muted('  cargando metadatos…')}</Text>
                <Text> </Text>
              </>
            ) : metadataError !== null ? (
              <>
                <Text>
                  {theme.label('Pista de audio')} {theme.muted('(←→)')}
                </Text>
                <Text>{theme.error(`  error: ${metadataError}`)}</Text>
                <Text> </Text>
                <Text>
                  {theme.label('Pista de subtítulos')} {theme.muted('(Mayús+←→)')}
                </Text>
                <Text>{theme.error(`  error: ${metadataError}`)}</Text>
                <Text> </Text>
              </>
            ) : (
              <>
                <Text>
                  {theme.label('Pista de audio')} {theme.muted('(←→)')}
                </Text>
                {audioTracks.length === 0 ? (
                  <Text>{theme.muted('  sin pistas de audio detectadas')}</Text>
                ) : (
                  audioTracks.map((track) => {
                    const active = track.index === selectedAudioIndex;
                    return (
                      <Text
                        key={`audio-${track.index}`}
                        bold={active}
                        {...(active ? { color: 'cyan' as const } : {})}
                      >
                        {`  ${active ? '▸ ' : '   '}${track.language} (${track.codec}${
                          track.channels !== null ? ` ${track.channels}ch` : ''
                        }${track.sampleRate ? ` ${track.sampleRate}Hz` : ''}${
                          track.title ? ` - ${track.title}` : ''
                        })`}
                      </Text>
                    );
                  })
                )}
                <Text> </Text>

                <Text>
                  {theme.label('Pista de subtítulos')} {theme.muted('(Mayús+←→)')}
                </Text>
                {subtitleTracks.length === 0 ? (
                  <Text>{theme.muted('  sin pistas de subtítulos detectadas')}</Text>
                ) : (
                  subtitleTracks.map((track) => {
                    const active = track.index === selectedSubtitleIndex;
                    return (
                      <Text
                        key={`subtitle-${track.index}`}
                        bold={active}
                        {...(active ? { color: 'cyan' as const } : {})}
                      >
                        {`  ${active ? '▸ ' : '   '}${track.language} (${track.codec}${
                          track.title ? ` - ${track.title}` : ''
                        })`}
                      </Text>
                    );
                  })
                )}
                <Text> </Text>
              </>
            )}
          </Box>
        </Box>

        {/* Barra de estado inferior con hints de teclado */}
        <Box marginTop={1} paddingX={1}>
          <Text>{theme.muted('  [p] Reproducir')}</Text>
          <Text>{theme.muted('  [q/Esc] Volver a la biblioteca')}</Text>
          <Text>{theme.muted(`  Fichero: ${fileName}`)}</Text>
          <Text>
            {theme.muted(
              `  Audio: ${selectedAudio?.language ?? '—'}  ·  Subtítulos: ${selectedSubtitle?.language ?? '—'}`,
            )}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
