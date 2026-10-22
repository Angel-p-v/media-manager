import { Box, Text } from 'ink';
import React from 'react';

import { theme } from './theme.js';

/** Esqueleto de la interfaz; se completa en el hito M5. */
export function App(): React.JSX.Element {
  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      <Text>
        {theme.title('media-manager')} {theme.muted('· en construcción')}
      </Text>
    </Box>
  );
}
