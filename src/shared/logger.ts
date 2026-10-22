import pc from 'picocolors';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export type Logger = {
  error(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  info(message: string, ...details: unknown[]): void;
  debug(message: string, ...details: unknown[]): void;
};

/** Crea un logger que escribe en `stream` (stderr por defecto). */
export function createLogger(
  level: LogLevel = 'info',
  stream: NodeJS.WritableStream = process.stderr,
): Logger {
  const threshold = LEVEL_WEIGHT[level];

  const write = (
    minimum: LogLevel,
    prefix: string,
    color: (text: string) => string,
    message: string,
    details: unknown[],
  ): void => {
    if (LEVEL_WEIGHT[minimum] > threshold) return;
    const suffix =
      details.length > 0 ? ` ${details.map((detail) => stringify(detail)).join(' ')}` : '';
    stream.write(`${color(prefix)} ${message}${suffix}\n`);
  };

  return {
    error: (message, ...details) => write('error', '✖', pc.red, message, details),
    warn: (message, ...details) => write('warn', '▲', pc.yellow, message, details),
    info: (message, ...details) => write('info', '•', pc.cyan, message, details),
    debug: (message, ...details) => write('debug', '·', pc.dim, message, details),
  };
}

/** Serializa un detalle para el log sin perder información útil. */
function stringify(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? detail.message;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}
