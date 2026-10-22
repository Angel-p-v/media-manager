import { describe, expect, it } from 'vitest';

import { createLaunchPlan } from '../../../src/core/player/launcher.js';
import { selectMediaFile } from '../../../src/core/player/selection.js';
import { PlayerError } from '../../../src/shared/errors.js';

import type { PlayerConfig } from '../../../src/core/config/schema.js';
import type { MediaFileRow } from '../../../src/core/db/types.js';

const playerConfig: PlayerConfig = {
  default: 'fake',
  onLaunch: 'detach',
  players: {
    fake: {
      command: 'fake-player',
      args: ['--input={file}', '--title', '{file}.json'],
    },
    quiet: {
      command: 'quiet-player',
      args: ['{file}'],
      env: { QUIET: '1' },
    },
  },
};

function mediaFile(id: number, season: number | null, episode: number | null): MediaFileRow {
  return {
    id,
    mediaId: 1,
    season,
    episode,
    title: null,
    filePath: `/media/Show/S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.mkv`,
    sizeBytes: 1,
    mtimeMs: 1,
    indexedAt: '2026-01-01 00:00:00',
  };
}

describe('createLaunchPlan', () => {
  it('sustituye {file} en cada argumento y conserva las rutas con espacios', () => {
    const filePath = '/media/Series/Show (2022)/S01E01.mkv';

    const plan = createLaunchPlan({ playerConfig, filePath });

    expect(plan).toEqual({
      player: 'fake',
      command: 'fake-player',
      args: ['--input=/media/Series/Show (2022)/S01E01.mkv', '--title', `${filePath}.json`],
      mode: 'detach',
      filePath,
    });
  });

  it('permite elegir reproductor y modo sin mutar la configuración', () => {
    const plan = createLaunchPlan({
      playerConfig,
      filePath: '/media/movie.mkv',
      playerName: 'quiet',
      mode: 'foreground',
    });

    expect(plan).toMatchObject({
      player: 'quiet',
      command: 'quiet-player',
      args: ['/media/movie.mkv'],
      mode: 'foreground',
      env: { QUIET: '1' },
    });
    expect(playerConfig.players.quiet?.env).toEqual({ QUIET: '1' });
  });

  it('falla si el reproductor no existe y enumera los disponibles', () => {
    expect(() =>
      createLaunchPlan({ playerConfig, filePath: '/media/movie.mkv', playerName: 'mpv' }),
    ).toThrow(PlayerError);
    expect(() =>
      createLaunchPlan({ playerConfig, filePath: '/media/movie.mkv', playerName: 'mpv' }),
    ).toThrow('Disponibles: fake, quiet');
  });

  it('exige el marcador {file} en la plantilla', () => {
    const invalid: PlayerConfig = {
      ...playerConfig,
      players: { broken: { command: 'broken', args: ['--fullscreen'] } },
      default: 'broken',
    };

    expect(() => createLaunchPlan({ playerConfig: invalid, filePath: '/media/movie.mkv' })).toThrow(
      'debe incluir el marcador {file}',
    );
  });

  it('rechaza una ruta de fichero vacía', () => {
    expect(() => createLaunchPlan({ playerConfig, filePath: '   ' })).toThrow(
      'No hay ningún fichero que reproducir',
    );
  });
});

describe('selectMediaFile', () => {
  it('elige el primer fichero cuando no se indica ninguno', () => {
    const files = [mediaFile(1, 1, 1), mediaFile(2, 1, 2)];

    expect(selectMediaFile(files).id).toBe(1);
  });

  it('permite elegir un fichero por id', () => {
    const files = [mediaFile(1, 1, 1), mediaFile(2, 1, 2)];

    expect(selectMediaFile(files, 2).episode).toBe(2);
  });

  it('falla si el id no pertenece al título', () => {
    expect(() => selectMediaFile([mediaFile(1, 1, 1)], 99)).toThrow('Ficheros disponibles: #1');
  });

  it('falla si el título no tiene ficheros', () => {
    expect(() => selectMediaFile([])).toThrow('no tiene ficheros indexados');
  });
});
