import { render } from 'ink';
import React from 'react';

import { App } from './App.js';

/** Arranca la interfaz de terminal y espera a que termine. */
export async function runTui(): Promise<void> {
  const instance = render(<App />, { exitOnCtrlC: false });
  await instance.waitUntilExit();
}
