import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';
import { type z } from 'zod';

import { defaultConfig } from './defaults.js';
import { mergeDeep, isPlainObject } from './merge.js';
import { defaultConfigPath } from './paths.js';
import { configSchema, logFormatSchema, logLevelSchema, type AppConfig } from './schema.js';
import { ConfigError } from '../../shared/errors.js';
import { resolvePath } from '../../shared/paths.js';

export type LoadConfigOptions = {
  /** Ruta explícita del archivo de configuración; tiene prioridad sobre `MM_CONFIG`. */
  configPath?: string;
  /** Entorno desde el que leer las variables; por defecto `process.env`. */
  env?: NodeJS.ProcessEnv;
};

/** Resuelve la ruta del archivo de configuración que se va a usar. */
export function resolveConfigPath(options: LoadConfigOptions = {}): string {
  const env = options.env ?? process.env;
  const explicit = options.configPath ?? env.MM_CONFIG;
  return explicit && explicit.length > 0 ? path.resolve(explicit) : defaultConfigPath(env);
}

/**
 * Carga la configuración de la aplicación.
 *
 * Precedencia: valores por defecto < archivo YAML < variables de entorno.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const env = options.env ?? process.env;
  const configPath = resolveConfigPath(options);

  const raw = await readConfigFile(configPath);
  // Se clona para no compartir referencias con los valores por defecto.
  const merged = structuredClone(mergeDeep(defaultConfig, raw));
  const withEnv = applyEnvOverrides(merged, env);
  const parsed = validateConfig(withEnv, configPath);
  return expandConfigPaths(parsed, path.dirname(configPath));
}

/** Lee y deserializa el archivo YAML. Devuelve `{}` si el archivo no existe. */
export async function readConfigFile(configPath: string): Promise<unknown> {
  if (!existsSync(configPath)) return {};

  let content: string;
  try {
    content = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new ConfigError(
      `No se pudo leer la configuración: ${(error as Error).message}`,
      configPath,
      {
        cause: error,
      },
    );
  }

  try {
    // Un archivo vacío (o solo con comentarios) se considera una configuración vacía.
    const parsed = (parseYaml(content) ?? {}) as unknown;
    if (!isPlainObject(parsed)) {
      throw new ConfigError(
        'El archivo debe contener un mapa de opciones (clave: valor), no una lista u otro tipo.',
        configPath,
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(
      `El archivo no contiene YAML válido: ${(error as Error).message}`,
      configPath,
      { cause: error },
    );
  }
}

/** Valida la configuración contra el esquema, con mensajes legibles. */
export function validateConfig(input: unknown, configPath: string): AppConfig {
  const result = configSchema.safeParse(input);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `  · ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('\n');

  throw new ConfigError(`La configuración no cumple el esquema:\n${details}`, configPath);
}

/** Aplica las variables de entorno con prefijo `MM_`. */
export function applyEnvOverrides(config: AppConfig, env: NodeJS.ProcessEnv): AppConfig {
  const next: AppConfig = structuredClone(config);

  if (env.MM_DATABASE_PATH) {
    next.database.path = env.MM_DATABASE_PATH;
  }
  if (env.MM_PLAYER) {
    next.player.default = env.MM_PLAYER;
  }
  if (env.MM_LOG_LEVEL) {
    const level = logLevelSchema.safeParse(env.MM_LOG_LEVEL);
    if (!level.success) {
      throw new ConfigError(
        `MM_LOG_LEVEL inválido: «${env.MM_LOG_LEVEL}». Valores: silent, error, warn, info, debug.`,
      );
    }
    next.logging.level = level.data;
  }
  if (env.MM_LOG_FORMAT) {
    const format = logFormatSchema.safeParse(env.MM_LOG_FORMAT);
    if (!format.success) {
      throw new ConfigError(`MM_LOG_FORMAT inválido: «${env.MM_LOG_FORMAT}». Valores: text, json.`);
    }
    next.logging.format = format.data;
  }

  return next;
}

/** Convierte las rutas relativas y `~` en rutas absolutas. */
export function expandConfigPaths(config: AppConfig, baseDir: string): AppConfig {
  return {
    ...config,
    database: { path: resolvePath(config.database.path, baseDir) },
    library: {
      ...config.library,
      roots: config.library.roots.map((root) => ({
        ...root,
        path: resolvePath(root.path, baseDir),
      })),
    },
  };
}

/** Convierte los errores de validación de Zod en un texto legible. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  · ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('\n');
}
