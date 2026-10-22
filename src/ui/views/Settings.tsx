import { Box, Text } from 'ink';
import React from 'react';

import { shortenPath, theme } from '../theme.js';

import type { AppConfig } from '../../core/config/schema.js';

export type SettingsViewProps = {
  config: AppConfig;
};

/** Vista de solo lectura con la configuración efectiva de la aplicación. */
export function SettingsView({ config }: SettingsViewProps): React.JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>{theme.highlight('Configuración efectiva')}</Text>
      <Text> </Text>
      <Text>{theme.label('Biblioteca')}</Text>
      {config.library.roots.length === 0 ? (
        <Text>{theme.muted('  (sin raíces configuradas)')}</Text>
      ) : (
        config.library.roots.map((root) => (
          <Text key={root.path}>
            {'  '}
            {theme.primary(root.type.padEnd(7))} {shortenPath(root.path, 64)}
          </Text>
        ))
      )}
      <Text> </Text>
      <Text>{theme.label('Base de datos')}</Text>
      <Text>{`  ${shortenPath(config.database.path, 72)}`}</Text>
      <Text> </Text>
      <Text>{theme.label('Reproductor')}</Text>
      <Text>{`  ${config.player.default} · ${config.player.onLaunch}`}</Text>
      <Text> </Text>
      <Text>{theme.label('Interfaz')}</Text>
      <Text>{`  tema: ${config.ui.theme} · layout: ${config.ui.layout} · orden: ${config.ui.sort}`}</Text>
      <Text>{`  detalles: ${config.ui.showDetails ? 'sí' : 'no'} · atajos personalizados: ${Object.keys(config.keybindings).length}`}</Text>
      <Text> </Text>
      <Text>{theme.muted('Los cambios se aplican al reiniciar la TUI.')}</Text>
    </Box>
  );
}
