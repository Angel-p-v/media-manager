import { describe, expect, it, vi } from 'vitest';

import { createLibraryService } from '../../../src/core/library/service.js';
import { AmbiguousError, NotFoundError } from '../../../src/shared/errors.js';

import type { FileRepository } from '../../../src/core/db/repositories/fileRepo.js';
import type {
  ListMediaOptions,
  MediaRepository,
  SearchMediaOptions,
} from '../../../src/core/db/repositories/mediaRepo.js';
import type { MetadataRepository } from '../../../src/core/db/repositories/metadataRepo.js';
import type { PlaybackRepository } from '../../../src/core/db/repositories/playbackRepo.js';
import type { PreferenceRepository } from '../../../src/core/db/repositories/preferencesRepo.js';
import type { TagRepository } from '../../../src/core/db/repositories/tagRepo.js';
import type { IndexRunRow, MediaFileRow, MediaRow } from '../../../src/core/db/types.js';
import type { MetadataService } from '../../../src/core/metadata/service.js';

const dark: MediaRow = {
  id: 1,
  type: 'series',
  title: 'Dark',
  sortTitle: 'dark',
  year: 2017,
  folderPath: '/media/series/Dark',
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
};

const darkMatter: MediaRow = {
  ...dark,
  id: 2,
  title: 'Dark Matter',
  sortTitle: 'dark matter',
  folderPath: '/media/series/Dark Matter',
};

const amelie: MediaRow = {
  ...dark,
  id: 3,
  type: 'movie',
  title: 'Amélie',
  sortTitle: 'amélie',
  year: 2001,
  folderPath: '/media/movies/Amelie.mkv',
};

function mediaRow(id: number, title: string): MediaRow {
  return { ...dark, id, title, sortTitle: title.toLocaleLowerCase() };
}

function fakeMediaRepository(overrides: Partial<MediaRepository> = {}): MediaRepository {
  const notImplemented = (): never => {
    throw new Error('método no esperado en el doble de prueba');
  };

  return {
    upsert: notImplemented,
    findById: () => undefined,
    findByFolderPath: () => undefined,
    list: () => [],
    search: () => [],
    remove: () => false,
    removeEmpty: () => 0,
    count: () => 0,
    listFolders: () => [],
    updateFolderPath: notImplemented,
    ...overrides,
  };
}

function fakeFileRepository(files: Partial<Record<number, MediaFileRow[]>> = {}): FileRepository {
  const notImplemented = (): never => {
    throw new Error('método no esperado en el doble de prueba');
  };

  return {
    upsertMany: notImplemented,
    findByPath: () => undefined,
    listByMedia: (mediaId) => files[mediaId] ?? [],
    listAllPaths: () => [],
    removeByMedia: () => 0,
    removeMissing: () => 0,
    count: () => Object.values(files).reduce((total, list) => total + (list?.length ?? 0), 0),
    updateFilePath: notImplemented,
  };
}

function fakeIndexRunRepository(lastRun: IndexRunRow | undefined): {
  latest: () => IndexRunRow | undefined;
  start: () => number;
  complete: () => void;
  fail: () => void;
  list: () => IndexRunRow[];
} {
  return {
    start: () => 1,
    complete: () => undefined,
    fail: () => undefined,
    latest: () => lastRun,
    list: () => (lastRun ? [lastRun] : []),
  };
}

function fakePlaybackRepository(): PlaybackRepository {
  return {
    save: () => ({
      mediaFileId: 1,
      positionSeconds: 0,
      durationSeconds: null,
      completedAt: null,
      lastPlayedAt: '',
      playCount: 0,
      updatedAt: '',
    }),
    get: () => undefined,
    remove: () => false,
    listInProgress: () => [],
    listRecent: () => [],
    count: () => 0,
  };
}

function fakePreferenceRepository(): PreferenceRepository {
  return {
    get: () => undefined,
    isFavorite: () => false,
    setFavorite: () => ({ mediaId: 0, favorite: false, createdAt: '', updatedAt: '' }),
    remove: () => false,
    listFavorites: () => [],
    countFavorites: () => 0,
  };
}

function fakeTagRepository(): TagRepository {
  return {
    create: () => ({ id: 1, name: 'test', color: null, createdAt: '' }),
    get: () => undefined,
    getByName: () => undefined,
    list: () => [],
    update: () => false,
    remove: () => false,
    assign: () => undefined,
    unassign: () => undefined,
    unassignAll: () => undefined,
    listByMedia: () => [],
    listMediaByTag: () => [],
    countByTag: () => 0,
  };
}

function fakeMetadataRepository(): MetadataRepository {
  return {
    get: () => undefined,
    searchByExternalId: () => undefined,
    set: () => ({
      mediaId: 0,
      provider: 'tmdb',
      externalId: 0,
      title: '',
      overview: null,
      posterPath: null,
      backdropPath: null,
      voteAverage: null,
      firstAirDate: null,
      releaseDate: null,
      originalLanguage: null,
      fetchedAt: '',
      updatedAt: '',
      localPosterPath: null,
    }),
    remove: () => false,
    listExpired: () => [],
  };
}

function fakeMetadataService(): MetadataService {
  return {
    searchTmdb: async () => {
      await Promise.resolve();
      return [];
    },
    getTmdbDetails: async () => {
      await Promise.resolve();
      return {
        mediaId: 0,
        provider: 'tmdb',
        externalId: 0,
        title: '',
        overview: null,
        posterPath: null,
        backdropPath: null,
        voteAverage: null,
        firstAirDate: null,
        releaseDate: null,
        originalLanguage: null,
        fetchedAt: '',
        updatedAt: '',
      };
    },
    searchTvdb: async () => {
      await Promise.resolve();
      return [];
    },
    getTvdbDetails: async () => {
      await Promise.resolve();
      return {
        mediaId: 0,
        provider: 'tvdb',
        externalId: 0,
        title: '',
        overview: null,
        posterPath: null,
        backdropPath: null,
        voteAverage: null,
        firstAirDate: null,
        releaseDate: null,
        originalLanguage: null,
        fetchedAt: '',
        updatedAt: '',
      };
    },
    search: async () => {
      await Promise.resolve();
      return [];
    },
    getDetails: async () => {
      await Promise.resolve();
      return {
        mediaId: 0,
        provider: 'tmdb',
        externalId: 0,
        title: '',
        overview: null,
        posterPath: null,
        backdropPath: null,
        voteAverage: null,
        firstAirDate: null,
        releaseDate: null,
        originalLanguage: null,
        fetchedAt: '',
        updatedAt: '',
      };
    },
    hasProviderConfigured: () => false,
    isProviderConfigured: () => false,
  } as unknown as MetadataService;
}

function service(
  overrides: Partial<MediaRepository> = {},
  files: Partial<Record<number, MediaFileRow[]>> = {},
) {
  return createLibraryService({
    mediaRepo: fakeMediaRepository(overrides),
    fileRepo: fakeFileRepository(files),
    indexRunRepo: fakeIndexRunRepository(undefined),
    playbackRepo: fakePlaybackRepository(),
    preferenceRepo: fakePreferenceRepository(),
    tagRepo: fakeTagRepository(),
    metadataRepo: fakeMetadataRepository(),
    metadataService: fakeMetadataService(),
    metadataConfig: { cacheTtlHours: 24 },
  });
}

describe('createLibraryService', () => {
  describe('list', () => {
    it('delega en el repositorio con los filtros recibidos', () => {
      const list = vi.fn((_options?: ListMediaOptions) => [dark, darkMatter]);
      const library = service({ list });

      expect(library.list({ type: 'series', limit: 2 })).toEqual([dark, darkMatter]);
      expect(list).toHaveBeenCalledWith({ type: 'series', limit: 2 });
    });
  });

  describe('search', () => {
    it('delega en el repositorio y respeta tipo y límite', () => {
      const search = vi.fn((_query: string, _options?: SearchMediaOptions) => [dark]);
      const library = service({ search });

      expect(library.search('dar', { type: 'series', limit: 5 })).toEqual([dark]);
      expect(search).toHaveBeenCalledWith('dar', { type: 'series', limit: 5 });
    });
  });

  describe('find', () => {
    it('resuelve por id numérico y adjunta sus ficheros', () => {
      const file: MediaFileRow = {
        id: 10,
        mediaId: 1,
        season: 1,
        episode: 2,
        title: null,
        filePath: '/media/series/Dark/S01E02.mkv',
        sizeBytes: 100,
        mtimeMs: 1,
        indexedAt: '2026-01-01 00:00:00',
      };
      const library = service({ findById: (id) => (id === 1 ? dark : undefined) }, { 1: [file] });

      expect(library.find('1')).toEqual({ media: dark, files: [file] });
    });

    it('prefiere la coincidencia exacta de título sobre los resultados parciales', () => {
      const library = service({
        search: () => [darkMatter, dark],
      });

      expect(library.find('Dark').media).toEqual(dark);
    });

    it('compara títulos sin acentos ni mayúsculas', () => {
      const library = service({
        search: () => [amelie],
      });

      expect(library.find('amelie').media).toEqual(amelie);
    });

    it('falla con un error explícito si no hay coincidencias', () => {
      const library = service();

      expect(() => library.find('inexistente')).toThrow(NotFoundError);
    });

    it('falla si la consulta está vacía', () => {
      const library = service();

      expect(() => library.find('   ')).toThrow(/Indica un id o un título/);
    });

    it('pide desambiguar cuando hay varios títulos y enumera los ids', () => {
      const library = service({
        search: () => [mediaRow(7, 'Cowboy Bebop'), mediaRow(8, 'Cowboy Bebop: Knockin')],
      });

      expect(() => library.find('cowboy')).toThrow(AmbiguousError);
      expect(() => library.find('cowboy')).toThrow(/#7 Cowboy Bebop/);
      expect(() => library.find('cowboy')).toThrow(/Usa el id/);
    });

    it('acepta un número que no es id cuando coincide con un título', () => {
      const movie = mediaRow(42, '1917');
      const library = service({
        findById: () => undefined,
        search: () => [movie],
      });

      expect(library.find('1917').media).toEqual(movie);
    });
  });

  describe('stats', () => {
    it('agrega conteos y la última ejecución de indexado', () => {
      const lastRun: IndexRunRow = {
        id: 4,
        startedAt: '2026-01-01 00:00:00',
        finishedAt: '2026-01-01 00:00:03',
        filesSeen: 10,
        filesAdded: 2,
        filesRemoved: 1,
        status: 'completed',
      };
      const library = createLibraryService({
        mediaRepo: fakeMediaRepository({
          count: (type) => (type === undefined ? 3 : type === 'series' ? 2 : 0),
        }),
        fileRepo: fakeFileRepository({ 1: [], 2: [] }),
        indexRunRepo: fakeIndexRunRepository(lastRun),
        playbackRepo: fakePlaybackRepository(),
        preferenceRepo: fakePreferenceRepository(),
        tagRepo: fakeTagRepository(),
        metadataRepo: fakeMetadataRepository(),
        metadataService: fakeMetadataService(),
        metadataConfig: { cacheTtlHours: 24 },
      });

      expect(library.stats()).toEqual({
        media: { total: 3, series: 2, anime: 0, movie: 0 },
        files: 0,
        lastRun,
        inProgress: 0,
      });
    });

    it('devuelve lastRun null si nunca se ha indexado', () => {
      const library = service();

      expect(library.stats().lastRun).toBeNull();
      expect(library.stats().inProgress).toBe(0);
    });
  });
});
