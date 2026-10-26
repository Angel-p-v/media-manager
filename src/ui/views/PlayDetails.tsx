import { Box, Text, useApp, useInput } from 'ink';
import React, { useCallback, useMemo, useState } from 'react';

import { useKeymap } from '../hooks/useKeymap.js';
import { theme } from '../theme.js';

import type { MediaDetails as Details } from '../../core/library/service.js';

/** Pista de audio disponible (extraída de los nombres de fichero). */
export type AudioTrack = {
  index: number;
  language: string;
};

/** Pista de subtítulo disponible (extraída de los nombres de fichero). */
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

/** Patrón de código de idioma (2 o 3 letras) en el nombre de un fichero. */
const LANGUAGE_PATTERN =
  /(?:^|[._-])(es|spa|en|eng|fr|fra|de|ger|it|ita|pt|por|ca|cat|nl|nld|ja|jpn|ko|kor|zh|zh-cn|zh-tw|ru|rus|ar|ara|hi|hin|tr|tur|pl|pol|sv|swe|da|dan|no|nor|fi|fin|el|ell|he|heb|uk|ukr|cs|ces|sk|slk|hu|ro|ron|bg|bul|hr|hrv|sr|srp|lt|lit|lv|lav|et|sl|slv|mk|sq|alb|is|isl|ga|gle|cy|cym|eo|vi|vie|th|tha|ms|msa|id|ind|tl|af|afr)(?:[._-]|$)/i;

/** Mapa de códigos de idioma a nombres legibles. */
const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Español',
  spa: 'Español',
  en: 'Inglés',
  eng: 'Inglés',
  fr: 'Francés',
  fra: 'Francés',
  de: 'Alemán',
  ger: 'Alemán',
  it: 'Italiano',
  ita: 'Italiano',
  pt: 'Portugués',
  por: 'Portugués',
  ca: 'Catalán',
  cat: 'Catalán',
  nl: 'Neerlandés',
  nld: 'Neerlandés',
  ja: 'Japonés',
  jpn: 'Japonés',
  ko: 'Coreano',
  kor: 'Coreano',
  zh: 'Chino',
  'zh-cn': 'Chino (simplificado)',
  'zh-tw': 'Chino (tradicional)',
  ru: 'Ruso',
  rus: 'Ruso',
  ar: 'Árabe',
  ara: 'Árabe',
  hi: 'Hindi',
  hin: 'Hindi',
  tr: 'Turco',
  tur: 'Turco',
  pl: 'Polaco',
  pol: 'Polaco',
  sv: 'Sueco',
  swe: 'Sueco',
  da: 'Danés',
  dan: 'Danés',
  no: 'Noruego',
  nor: 'Noruego',
  fi: 'Finlandés',
  fin: 'Finlandés',
  el: 'Griego',
  ell: 'Griego',
  he: 'Hebreo',
  heb: 'Hebreo',
  uk: 'Ucraniano',
  ukr: 'Ucraniano',
  cs: 'Checo',
  ces: 'Checo',
  sk: 'Eslovaco',
  slk: 'Eslovaco',
  hu: 'Húngaro',
  ro: 'Rumano',
  ron: 'Rumano',
  bg: 'Búlgaro',
  bul: 'Búlgaro',
  hr: 'Croata',
  hrv: 'Croata',
  sr: 'Serbio',
  srp: 'Serbio',
  lt: 'Lituano',
  lit: 'Lituano',
  lv: 'Letón',
  lav: 'Letón',
  et: 'Estonio',
  sl: 'Esloveno',
  slv: 'Esloveno',
  mk: 'Macedonio',
  sq: 'Albanés',
  alb: 'Albanés',
  is: 'Islandés',
  isl: 'Islandés',
  ga: 'Irlandés',
  gle: 'Irlandés',
  cy: 'Galés',
  cym: 'Galés',
  eo: 'Esperanto',
  vi: 'Vietnamita',
  vie: 'Vietnamita',
  th: 'Tailandés',
  tha: 'Tailandés',
  ms: 'Malaio',
  msa: 'Malaio',
  id: 'Indonesio',
  ind: 'Indonesio',
  tl: 'Tagalo',
  af: 'Afrikáans',
  afr: 'Afrikáans',
};

/** Extrae el código de idioma de un nombre de fichero, si lo trae. */
function extractLanguageCode(filePath: string): string | null {
  const baseName = filePath.split('/').pop() ?? '';
  const match = LANGUAGE_PATTERN.exec(baseName);
  if (match === null) return null;
  const code = match[1];
  if (code === undefined) return null;
  return code.toLowerCase();
}

/** Resuelve el nombre legible de un código de idioma. */
function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/**
 * Vista de detalles de reproducción tipo Jellyfin.
 *
 * Diseño:
 * - Izquierda: póster (placeholder) y metadatos principales del título.
 * - Derecha: sinopsis, listado de episodios (máx. 8 visibles + resumen),
 *   selección de pista de audio (←→) y subtítulos (Mayús+←→).
 *
 * Los idiomas de audio y subtítulos se extraen de los nombres de fichero
 * de los episodios mostrados, no son estáticos.
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

  // Idiomas únicos extraídos de los nombres de fichero de los episodios.
  const audioTracks: readonly AudioTrack[] = useMemo(() => {
    const codes = new Set<string>();
    for (const file of files) {
      const code = extractLanguageCode(file.filePath);
      if (code !== null) codes.add(code);
    }
    // Siempre añadir "Detectado automáticamente" si no hay ninguno.
    if (codes.size === 0) codes.add('auto');
    return Array.from(codes).map((code, index) => ({
      index,
      language: code === 'auto' ? 'Detectado automáticamente' : languageName(code),
    }));
  }, [files]);

  const subtitleTracks: readonly SubtitleTrack[] = useMemo(() => {
    const codes = new Set<string>();
    for (const file of files) {
      const code = extractLanguageCode(file.filePath);
      if (code !== null) codes.add(code);
    }
    // Siempre incluir "Ninguna" como primera opción.
    codes.add('none');
    return Array.from(codes).map((code, index) => ({
      index,
      language: code === 'none' ? 'Ninguna' : languageName(code),
    }));
  }, [files]);

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

  // Navegación por teclado dentro de esta vista.
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
    // La secuencia de escape de Mayús+flecha es \u001b[1;2D / \u001b[1;2C.
    if (key.shift && input === '\u001b[1;2D') {
      setSelectedSubtitleIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.shift && input === '\u001b[1;2C') {
      setSelectedSubtitleIndex((prev) => Math.min(subtitleTracks.length - 1, prev + 1));
      return;
    }
  });

  // Nombre corto del fichero (sin ruta absoluta).
  const fileName = selectedFile ? (selectedFile.filePath.split('/').pop() ?? '—') : '—';

  // Solo mostrar los primeros 8 archivos; el resto se resume.
  const visibleFiles = files.slice(0, 8);
  const hiddenCount = files.length - 8;

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
              visibleFiles.map((file, index) => {
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
            {hiddenCount > 0 && <Text>{theme.muted(`  … y ${hiddenCount} más`)}</Text>}
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
