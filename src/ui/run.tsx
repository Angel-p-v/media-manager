import { render } from 'ink';
import React from 'react';

import { App } from './App.js';

import type { AppConfig } from '../core/config/schema.js';

/** Arranca la interfaz de terminal y espera a que termine. */
export async function runTui(config: AppConfig): Promise<void> {
  const instance = render(<App config={config} />, { exitOnCtrlC: false });
  await instance.waitUntilExit();
}
