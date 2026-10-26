import { Box, Text, useApp, useInput } from 'ink';
import React, { useCallback, useMemo, useState } from 'react';

import { useKeymap } from '../hooks/useKeymap.js';
import { theme } from '../theme.js';

import type { MediaDetails as Details } from '../../core/library/service.js';

/** Pista de audio disponible (placeholder: la BD aún no almacena pistas reales). */
export type AudioTrack = {
  index: number;
  language: string;
};

/** Pista de subtítulo disponible (placeholder: la BD aún no almacena pistas reales). */
export type SubtitleTrack = {
  index: number;
  language: string;
};

/** Props de la vista de detalles de reproducción. */
export type PlayDetailsProps = {
  /** Título seleccionado en la biblioteca. */
  details: Details | null;
  /** Reproduce el fichero seleccionado. */
  onPlay: (fileId: number) => void;
  /** Vuelve a la vista de biblioteca. */
  onBack: () => void;
};

/**
 * Vista de detalles de reproducción tipo Jellyfin.
 *
 * Diseño:
 * - Izquierda: póster (placeholder) y metadatos principales del título.
 * - Derecha: sinopsis, listado de episodios con selección (↑↓),
 *   selección de pista de audio (←→) y subtítulos (Mayús+←→).
 *
 * Navegación:
 * - ↑ / ↓ : navega por los episodios/ficheros
 * - ← / → : navega por las pistas de audio
 * - Mayús+← / Mayús+→ : navega por las pistas de subtítulos
 * - p : reproduce el fichero seleccionado
 * - q / Esc : vuelve a la biblioteca
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

  // Pistas de audio únicas (una por idioma, sin duplicar por cada episodio).
  const audioTracks: readonly AudioTrack[] = useMemo(() => {
    const tracks: AudioTrack[] = [
      { index: 0, language: 'Español' },
      { index: 1, language: 'Inglés' },
    ];
    return tracks;
  }, []);

  const subtitleTracks: readonly SubtitleTrack[] = useMemo(() => {
    const tracks: SubtitleTrack[] = [
      { index: 0, language: 'Ninguna' },
      { index: 1, language: 'Español' },
      { index: 2, language: 'Inglés' },
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

  // Navegación por teclado dentro de esta vista. useKeymap es más fiable que
  // useInput para las flechas direccionales en el entorno de terminal.
  useKeymap(
    { up: 'up', down: 'down', left: 'left', right: 'right' },
    {
      up: () => setSelectedFileIndex((prev) => Math.max(0, prev - 1)),
      down: () => setSelectedFileIndex((prev) => Math.min(Math.max(0, files.length - 1), prev + 1)),
      left: () => setSelectedAudioIndex((prev) => Math.max(0, prev - 1)),
      right: () => setSelectedAudioIndex((prev) => Math.min(audioTracks.length - 1, prev + 1)),
    },
    true,
  );

  // Teclas simples y combinaciones con Mayús que no encajan en useKeymap.
  useInput((input: string, key: { escape?: boolean; ctrl?: boolean; shift?: boolean }): void => {
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

    // Navegación de pistas de subtítulos con Mayús+flechas izquierda/derecha.
    if (key.shift && input === '\u001b[D') {
      setSelectedSubtitleIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.shift && input === '\u001b[C') {
      setSelectedSubtitleIndex((prev) => Math.min(subtitleTracks.length - 1, prev + 1));
      return;
    }
  });

  // Nombre corto del fichero (sin ruta absoluta).
  const fileName = selectedFile ? (selectedFile.filePath.split('/').pop() ?? '—') : '—';

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
              {theme.label('Episodios / ficheros')} {theme.muted(`(↑↓ navegan)`)}
            </Text>
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
                const fileName = file.filePath.split('/').pop() ?? file.filePath;
                return (
                  <Text key={file.id} bold={active} {...(active ? { color: 'cyan' as const } : {})}>
                    {`  ${active ? '▸ ' : '   '}${label.padEnd(8)} ${fileName}`}
                  </Text>
                );
              })
            )}
            {files.length > 8 && <Text>{theme.muted(`  … y ${files.length - 8} más`)}</Text>}
            <Text> </Text>
          </Box>

          {/* Columna secundaria: selección de pistas */}
          <Box flexDirection="column" flexShrink={0} paddingX={1}>
            <Text>
              {theme.label('Pista de audio')} {theme.muted(`(←→)`)}
            </Text>
            {audioTracks.map((track) => {
              const active = track.index === selectedAudioIndex;
              return (
                <Text
                  key={`audio-${track.index}`}
                  bold={active}
                  {...(active ? { color: 'cyan' as const } : {})}
                >
                  {`  ${active ? '▸ ' : '   '}${track.language}`}
                </Text>
              );
            })}
            <Text> </Text>

            <Text>
              {theme.label('Pista de subtítulos')} {theme.muted(`(Mayús+←→)`)}
            </Text>
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
