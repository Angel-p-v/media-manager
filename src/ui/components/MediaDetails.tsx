import { Box, Text } from 'ink';
import React from 'react';

import { shortenPath, theme } from '../theme.js';

import type { MediaDetails as Details } from '../../core/library/service.js';

export type MediaDetailsProps = {
  details: Details | null;
};

const MAX_FILES = 8;

/** Panel con la información del título seleccionado y sus ficheros. */
export function MediaDetails({ details }: MediaDetailsProps): React.JSX.Element {
  if (details === null) {
    return (
      <Box paddingX={1} marginTop={1}>
        <Text>{theme.muted('Selecciona un título para ver sus detalles.')}</Text>
      </Box>
    );
  }

  const { media, files } = details;
  const year = media.year === null ? '' : ` (${media.year})`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      marginTop={1}
    >
      <Text>
        {theme.highlight(`${media.title}${year}`)} {theme.muted(`#${media.id}`)}
      </Text>
      <Text>{theme.muted(`  ${shortenPath(media.folderPath, 72)}`)}</Text>
      <Text>
        {theme.label('Ficheros')} {theme.muted(`(${files.length})`)}
      </Text>
      {files.length === 0 ? (
        <Text>{theme.muted('  sin ficheros asociados')}</Text>
      ) : (
        files.slice(0, MAX_FILES).map((file) => {
          const season = file.season === null ? '' : `T${String(file.season).padStart(2, '0')}`;
          const episode = file.episode === null ? '' : `E${String(file.episode).padStart(2, '0')}`;
          const label = `${season}${episode}` || '—';
          return (
            <Text key={file.id}>
              {'  '}
              {theme.muted(`#${file.id}`)} {theme.primary(label.padEnd(6))}{' '}
              {shortenPath(file.filePath, 64)}
            </Text>
          );
        })
      )}
      {files.length > MAX_FILES ? (
        <Text>{theme.muted(`  … y ${files.length - MAX_FILES} más`)}</Text>
      ) : null}
    </Box>
  );
}
