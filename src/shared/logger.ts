import pc from 'picocolors';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
export type LogFormat = 'text' | 'json';

/** Campos estructurados que acompañan a un evento de log. */
export type LogFields = Record<string, unknown>;

export type Logger = {
  readonly level: LogLevel;
  readonly format: LogFormat;
  error(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  debug(event: string, fields?: LogFields): void;
  /** Devuelve un logger que añade campos fijos a todos sus eventos. */
  child(bindings: LogFields): Logger;
};

export type LoggerOptions = {
  level?: LogLevel;
  format?: LogFormat;
  stream?: NodeJS.WritableStream;
  bindings?: LogFields;
  /** Inyectable para tests deterministas. */
  now?: () => Date;
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

type ActiveLevel = Exclude<LogLevel, 'silent'>;

const STYLES: Record<ActiveLevel, { icon: string; color: (text: string) => string }> = {
  error: { icon: '✖', color: pc.red },
  warn: { icon: '▲', color: pc.yellow },
  info: { icon: '•', color: pc.cyan },
  debug: { icon: '·', color: pc.dim },
};

/**
 * Crea un logger estructurado.
 *
 * En formato `text` cada evento es `icono evento clave=valor`; en formato `json`
 * se escribe una línea con `time`, `level`, `event` y los campos. Los detalles
 * nunca se intercalan con `stdout`, de modo que `--json` sigue siendo parseable.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const format = options.format ?? 'text';
  const stream = options.stream ?? process.stderr;
  const now = options.now ?? ((): Date => new Date());

  const make = (bindings: LogFields): Logger => {
    const threshold = LEVEL_WEIGHT[level];

    const write = (entryLevel: ActiveLevel, event: string, fields: LogFields | undefined): void => {
      if (LEVEL_WEIGHT[entryLevel] > threshold) return;

      const merged = { ...bindings, ...(fields ?? {}) };
      if (format === 'json') {
        const payload = {
          ...merged,
          time: now().toISOString(),
          level: entryLevel,
          event,
        };
        stream.write(`${safeStringify(payload)}\n`);
        return;
      }

      const style = STYLES[entryLevel];
      const details = formatFields(merged);
      stream.write(
        `${style.color(style.icon)} ${event}${details.length === 0 ? '' : ` ${details}`}\n`,
      );
    };

    return {
      level,
      format,
      error: (event, fields) => {
        write('error', event, fields);
      },
      warn: (event, fields) => {
        write('warn', event, fields);
      },
      info: (event, fields) => {
        write('info', event, fields);
      },
      debug: (event, fields) => {
        write('debug', event, fields);
      },
      child: (extra) => make({ ...bindings, ...extra }),
    };
  };

  return make(options.bindings ?? {});
}

function formatFields(fields: LogFields): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${formatField(value)}`)
    .join(' ');
}

function formatField(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') {
    return /\s/.test(value) ? safeStringify(value) : value;
  }
  if (typeof value === 'bigint') return value.toString();
  return safeStringify(value);
}

/** Serializa sin romperse con ciclos, errores o `bigint`. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(value, (_key, item: unknown) => {
        if (item instanceof Error) {
          return { name: item.name, message: item.message, stack: item.stack };
        }
        if (typeof item === 'bigint') return item.toString();
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
        }
        return item;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}
