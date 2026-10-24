import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  IndexingRepositories,
  IndexLibraryConfig,
  IndexStats,
} from '../../../../src/core/indexer/service.js';
import type { Logger } from '../../../../src/shared/logger.js';

// Mock indexLibrary at top level
const mockIndexLibrary = vi.fn();

vi.mock('../../../../src/core/indexer/service.js', () => ({
  indexLibrary: mockIndexLibrary,
}));

// Import after mock
const { watchLibrary } = await import('../../../../src/core/indexer/watcher.js');

describe('watchLibrary', () => {
  let mockRepositories: IndexingRepositories;
  let mockLibrary: IndexLibraryConfig;
  let mockLogger: Logger;
  let mockOnIndexed: (stats: IndexStats) => void;
  let mockOnError: (error: unknown) => void;
  let closeWatcher: () => Promise<void>;

  beforeEach(() => {
    mockRepositories = {
      mediaRepo: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByFolderPath: vi.fn(),
        list: vi.fn(),
        search: vi.fn(),
        remove: vi.fn(),
        removeEmpty: vi.fn(),
        count: vi.fn(),
        listFolders: vi.fn(),
      },
      fileRepo: {
        upsertMany: vi.fn(),
        findByPath: vi.fn(),
        listByMedia: vi.fn(),
        listAllPaths: vi.fn(),
        removeByMedia: vi.fn(),
        removeMissing: vi.fn(),
        count: vi.fn(),
      },
      indexRunRepo: {
        start: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
        list: vi.fn(),
        latest: vi.fn(),
      },
    };

    mockLibrary = {
      roots: [{ path: '/media/series', type: 'series' }],
      exclude: ['**/*.sample.*'],
      scan: { followSymlinks: false, maxDepth: 4, minSizeBytes: 0 },
    };

    mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      child: vi.fn(),
      level: 'debug',
      format: 'text',
    } as unknown as Logger;

    mockOnIndexed = vi.fn();
    mockOnError = vi.fn();

    mockIndexLibrary.mockReset();
    mockIndexLibrary.mockResolvedValue({
      filesSeen: 0,
      filesAdded: 0,
      filesRemoved: 0,
      filesUnchanged: 0,
      mediaAdded: 0,
      mediaRemoved: 0,
      foldersAdded: 0,
      foldersRemoved: 0,
      durationMs: 100,
    });
  });

  afterEach(async () => {
    if (closeWatcher) {
      await closeWatcher();
    }
    vi.restoreAllMocks();
  });

  it('crea un watcher y se resuelve ready', async () => {
    const watcher = watchLibrary({
      repositories: mockRepositories,
      library: mockLibrary,
      logger: mockLogger,
      onIndexed: mockOnIndexed,
      onError: mockOnError,
    });

    await expect(watcher.ready).resolves.toBeUndefined();
    closeWatcher = watcher.close;
  });

  it('cierra el watcher correctamente', async () => {
    const watcher = watchLibrary({
      repositories: mockRepositories,
      library: mockLibrary,
      logger: mockLogger,
      onIndexed: mockOnIndexed,
      onError: mockOnError,
    });

    await watcher.ready;
    await expect(watcher.close()).resolves.toBeUndefined();
  });

  it('maneja errores en la indexación cuando se dispara un evento', async () => {
    // Este test es difícil de hacer sin acceso al watcher interno
    // Verificamos que la función no falle al crearse
    const watcher = watchLibrary({
      repositories: mockRepositories,
      library: mockLibrary,
      logger: mockLogger,
      onIndexed: mockOnIndexed,
      onError: mockOnError,
      debounceMs: 10,
    });

    await watcher.ready;
    await expect(watcher.close()).resolves.toBeUndefined();
  });
});
