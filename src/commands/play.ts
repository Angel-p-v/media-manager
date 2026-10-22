import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';
import { formatEpisode, toMediaFileJson, toMediaJson } from './output.js';
import {
  createLaunchPlan,
  launchPlayer,
  type LaunchMode,
  type LaunchPlan,
} from '../core/player/launcher.js';
import { selectMediaFile } from '../core/player/selection.js';

import type { MediaFileRow, MediaRow } from '../core/db/types.js';

export type PlayCommandOptions = CommandOptions & {
  file?: number;
  player?: string;
  foreground?: boolean;
  dryRun?: boolean;
  json?: boolean;
};

type PlayJson = {
  player: string;
  command: string;
  args: string[];
  mode: LaunchMode;
  media: ReturnType<typeof toMediaJson>;
  file: ReturnType<typeof toMediaFileJson>;
  pid: number | null;
};

/** Implementa `mm play`: resuelve un título y lo abre en el reproductor configurado. */
export async function runPlayCommand(query: string, options: PlayCommandOptions): Promise<void> {
  await withCommandContext(options, async ({ config, library }) => {
    const { media, files } = library.find(query);
    const file = selectMediaFile(files, options.file);
    const mode: LaunchMode = options.foreground === true ? 'foreground' : config.player.onLaunch;

    const plan = createLaunchPlan({
      playerConfig: config.player,
      filePath: file.filePath,
      ...(options.player === undefined ? {} : { playerName: options.player }),
      mode,
    });

    if (options.dryRun === true) {
      if (options.json === true) {
        console.log(JSON.stringify(toPlayJson(plan, media, file, null), null, 2));
        return;
      }

      console.log(pc.bold('Comando de reproducción') + pc.dim(` (${plan.mode})`));
      console.log(`  ${formatCommand(plan.command, plan.args)}`);
      console.log(pc.dim(`  ${media.title} · ${formatEpisode(file)} · ${plan.filePath}`));
      console.log(pc.dim('  No se ha lanzado ningún proceso.'));
      return;
    }

    const handle = await launchPlayer(plan);

    if (options.json === true) {
      // En foreground, el JSON representa el resultado final, no solo el arranque.
      if (plan.mode === 'foreground') await handle.wait();
      console.log(JSON.stringify(toPlayJson(plan, media, file, handle.pid ?? null), null, 2));
      return;
    }

    const year = media.year === null ? '' : ` (${media.year})`;
    console.log(
      `▶ ${pc.bold(`${media.title}${year}`)} · ${pc.cyan(formatEpisode(file))} · ${plan.player}`,
    );
    console.log(pc.dim(`  ${plan.filePath}`));

    if (plan.mode === 'foreground') {
      await handle.wait();
      console.log(pc.dim('El reproductor se ha cerrado.'));
    }
  });
}

function toPlayJson(
  plan: LaunchPlan,
  media: MediaRow,
  file: MediaFileRow,
  pid: number | null,
): PlayJson {
  return {
    player: plan.player,
    command: plan.command,
    args: plan.args,
    mode: plan.mode,
    media: toMediaJson(media),
    file: toMediaFileJson(file),
    pid,
  };
}

/** Representa el comando para humanos; no se usa para ejecutarlo. */
function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(quoteArgument).join(' ');
}

function quoteArgument(value: string): string {
  if (/^[A-Za-z0-9_./:=+,@%-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
