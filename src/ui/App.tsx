import { Box, Text } from 'ink';
import React from 'react';

import { theme } from './theme.js';

import type { AppConfig } from '../core/config/schema.js';

export type AppProps = {
  config: AppConfig;
};

/**
 * Componente raíz de la interfaz. La estructura definitiva (biblioteca, búsqueda,
 * detalles y ayuda) se completa en el hito M5; aquí se fija el armazón visual.
 */
export function App({ config }: AppProps): React.JSX.Element {
  const rootCount = config.library.roots.length;

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      <Box marginBottom={1}>
        <Text>
          {theme.title('media-manager')} {theme.muted('· biblioteca local')}
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" borderStyle="round" borderColor={theme.border}>
        <Box marginX={1} marginY={1} flexDirection="column">
          <Text>{theme.highlight('Biblioteca vacía')}</Text>
          <Text>
            {theme.muted(
              rootCount > 0
                ? 'Todavía no hay nada indexado. Ejecuta «mm index» para escanear tus carpetas.'
                : 'Configura tus carpetas en el archivo de configuración y ejecuta «mm index».',
            )}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text>
          {theme.muted('pulsa')} q {theme.muted('para salir')} {theme.muted('·')} ?{' '}
          {theme.muted('para ayuda')}
        </Text>
      </Box>
    </Box>
  );
}
