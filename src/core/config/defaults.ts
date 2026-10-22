import { defaultPlayers } from './schema.js';

import type { AppConfig } from './schema.js';

/**
 * Valores por defecto de la aplicación. Se fusionan con el archivo YAML
 * antes de validarlo, de modo que un archivo parcial sigue siendo válido.
 */
export const defaultConfig: AppConfig = {
  version: 1,
  library: {
    roots: [],
    exclude: ['**/*.sample.*', '**/sample/**', '**/.hidden/**', '**/@eaDir/**'],
    scan: {
      followSymlinks: false,
      maxDepth: 4,
      minSizeBytes: 0,
    },
  },
  database: {
    path: '~/.local/share/media-manager/library.db',
  },
  player: {
    default: 'mpv',
    onLaunch: 'detach',
    players: defaultPlayers,
  },
  ui: {
    theme: 'default',
    layout: 'split',
    sort: 'title',
    showDetails: true,
  },
  keybindings: {
    quit: 'q',
    help: '?',
    search: '/',
    play: 'p',
    refresh: 'r',
    nextSection: 'tab',
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    enter: 'return',
    escape: 'escape',
  },
};
