import { render } from 'ink';
import { InkPictureProvider } from 'ink-picture';
import React from 'react';

import { App } from './App.js';
import { enterAlternateScreen, leaveAlternateScreen } from './screen.js';
import { indexLibrary } from '../core/indexer/service.js';
import { openLibrary } from '../core/library/open.js';
import { createLogger } from '../shared/logger.js';

import type { AppConfig } from '../core/config/schema.js';

/** Arranca la interfaz de terminal y espera a que termine. */
export async function runTui(config: AppConfig, configPath?: string): Promise<void> {
  const logger = createLogger({
    level: config.logging.level,
    format: config.logging.format,
  });
  const opened = openLibrary(config.database.path, config, logger);

  /** Reindexa la biblioteca usando las raíces y filtros de la configuración
   *  pasada por App (siempre la config más actualizada tras guardar ajustes). */
  const indexLibraryNow = async (newConfig: AppConfig): Promise<void> => {
    await indexLibrary(
      opened.repositories,
      {
        roots: newConfig.library.roots,
        exclude: newConfig.library.exclude,
        scan: newConfig.library.scan,
      },
      { logger },
    );
  };

  enterAlternateScreen();
  try {
    const instance = render(
      <InkPictureProvider>
        <App
          config={config}
          library={opened.library}
          {...(configPath ? { configPath } : {})}
          onIndex={indexLibraryNow}
        />
      </InkPictureProvider>,
      { exitOnCtrlC: false },
    );
    await instance.waitUntilExit();
  } finally {
    leaveAlternateScreen();
    opened.close();
  }
}
