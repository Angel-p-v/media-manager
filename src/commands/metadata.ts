import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';
import { MetadataService } from '../core/metadata/service.js';

import type { MetadataServiceConfig } from '../core/metadata/service.js';

export type MetadataCommandOptions = CommandOptions & {
  action?: 'fetch' | 'search' | 'clear';
  mediaId?: number;
  query?: string;
  provider?: 'tmdb' | 'tvdb' | 'omdb';
  externalId?: number;
  json?: boolean;
};

/** Implementa `mm metadata`: gestiona metadatos externos (TMDB/TVDB). */
export async function runMetadataCommand(options: MetadataCommandOptions): Promise<void> {
  await withCommandContext(options, async ({ library, logger, config }) => {
    const configValues: MetadataServiceConfig = {
      logger,
      ...(config.metadata?.tmdbApiKey ? { tmdbApiKey: config.metadata.tmdbApiKey } : {}),
      ...(config.metadata?.tvdbApiKey ? { tvdbApiKey: config.metadata.tvdbApiKey } : {}),
      ...(config.metadata?.omdbApiKey ? { omdbApiKey: config.metadata.omdbApiKey } : {}),
    };
    const service = new MetadataService(configValues);

    switch (options.action) {
      case 'search': {
        if (!options.query) {
          console.error(
            pc.red('Uso: mm metadata search <consulta> [--provider tmdb|tvdb|omdb] [--json]'),
          );
          process.exitCode = 2;
          return;
        }

        if (!service.hasProviderConfigured()) {
          console.error(
            pc.red(
              'No hay claves API configuradas. Añade metadata.tmdb_api_key o metadata.tvdb_api_key a tu config.yaml.',
            ),
          );
          process.exitCode = 1;
          return;
        }

        try {
          const results = await service.search(options.query);
          if (options.json) {
            console.log(JSON.stringify({ query: options.query, results }, null, 2));
          } else {
            if (results.length === 0) {
              console.log(pc.dim('No se encontraron resultados.'));
            } else {
              console.log(pc.bold(`Resultados para "${options.query}":`));
              for (const r of results) {
                console.log(
                  `  #${r.externalId}  ${r.title}  (${r.provider}, ${r.releaseDate ?? 'sin fecha'})`,
                );
              }
            }
          }
        } catch (error) {
          console.error(pc.red(`Error buscando: ${(error as Error).message}`));
          process.exitCode = 1;
        }
        return;
      }
      case 'fetch': {
        if (!options.mediaId || !options.provider || !options.externalId) {
          console.error(
            pc.red(
              'Uso: mm metadata fetch <id> --provider tmdb|tvdb|omdb --external-id <id> [--json]',
            ),
          );
          process.exitCode = 2;
          return;
        }

        if (!service.isProviderConfigured(options.provider)) {
          console.error(
            pc.red(
              `Proveedor ${options.provider} no configurado. Añade metadata.${options.provider}_api_key a tu config.yaml.`,
            ),
          );
          process.exitCode = 1;
          return;
        }

        try {
          const details = await service.getDetails(
            options.externalId,
            options.provider,
            options.provider === 'tvdb' ? 'tv' : 'movie',
          );

          const saved = library.setMetadata({
            mediaId: options.mediaId,
            provider: options.provider,
            externalId: options.externalId,
            title: details.title,
            overview: details.overview,
            posterPath: details.posterPath,
            backdropPath: details.backdropPath,
            voteAverage: details.voteAverage,
            releaseDate: details.releaseDate,
            originalLanguage: details.originalLanguage,
          });

          if (options.json) {
            console.log(JSON.stringify(saved, null, 2));
          } else {
            console.log(pc.green(`Metadatos guardados para el título #${options.mediaId}.`));
            console.log(`  Título: ${saved.title}`);
            console.log(`  Voto: ${saved.voteAverage ?? 'N/A'}`);
            console.log(`  Fecha: ${saved.releaseDate ?? 'N/A'}`);
          }
        } catch (error) {
          console.error(pc.red(`Error obteniendo metadatos: ${(error as Error).message}`));
          process.exitCode = 1;
        }
        return;
      }
      case 'clear': {
        if (!options.mediaId) {
          console.error(pc.red('Uso: mm metadata clear <id> [--json]'));
          process.exitCode = 2;
          return;
        }

        const removed = library.removeMetadata(options.mediaId);
        if (options.json) {
          console.log(
            JSON.stringify({ action: 'clear', mediaId: options.mediaId, removed }, null, 2),
          );
        } else {
          if (removed) {
            console.log(pc.green(`Metadatos eliminados del título #${options.mediaId}.`));
          } else {
            console.log(pc.yellow(`No había metadatos para el título #${options.mediaId}.`));
          }
        }
        return;
      }
      default: {
        console.error(pc.red('Uso: mm metadata <fetch|search|clear> [opciones] [--json]'));
        process.exitCode = 2;
        return;
      }
    }
  });
}
