import { existsSync } from 'node:fs';

import pc from 'picocolors';

import { loadConfig, resolveConfigPath } from '../core/config/loader.js';

export type ConfigCommandOptions = {
  path?: boolean;
  validate?: boolean;
  json?: boolean;
  config?: string;
};

/** Implementa `mm config`. */
export async function runConfigCommand(options: ConfigCommandOptions): Promise<void> {
  const configPath =
    options.config === undefined
      ? resolveConfigPath()
      : resolveConfigPath({ configPath: options.config });

  if (options.path) {
    console.log(configPath);
    return;
  }

  const exists = existsSync(configPath);

  if (options.validate) {
    await loadConfig({ configPath });
    console.log(
      pc.green('✔') +
        ` Configuración válida${exists ? '' : pc.dim(' (se usarán los valores por defecto)')}`,
    );
    return;
  }

  const config = await loadConfig({ configPath });

  if (options.json) {
    console.log(
      JSON.stringify({ configPath, source: exists ? configPath : 'defaults', config }, null, 2),
    );
    return;
  }

  console.log(pc.bold(pc.cyan('Configuración efectiva')));
  console.log(pc.dim(`  archivo: ${exists ? configPath : 'sin archivo (valores por defecto)'}`));
  console.log('');
  console.log(pc.bold('  biblioteca'));
  if (config.library.roots.length === 0) {
    console.log(pc.dim('    (sin raíces configuradas)'));
  }
  for (const root of config.library.roots) {
    console.log(`    ${pc.green('•')} ${root.path} ${pc.dim(`[${root.type}]`)}`);
  }
  console.log('');
  console.log(pc.bold('  base de datos'));
  console.log(`    ${config.database.path}`);
  console.log('');
  console.log(pc.bold('  reproductor'));
  console.log(`    por defecto: ${config.player.default}`);
  console.log(`    disponibles: ${Object.keys(config.player.players).join(', ') || '(ninguno)'}`);
  console.log('');
  console.log(pc.bold('  exclusiones'));
  for (const pattern of config.library.exclude) {
    console.log(`    ${pc.dim(pattern)}`);
  }
  console.log('');
  console.log(pc.dim(`  atajos: ${Object.keys(config.keybindings).length} definidos`));
}
