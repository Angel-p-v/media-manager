import { render } from 'ink';
import React from 'react';

import { App } from './App.js';
import { enterAlternateScreen, leaveAlternateScreen } from './screen.js';
import { openLibrary } from '../core/library/open.js';

import type { AppConfig } from '../core/config/schema.js';

/** Arranca la interfaz de terminal y espera a que termine. */
export async function runTui(config: AppConfig): Promise<void> {
  const opened = openLibrary(config.database.path);

  enterAlternateScreen();
  try {
    const instance = render(<App config={config} library={opened.library} />, {
      exitOnCtrlC: false,
    });
    await instance.waitUntilExit();
  } finally {
    leaveAlternateScreen();
    opened.close();
  }
}
