import { Box, Text } from 'ink';
import React from 'react';

import { theme } from '../theme.js';

import type { Keybindings } from '../hooks/useConfig.js';

export type StatusBarProps = {
  bindings: Keybindings;
  message?: string | null;
};

/** Barra inferior con los atajos principales o el último mensaje de estado. */
export function StatusBar({ bindings, message }: StatusBarProps): React.JSX.Element {
  if (message !== undefined && message !== null && message.length > 0) {
    return (
      <Box paddingX={1}>
        <Text>{theme.warning(message)}</Text>
      </Box>
    );
  }

  const hints = [
    ['quit', 'salir'],
    ['nextSection', 'sección'],
    ['search', 'buscar'],
    ['settings', 'ajustes'],
    ['help', 'ayuda'],
  ] as const;

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text>
        {hints.map(([action, label], index) => {
          const key = bindings[action];
          if (key === undefined || key.length === 0) return null;
          return (
            <Text key={action}>
              {index > 0 ? theme.muted(' · ') : ''}
              {theme.primary(`[${key}]`)} {theme.muted(label)}
            </Text>
          );
        })}
      </Text>
    </Box>
  );
}
