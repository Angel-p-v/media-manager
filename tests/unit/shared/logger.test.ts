import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, type LogLevel } from '../../../src/shared/logger.js';

/** Stream que acumula lo escrito para poder inspeccionarlo. */
function createCollector(): { stream: Writable; output: () => string } {
  let buffer = '';
  const stream = new Writable({
    write(chunk: unknown, _encoding, callback) {
      buffer += String(chunk);
      callback();
    },
  });
  return { stream, output: () => buffer };
}

const FIXED_DATE = new Date('2026-10-22T12:00:00.000Z');

describe('logger', () => {
  it('escribe los mensajes con el nivel indicado', () => {
    const collector = createCollector();
    const logger = createLogger({ level: 'info', stream: collector.stream });

    logger.info('mensaje');

    expect(collector.output()).toContain('mensaje');
    expect(collector.output()).toContain('•');
  });

  it('no escribe mensajes por debajo del nivel configurado', () => {
    const collector = createCollector();
    const logger = createLogger({ level: 'warn', stream: collector.stream });

    logger.info('no debería aparecer');
    logger.debug('tampoco');

    expect(collector.output()).toBe('');
  });

  it('respeta el nivel silent', () => {
    const collector = createCollector();
    const logger = createLogger({ level: 'silent', stream: collector.stream });

    logger.error('nada');

    expect(collector.output()).toBe('');
  });

  it.each<LogLevel>(['error', 'warn', 'info', 'debug'])('permite el nivel %s', (level) => {
    const collector = createCollector();
    const logger = createLogger({ level, stream: collector.stream });

    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');

    expect(collector.output().length).toBeGreaterThan(0);
  });

  it('añade los campos estructurados al final del mensaje', () => {
    const collector = createCollector();
    const logger = createLogger({ level: 'info', stream: collector.stream });

    logger.info('con detalle', { clave: 'valor', total: 3 });

    expect(collector.output()).toContain('clave=valor');
    expect(collector.output()).toContain('total=3');
  });

  it('serializa los errores sin romper el formato de texto', () => {
    const collector = createCollector();
    const logger = createLogger({ level: 'debug', stream: collector.stream });

    logger.error('fallo', { error: new Error('boom') });

    expect(collector.output()).toContain('error=Error: boom');
  });

  it('emite una línea JSON por evento con campos fijos', () => {
    const collector = createCollector();
    const logger = createLogger({
      level: 'debug',
      format: 'json',
      stream: collector.stream,
      bindings: { command: 'index' },
      now: () => FIXED_DATE,
    });

    logger.debug('index.completed', { files: 10 });

    const payload = JSON.parse(collector.output()) as Record<string, unknown>;
    expect(payload).toEqual({
      command: 'index',
      files: 10,
      time: FIXED_DATE.toISOString(),
      level: 'debug',
      event: 'index.completed',
    });
  });

  it('añade bindings con child sin mutar el logger padre', () => {
    const collector = createCollector();
    const parent = createLogger({ level: 'info', stream: collector.stream });
    const child = parent.child({ scope: 'db' });

    child.info('abierta', { path: '/tmp/library.db' });
    parent.info('limpio');

    const lines = collector.output().trimEnd().split('\n');
    expect(lines[0]).toContain('scope=db');
    expect(lines[0]).toContain('path=/tmp/library.db');
    expect(lines[1]).not.toContain('scope=db');
  });

  it('no rompe con detalles que no se pueden serializar', () => {
    const collector = createCollector();
    const logger = createLogger({ level: 'debug', stream: collector.stream });

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.debug('circular', { circular })).not.toThrow();
    expect(collector.output()).toContain('[Circular]');
  });
});
