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

describe('logger', () => {
  it('escribe los mensajes con el nivel indicado', () => {
    const collector = createCollector();
    const logger = createLogger('info', collector.stream);

    logger.info('mensaje');

    expect(collector.output()).toContain('mensaje');
    expect(collector.output()).toContain('•');
  });

  it('no escribe mensajes por debajo del nivel configurado', () => {
    const collector = createCollector();
    const logger = createLogger('warn', collector.stream);

    logger.info('no debería aparecer');
    logger.debug('tampoco');

    expect(collector.output()).toBe('');
  });

  it('respeta el nivel silent', () => {
    const collector = createCollector();
    const logger = createLogger('silent', collector.stream);

    logger.error('nada');

    expect(collector.output()).toBe('');
  });

  it.each<LogLevel>(['error', 'warn', 'info', 'debug'])('permite el nivel %s', (level) => {
    const collector = createCollector();
    const logger = createLogger(level, collector.stream);

    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');

    expect(collector.output().length).toBeGreaterThan(0);
  });

  it('añade los detalles al final del mensaje', () => {
    const collector = createCollector();
    const logger = createLogger('info', collector.stream);

    logger.info('con detalle', { clave: 'valor' });

    expect(collector.output()).toContain('clave');
  });

  it('serializa los errores como pila', () => {
    const collector = createCollector();
    const logger = createLogger('debug', collector.stream);

    logger.error('fallo', new Error('boom'));

    expect(collector.output()).toContain('boom');
  });

  it('no rompe con detalles que no se pueden serializar', () => {
    const collector = createCollector();
    const logger = createLogger('debug', collector.stream);

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.debug('circular', circular)).not.toThrow();
  });
});
