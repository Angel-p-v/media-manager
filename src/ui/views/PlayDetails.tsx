import { Box, Text, useApp, useInput } from 'ink';
import React, { useCallback, useMemo, useState } from 'react';

import { theme } from '../theme.js';

import type { MediaDetails as Details } from '../../core/library/service.js';

/** Pista de audio disponible (placeholder: la BD aún no almacena pistas reales). */
export type AudioTrack = {
  index: number;
  language: string;
  title: string | null;
};

/** Pista de subtítulo disponible (placeholder: la BD aún no almacena pistas reales). */
export type SubtitleTrack = {
  index: number;
  language: string;
  title: string | null;
};

/** Props de la vista de detalles de reproducción. */
export type PlayDetailsProps = {
  /** Título seleccionado en la biblioteca. */
  details: Details | null;
  /** Reproduce el fichero seleccionado (o el primero si no hay selección). */
  onPlay: (fileId: number) => void;
  /** Vuelve a la vista de biblioteca. */
  onBack: () => void;
};

/**
 * Vista de detalles de reproducción tipo Jellyfin.
 *
 * Diseño:
 * - Izquierda: póster (placeholder ASCII) y metadatos principales del título.
 * - Derecha: sinopsis, actores, selección de pista de audio y subtítulos,
 *   y listado de ficheros / episodios con selección.
 *
 * Notas:
 * - Las pistas de audio y subtítulos son estáticas por ahora porque la BD
 *   no almacena pistas por fichero (MediaFileRow no tiene esos campos).
 *   La selección se guarda en estado local y se pasa a `onPlay` por fileId.
 */
export function PlayDetails({ details, onPlay, onBack }: PlayDetailsProps): React.JSX.Element {
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

  // Pistas de audio y subtítulos estáticas (placeholder hasta que la BD las almacene).
  const audioTracks: readonly AudioTrack[] = useMemo(() => {
    const seen = new Set<string>();
    return files.flatMap((_file, fileIndex) => {
      const tracks: AudioTrack[] = [];
      for (let i = 0; i < 2; i++) {
        const key = `${fileIndex}-audio-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push({
          index: tracks.length,
          language: i === 0 ? 'Español' : 'Inglés',
          title: i === 0 ? 'Pista principal' : 'Pista secundaria',
        });
      }
      return tracks;
    });
  }, [files]);

  const subtitleTracks: readonly SubtitleTrack[] = useMemo(() => {
    const tracks: SubtitleTrack[] = [
      { index: 0, language: 'Ninguna', title: null },
      { index: 1, language: 'Español', title: null },
      { index: 2, language: 'Inglés', title: null },
    ];
    return tracks;
  }, []);

  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(0);

  const selectedFile = files[selectedFileIndex];
  const selectedAudio = audioTracks[selectedAudioIndex];
  const selectedSubtitle = subtitleTracks[selectedSubtitleIndex];

  const handlePlaySelected = useCallback((): void => {
    if (selectedFile === undefined) return;
    onPlay(selectedFile.id);
  }, [onPlay, selectedFile]);

  const handleBack = useCallback((): void => {
    onBack();
  }, [onBack]);

  // Teclas propias de esta vista: flechas para navegar ficheros/pistas, 'p' para reproducir,
  // 'q' o Escape para volver a la biblioteca.
  useInput((input: string, key: { escape?: boolean; ctrl?: boolean }): void => {
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

    // Navegación de ficheros / episodios con flechas arriba/abajo.
    if (input === '\u001b[A') {
      // Arriba
      setSelectedFileIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === '\u001b[B') {
      // Abajo
      setSelectedFileIndex((prev) => Math.min(Math.max(0, files.length - 1), prev + 1));
      return;
    }

    // Cambiar pista de audio con flechas izquierda/derecha.
    if (input === '\u001b[D') {
      // Izquierda
      setSelectedAudioIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === '\u001b[C') {
      // Derecha
      setSelectedAudioIndex((prev) => Math.min(audioTracks.length - 1, prev + 1));
      return;
    }

    // Cambiar pista de subtítulos con Mayús+izquierda/derecha.
    if (input === '\u001b[1;2D') {
      setSelectedSubtitleIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === '\u001b[1;2C') {
      setSelectedSubtitleIndex((prev) => Math.min(subtitleTracks.length - 1, prev + 1));
      return;
    }
  });

  return (
    <Box flexGrow={1} flexDirection="row">
      {/* ==================== Izquierda: póster ==================== */}
      <Box flexDirection="column" paddingX={1} paddingY={1} flexShrink={0}>
        <Box borderStyle="round" borderColor={theme.border} width={22} height={12} flexShrink={0}>
          <Text>{theme.muted('  [ PÓSTER ]')}</Text>
          <Text>{theme.muted('  (placeholder)')}</Text>
          <Text>{theme.muted('  sin portada')} </Text>
          <Text>{theme.muted('  descargada')} </Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            {theme.highlight(media.title)}
            {year}
          </Text>
          <Text>{theme.muted(`#${media.id} · ${typeLabel}`)}</Text>
          <Text>{theme.muted(media.folderPath)}</Text>
        </Box>
      </Box>

      {/* ==================== Derecha: detalles ==================== */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        <Box flexDirection="row" flexGrow={1}>
          {/* Columna principal: sinopsis y actores */}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text>{theme.label('Título')}</Text>
            <Text>{theme.value(`${media.title}${year}`)}</Text>
            <Text> </Text>

            <Text>{theme.label('Tipo')}</Text>
            <Text>{theme.value(typeLabel)}</Text>
            <Text> </Text>

            {media.year !== null && (
              <>
                <Text>{theme.label('Año')}</Text>
                <Text>{theme.value(String(media.year))}</Text>
                <Text> </Text>
              </>
            )}

            <Text>{theme.label('Sinopsis')}</Text>
            {files.length > 0 ? (
              <Text>{theme.value(`Serie con ${files.length} fichero(s) indexado(s).`)}</Text>
            ) : (
              <Text>
                {theme.muted('Sin sinopsis disponible. Pulsa «r» para obtener metadatos.')}
              </Text>
            )}
            <Text> </Text>

            <Text>{theme.label('Ficheros / episodios')}</Text>
            {files.length === 0 ? (
              <Text>{theme.muted('  sin ficheros indexados')}</Text>
            ) : (
              files.map((file, index) => {
                const active = index === selectedFileIndex;
                const season =
                  file.season === null ? '' : `T${String(file.season).padStart(2, '0')}`;
                const episode =
                  file.episode === null ? '' : `E${String(file.episode).padStart(2, '0')}`;
                const label = `${season}${episode}` || '—';
                return (
                  <Text key={file.id} bold={active} {...(active ? { color: 'cyan' as const } : {})}>
                    {`  ${active ? '▸ ' : '   '}${label.padEnd(8)} ${file.filePath}`}
                  </Text>
                );
              })
            )}
            {files.length > 8 && <Text>{theme.muted(`  … y ${files.length - 8} más`)}</Text>}
            <Text> </Text>
          </Box>

          {/* Columna secundaria: selección de pistas */}
          <Box flexDirection="column" flexShrink={0} paddingX={1}>
            <Text>{theme.label('Pista de audio')}</Text>
            {audioTracks.map((track) => {
              const active = track.index === selectedAudioIndex;
              return (
                <Text
                  key={`audio-${track.index}`}
                  bold={active}
                  {...(active ? { color: 'cyan' as const } : {})}
                >
                  {`  ${active ? '▸ ' : '   '}${track.language}${track.title ? ` - ${track.title}` : ''}`}
                </Text>
              );
            })}
            <Text> </Text>

            <Text>{theme.label('Pista de subtítulos')}</Text>
            {subtitleTracks.map((track) => {
              const active = track.index === selectedSubtitleIndex;
              return (
                <Text
                  key={`subtitle-${track.index}`}
                  bold={active}
                  {...(active ? { color: 'cyan' as const } : {})}
                >
                  {`  ${active ? '▸ ' : '   '}${track.language}`}
                </Text>
              );
            })}
            <Text> </Text>
          </Box>
        </Box>

        {/* Barra de estado inferior con hints de teclado */}
        <Box marginTop={1} paddingX={1}>
          <Text>{theme.muted('  [p] Reproducir')}</Text>
          <Text>{theme.muted('  [q/Esc] Volver a la biblioteca')}</Text>
          <Text>{theme.muted(`  Fichero: ${selectedFile?.filePath ?? '—'}`)}</Text>
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
