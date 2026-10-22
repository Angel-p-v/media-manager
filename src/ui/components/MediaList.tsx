import { Box, Text } from 'ink';
import React from 'react';

import { theme } from '../theme.js';

import type { MediaRow } from '../../core/db/types.js';

export type MediaListProps = {
  items: readonly MediaRow[];
  selected: number;
  emptyMessage: string;
  title?: string;
};

const WINDOW_SIZE = 12;

/** Lista de títulos con una ventana alrededor de la selección. */
export function MediaList({
  items,
  selected,
  emptyMessage,
  title = 'Títulos',
}: MediaListProps): React.JSX.Element {
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(WINDOW_SIZE / 2), items.length - WINDOW_SIZE),
  );
  const visible = items.slice(start, start + WINDOW_SIZE);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>
        {theme.label(title)} {theme.muted(`(${items.length})`)}
      </Text>
      {items.length === 0 ? (
        <Text>{theme.muted(emptyMessage)}</Text>
      ) : (
        visible.map((media, index) => {
          const position = start + index;
          const active = position === selected;
          const year = media.year === null ? '' : ` (${media.year})`;
          return (
            <Text key={media.id} {...(active ? { color: 'cyan' as const } : {})} bold={active}>
              {active ? '▸ ' : '  '}
              {media.title}
              {year} {theme.muted(`[${media.type}]`)}
            </Text>
          );
        })
      )}
    </Box>
  );
}
