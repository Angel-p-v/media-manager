import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';
import { parseMediaType, parseSortOrder } from './options.js';
import { printMediaList, toMediaJson } from './output.js';

import type { MediaType } from '../core/config/schema.js';
import type { ListMediaOptions } from '../core/db/repositories/mediaRepo.js';

export type ListCommandOptions = CommandOptions & {
  type?: MediaType;
  limit?: number;
  offset?: number;
  sort?: NonNullable<ListMediaOptions['orderBy']>;
  json?: boolean;
};

const DEFAULT_LIMIT = 50;

/** Implementa `mm list`: enumera la biblioteca con filtros y paginación. */
export async function runListCommand(options: ListCommandOptions): Promise<void> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const sort = options.sort ?? 'title';

  await withCommandContext(options, ({ library }) => {
    const items = library.list({
      ...(options.type === undefined ? {} : { type: options.type }),
      limit,
      offset,
      orderBy: sort,
    });
    const total = library.count(options.type);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            total,
            count: items.length,
            offset,
            limit,
            sort,
            items: items.map(toMediaJson),
          },
          null,
          2,
        ),
      );
      return;
    }

    if (total === 0) {
      console.log(
        pc.dim('No hay títulos indexados. Ejecuta «mm index» para escanear tus carpetas.'),
      );
      return;
    }

    if (items.length === 0) {
      console.log(
        pc.dim(`No hay resultados en esta página (${total} títulos en total, offset ${offset}).`),
      );
      return;
    }

    const first = offset + 1;
    const last = offset + items.length;
    console.log(
      pc.bold(`${total} títulos`) +
        pc.dim(` · mostrando ${first}-${last} · orden: ${sort}`) +
        (options.type === undefined ? '' : pc.dim(` · tipo: ${options.type}`)),
    );
    printMediaList(items);
  });
}

/** Adapta los valores de Commander a los tipos del comando. */
export function parseListOptions(raw: {
  type?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Pick<ListCommandOptions, 'type' | 'sort' | 'limit' | 'offset'> {
  return {
    ...(raw.type === undefined ? {} : { type: parseMediaType(raw.type) }),
    ...(raw.sort === undefined ? {} : { sort: parseSortOrder(raw.sort) }),
    ...(raw.limit === undefined ? {} : { limit: raw.limit }),
    ...(raw.offset === undefined ? {} : { offset: raw.offset }),
  };
}
