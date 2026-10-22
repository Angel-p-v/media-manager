import { TextInput } from '@inkjs/ui';
import { Box, Text } from 'ink';
import React from 'react';

import { MediaDetails } from '../components/MediaDetails.js';
import { MediaList } from '../components/MediaList.js';
import { theme } from '../theme.js';

import type { MediaRow } from '../../core/db/types.js';
import type { MediaDetails as Details } from '../../core/library/service.js';

export type SearchViewProps = {
  query: string;
  onQueryChange: (value: string) => void;
  items: readonly MediaRow[];
  selected: number;
  details: Details | null;
  showDetails: boolean;
};

/** Vista de búsqueda: el texto filtra la biblioteca mientras se escribe. */
export function SearchView({
  query,
  onQueryChange,
  items,
  selected,
  details,
  showDetails,
}: SearchViewProps): React.JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text>{theme.label('Buscar')} </Text>
        <TextInput
          placeholder="Escribe un título y pulsa Esc para volver…"
          defaultValue={query}
          onChange={onQueryChange}
        />
      </Box>
      <MediaList
        title="Resultados"
        items={items}
        selected={selected}
        emptyMessage={
          query.trim().length === 0
            ? 'Escribe para buscar en la biblioteca.'
            : `Sin resultados para «${query.trim()}».`
        }
      />
      {showDetails ? <MediaDetails details={details} /> : null}
    </Box>
  );
}
