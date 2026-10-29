import { Box, Text } from 'ink';
import React from 'react';

import { theme } from '../theme.js';

import type { Keybindings } from '../hooks/useConfig.js';

export type HelpOverlayProps = {
  bindings: Keybindings;
};

/** Todas las acciones con atajo de teclado y su etiqueta legible. */
const ACTION_LABELS: readonly { action: string; label: string }[] = [
  { action: 'quit', label: 'salir de la aplicación' },
  { action: 'help', label: 'mostrar esta ayuda' },
  { action: 'search', label: 'buscar títulos' },
  { action: 'settings', label: 'ver la configuración' },
  { action: 'play', label: 'reproducir título seleccionado' },
  { action: 'enter', label: 'abrir detalles de reproducción' },
  { action: 'nextSection', label: 'siguiente sección' },
  { action: 'up', label: 'título anterior' },
  { action: 'down', label: 'título siguiente' },
  { action: 'escape', label: 'cerrar o volver atrás' },
  { action: 'refresh', label: 'refrescar metadatos del título' },
  { action: 'refreshAll', label: 'refrescar todos los metadatos' },
  { action: 'goToDetails', label: 'mostrar/ocultar panel de detalles' },
  { action: 'gotoTaggedMedia', label: 'siguiente título con metadatos' },
  { action: 'toggleSelection', label: 'seleccionar/deseleccionar título' },
  { action: 'toggleCompact', label: 'activar vista compacta' },
  { action: 'filterWatched', label: 'filtrar títulos vistos' },
  { action: 'filterUnwatched', label: 'filtrar títulos no vistos' },
  { action: 'clearSelection', label: 'limpiar selección y filtros' },
  { action: 'configureKeybindings', label: 'reasignar atajos de teclado' },
];

/** Ayuda contextual: lista todos los atajos efectivos configurados. */
export function HelpOverlay({ bindings }: HelpOverlayProps): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={1} marginTop={1}>
      <Text>{theme.highlight('Atajos de teclado')}</Text>
      {ACTION_LABELS.map(({ action, label }) => {
        const binding = bindings[action];
        if (binding === undefined || binding.length === 0) return null;
        return (
          <Text key={action}>
            {'  '}
            {theme.primary(binding.padEnd(8))} {theme.muted(label)}
          </Text>
        );
      })}
      <Text>{theme.muted('  Pulsa ? o Esc para cerrar la ayuda.')}</Text>
    </Box>
  );
}
