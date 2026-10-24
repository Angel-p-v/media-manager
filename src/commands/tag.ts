import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';

export type TagCommandOptions = CommandOptions & {
  action?: 'add' | 'remove' | 'list';
  mediaId?: number;
  tagName?: string;
  json?: boolean;
};

/** Implementa `mm tag`: gestiona etiquetas y su asignación a títulos. */
export async function runTagCommand(options: TagCommandOptions): Promise<void> {
  await withCommandContext(options, ({ library }) => {
    switch (options.action) {
      case 'add': {
        if (!options.mediaId || !options.tagName) {
          console.error(pc.red('Uso: mm tag add <id> <nombre-tag> [--json]'));
          process.exitCode = 2;
          return;
        }
        library.assignTag(options.mediaId, options.tagName);
        if (options.json) {
          console.log(
            JSON.stringify(
              { action: 'add', mediaId: options.mediaId, tag: options.tagName },
              null,
              2,
            ),
          );
        } else {
          console.log(
            pc.green(`Etiqueta «${options.tagName}» asignada al título #${options.mediaId}.`),
          );
        }
        return;
      }
      case 'remove': {
        if (!options.mediaId || !options.tagName) {
          console.error(pc.red('Uso: mm tag remove <id> <nombre-tag> [--json]'));
          process.exitCode = 2;
          return;
        }
        library.unassignTag(options.mediaId, options.tagName);
        if (options.json) {
          console.log(
            JSON.stringify(
              { action: 'remove', mediaId: options.mediaId, tag: options.tagName },
              null,
              2,
            ),
          );
        } else {
          console.log(
            pc.green(`Etiqueta «${options.tagName}» eliminada del título #${options.mediaId}.`),
          );
        }
        return;
      }
      case 'list':
      default: {
        const tags = library.listTags();
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                total: tags.length,
                tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
              },
              null,
              2,
            ),
          );
        } else {
          if (tags.length === 0) {
            console.log(pc.dim('No hay etiquetas definidas.'));
            return;
          }
          console.log(pc.bold('Etiquetas:'));
          for (const tag of tags) {
            console.log(`  #${tag.id}  ${tag.name}${tag.color ? ` (${tag.color})` : ''}`);
          }
        }
        return;
      }
    }
  });
}

/** Adapta los valores de Commander a los tipos del comando. */
export function parseTagOptions(raw: {
  action?: string;
  media?: string;
  tag?: string;
  json?: boolean;
}): TagCommandOptions {
  const action = (raw.action ?? 'list') as 'add' | 'remove' | 'list';

  return {
    action,
    ...(raw.media === undefined ? {} : { mediaId: Number(raw.media) }),
    ...(raw.tag === undefined ? {} : { tagName: raw.tag }),
    ...(raw.json === undefined ? {} : { json: raw.json }),
  };
}
