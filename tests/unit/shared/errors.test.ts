import { describe, expect, it } from 'vitest';

import {
  AppError,
  ConfigError,
  DbError,
  IndexError,
  NotFoundError,
  PlayerError,
  formatError,
} from '../../../src/shared/errors.js';

describe('errores de la aplicación', () => {
  it('cada error specialized conserva su código', () => {
    expect(new ConfigError('x').code).toBe('CONFIG_ERROR');
    expect(new DbError('x').code).toBe('DB_ERROR');
    expect(new IndexError('x').code).toBe('INDEX_ERROR');
    expect(new PlayerError('x').code).toBe('PLAYER_ERROR');
    expect(new NotFoundError('x').code).toBe('NOT_FOUND');
  });

  it('los errores specialised heredan de AppError', () => {
    expect(new ConfigError('x')).toBeInstanceOf(AppError);
    expect(new ConfigError('x')).toBeInstanceOf(Error);
  });

  it('el nombre de la clase es el del error concreto', () => {
    expect(new ConfigError('x').name).toBe('ConfigError');
  });
});

describe('formatError', () => {
  it('muestra el mensaje de un AppError', () => {
    expect(formatError(new ConfigError('mensaje'))).toBe('mensaje');
  });

  it('muestra el mensaje de un Error normal', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('convierte valores desconocidos en texto', () => {
    expect(formatError('texto')).toBe('texto');
    expect(formatError(42)).toBe('42');
  });
});
