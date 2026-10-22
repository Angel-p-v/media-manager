import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { PlayerError } from '../../shared/errors.js';

import type { PlayerConfig } from '../config/schema.js';
import type { ChildProcess } from 'node:child_process';

/** Forma de lanzar el reproductor: en segundo plano o esperando a que cierre. */
export type LaunchMode = 'detach' | 'foreground';

/** Comando resuelto y listo para ejecutarse, sin pasar por una shell. */
export type LaunchPlan = {
  player: string;
  command: string;
  args: string[];
  mode: LaunchMode;
  filePath: string;
  env?: Record<string, string>;
};

export type CreateLaunchPlanOptions = {
  playerConfig: PlayerConfig;
  filePath: string;
  /** Reproductor alternativo al configurado por defecto. */
  playerName?: string;
  /** Fuerza el modo; si se omite se usa `player.onLaunch`. */
  mode?: LaunchMode;
};

/** Proceso de reproducción ya arrancado. */
export type PlayerHandle = {
  pid: number | undefined;
  /** Espera al cierre y falla si el reproductor termina con error. */
  wait: () => Promise<void>;
};

/** Firma que consume la TUI, inyectable en los tests. */
export type LaunchPlayerFn = (plan: LaunchPlan) => Promise<PlayerHandle>;

/**
 * Construye el comando del reproductor a partir de la definición configurada.
 *
 * La plantilla debe contener `{file}`: sin ese marcador el reproductor se abriría
 * sin saber qué vídeo tiene que cargar. Cada argumento se sustituye por separado,
 * así que una ruta con espacios sigue siendo un único argumento.
 */
export function createLaunchPlan(options: CreateLaunchPlanOptions): LaunchPlan {
  const { playerConfig, filePath } = options;

  if (filePath.trim().length === 0) {
    throw new PlayerError('No hay ningún fichero que reproducir.');
  }

  const playerName = options.playerName ?? playerConfig.default;
  const definition = playerConfig.players[playerName];

  if (definition === undefined) {
    const available = Object.keys(playerConfig.players).sort().join(', ') || '(ninguno)';
    throw new PlayerError(
      `El reproductor «${playerName}» no está configurado. Disponibles: ${available}.`,
    );
  }

  if (!definition.args.some((arg) => arg.includes('{file}'))) {
    throw new PlayerError(
      `La plantilla del reproductor «${playerName}» debe incluir el marcador {file}.`,
    );
  }

  return {
    player: playerName,
    command: definition.command,
    args: definition.args.map((arg) => arg.replaceAll('{file}', filePath)),
    mode: options.mode ?? playerConfig.onLaunch,
    filePath,
    ...(definition.env === undefined ? {} : { env: { ...definition.env } }),
  };
}

/**
 * Lanza el reproductor sin shell.
 *
 * En modo `detach` el hijo se desacopla de la terminal y sobrevive al cierre de
 * la TUI; en modo `foreground` hereda stdio y `wait()` espera su salida. Comprobar
 * el binario antes de lanzarlo permite devolver un error útil aunque el proceso
 * se desacople inmediatamente.
 */
export async function launchPlayer(plan: LaunchPlan): Promise<PlayerHandle> {
  if (!(await isExecutable(plan.command))) {
    throw new PlayerError(
      `No se encontró el reproductor «${plan.player}» (${plan.command}). ` +
        'Instálalo o ajusta player.players en la configuración.',
    );
  }

  const child = spawn(plan.command, plan.args, {
    shell: false,
    detached: plan.mode === 'detach',
    stdio: plan.mode === 'detach' ? 'ignore' : 'inherit',
    ...(plan.env === undefined ? {} : { env: { ...process.env, ...plan.env } }),
  });

  await waitForSpawn(child, plan);

  if (plan.mode === 'detach') child.unref();

  const closed = waitForClose(child, plan.mode);
  return {
    pid: child.pid,
    wait: () => closed.then((outcome) => assertSuccessfulExit(outcome, plan)),
  };
}

/**
 * Busca un ejecutable en `PATH` (o comprueba la ruta si contiene separadores).
 * Se hace antes del spawn para que el error no se pierda al desacoplar el hijo.
 */
export async function isExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (command.length === 0) return false;

  const hasSeparator =
    command.includes('/') || (process.platform === 'win32' && command.includes('\\'));
  const directories = hasSeparator
    ? ['']
    : (env.PATH ?? '').split(path.delimiter).filter((directory) => directory.length > 0);
  const extensions =
    process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = hasSeparator ? command : path.join(directory, `${command}${extension}`);
      try {
        await access(candidate, constants.X_OK);
        return true;
      } catch {
        // Siguiente candidato del PATH.
      }
    }
  }

  return false;
}

type CloseOutcome = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

function waitForSpawn(child: ChildProcess, plan: LaunchPlan): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      child.off('spawn', onSpawn);
      child.off('error', onError);
    };
    const onSpawn = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(
        new PlayerError(`No se pudo lanzar «${plan.player}»: ${error.message}`, { cause: error }),
      );
    };

    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

function waitForClose(child: ChildProcess, mode: LaunchMode): Promise<CloseOutcome> {
  return new Promise((resolve, reject) => {
    child.once('close', (code, signal) => {
      resolve({ code, signal });
    });
    // En detach nadie consume la espera; un error tardío quedaría como rechazo
    // no manejado, así que solo se propaga cuando el llamante va a esperar.
    if (mode === 'foreground') child.once('error', reject);
  });
}

function assertSuccessfulExit(outcome: CloseOutcome, plan: LaunchPlan): void {
  if (outcome.signal !== null) {
    throw new PlayerError(
      `El reproductor «${plan.player}» terminó por la señal ${outcome.signal}.`,
    );
  }
  if (outcome.code !== 0) {
    throw new PlayerError(
      `El reproductor «${plan.player}» terminó con código ${outcome.code ?? 'desconocido'}.`,
    );
  }
}
