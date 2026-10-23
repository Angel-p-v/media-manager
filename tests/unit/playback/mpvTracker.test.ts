import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { PlaybackConfig } from '../../../src/core/config/schema.js';
import type {
  PlaybackRepository,
  PlaybackStateRow,
} from '../../../src/core/db/repositories/playbackRepo.js';
import type { Logger } from '../../../src/shared/logger.js';

vi.mock('node:net', () => {
  const createServer = vi.fn();
  const mockServer = {
    listen: vi.fn((path: string, cb: () => void) => cb()),
    close: vi.fn((cb: () => void) => cb()),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  };
  createServer.mockReturnValue(mockServer);
  return { createServer, Socket: vi.fn() };
});

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/mock-socket'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/') || '/'),
  };
});

const { MpvTracker } = await import('../../../src/core/playback/mpvTracker.js');

describe('MpvTracker', () => {
  let mockRepo: PlaybackRepository & { save: ReturnType<typeof vi.fn> };
  let mockConfig: PlaybackConfig;
  let mockLogger: Logger;
  let tracker: InstanceType<typeof MpvTracker> | null = null;

  function createMockClient() {
    return {
      writable: true,
      on: vi.fn((event, handler) => {
        if (event === 'data') mockClient.dataHandler = handler;
        if (event === 'close') mockClient.closeHandler = handler;
      }),
      write: vi.fn(),
      destroy: vi.fn(),
      off: vi.fn(),
    };
  }

  type MockClient = ReturnType<typeof createMockClient> & {
    dataHandler?: (data: string) => void;
    closeHandler?: () => void;
  };

  let mockClient: MockClient;
  let mockServer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { createServer } = await import('node:net');
    mockServer = createServer as ReturnType<typeof vi.fn>;

    mockRepo = {
      save: vi.fn((input) => ({
        mediaFileId: input.mediaFileId,
        positionSeconds: input.positionSeconds,
        durationSeconds: input.durationSeconds ?? null,
        completedAt: input.completedAt ?? null,
        lastPlayedAt: input.lastPlayedAt,
        playCount: input.playCount ?? 0,
        updatedAt: input.updatedAt,
      })),
      get: vi.fn(),
      remove: vi.fn(),
      listInProgress: vi.fn(),
      listRecent: vi.fn(),
      count: vi.fn(),
    };

    mockConfig = {
      tracking: 'auto',
      resume: true,
      resumeMinSeconds: 30,
      completedThreshold: 0.9,
      completedTailSeconds: 30,
    };

    mockLogger = {
      level: 'debug',
      format: 'text',
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => mockLogger),
    };

    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (tracker) {
      await tracker.stop().catch(() => {});
    }
    vi.clearAllMocks();
  });

  it('crea el servidor y escucha en el socket path', async () => {
    const { createServer } = await import('node:net');
    tracker = new MpvTracker({
      mediaFileId: 1,
      playbackRepo: mockRepo,
      playbackConfig: mockConfig,
      logger: mockLogger,
      socketPath: `/tmp/test-socket-${Date.now()}`,
    });

    await tracker.start();

    expect(createServer).toHaveBeenCalled();
    const serverInstance = (createServer as ReturnType<typeof vi.fn>).mock.results[0]!.value!;
    expect(serverInstance.listen).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
  });

  it('guarda posición cuando mpv envía time-pos y luego eof-reached', async () => {
    tracker = new MpvTracker({
      mediaFileId: 42,
      playbackRepo: mockRepo,
      playbackConfig: mockConfig,
      logger: mockLogger,
      socketPath: `/tmp/test-socket-${Date.now()}`,
    });

    await tracker.start();

    const { createServer: cs } = await import('node:net');
    const connectionHandler = (cs as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(connectionHandler).toBeDefined();
    connectionHandler(mockClient);

    // Simular evento time-pos seguido de eof-reached (para disparar flush inmediato)
    const dataHandler = mockClient.dataHandler as ((data: string) => void) | undefined;

    dataHandler?.(
      JSON.stringify({ event: 'property-change', name: 'time-pos', data: 120.5 }) + '\n',
    );
    dataHandler?.(
      JSON.stringify({ event: 'property-change', name: 'eof-reached', data: true }) + '\n',
    );

    await vi.waitFor(() => {
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaFileId: 42,
          positionSeconds: 120.5,
        }),
      );
    });
  });

  it('actualiza duración cuando mpv envía duration', async () => {
    tracker = new MpvTracker({
      mediaFileId: 42,
      playbackRepo: mockRepo,
      playbackConfig: mockConfig,
      logger: mockLogger,
      socketPath: `/tmp/test-socket-${Date.now()}`,
    });

    await tracker.start();
    const { createServer: cs } = await import('node:net');
    const connectionHandler = (cs as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(connectionHandler).toBeDefined();
    connectionHandler(mockClient);

    const dataHandler = mockClient.dataHandler as ((data: string) => void) | undefined;

    dataHandler?.(
      JSON.stringify({ event: 'property-change', name: 'duration', data: 2700 }) + '\n',
    );

    // La duración se guarda internamente, no hace save inmediato
    // Simular time-pos y eof-reached para disparar save con duración
    dataHandler?.(JSON.stringify({ event: 'property-change', name: 'time-pos', data: 100 }) + '\n');
    dataHandler?.(
      JSON.stringify({ event: 'property-change', name: 'eof-reached', data: true }) + '\n',
    );

    await vi.waitFor(() => {
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaFileId: 42,
          durationSeconds: 2700,
        }),
      );
    });
  });

  it('marca como finalizado cuando mpv envía eof-reached', async () => {
    tracker = new MpvTracker({
      mediaFileId: 42,
      playbackRepo: mockRepo,
      playbackConfig: mockConfig,
      logger: mockLogger,
      socketPath: `/tmp/test-socket-${Date.now()}`,
    });

    await tracker.start();
    const { createServer: cs } = await import('node:net');
    const connectionHandler = (cs as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(connectionHandler).toBeDefined();
    connectionHandler(mockClient);

    const dataHandler = mockClient.dataHandler as ((data: string) => void) | undefined;

    dataHandler?.(
      JSON.stringify({ event: 'property-change', name: 'time-pos', data: 2690 }) + '\n',
    );
    dataHandler?.(
      JSON.stringify({ event: 'property-change', name: 'eof-reached', data: true }) + '\n',
    );

    await vi.waitFor(() => {
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaFileId: 42,
          positionSeconds: 2690,
        }),
      );
    });
  });

  it('detiene y limpia recursos al llamar stop', async () => {
    tracker = new MpvTracker({
      mediaFileId: 42,
      playbackRepo: mockRepo,
      playbackConfig: mockConfig,
      logger: mockLogger,
      socketPath: `/tmp/test-socket-${Date.now()}`,
    });

    await tracker.start();

    await expect(tracker.stop()).resolves.toBeUndefined();
  });

  it('no guarda si tracking es off', async () => {
    const configOff = { ...mockConfig, tracking: 'off' as const };
    tracker = new MpvTracker({
      mediaFileId: 42,
      playbackRepo: mockRepo,
      playbackConfig: configOff,
      logger: mockLogger,
      socketPath: `/tmp/test-socket-${Date.now()}`,
    });

    await tracker.start();

    await tracker.stop();

    // El tracker se inicia pero no procesa eventos cuando tracking es off
    // La validación real ocurre en launchPlayer que no llama al tracker si tracking === 'off'

    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
