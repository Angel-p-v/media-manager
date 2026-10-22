import { watch } from 'chokidar';

import { indexLibrary } from './service.js';
import { isVideoFile } from './video.js';

import type { IndexLibraryConfig, IndexingRepositories, IndexStats } from './service.js';

export type WatchLibraryOptions = {
  repositories: IndexingRepositories;
  library: IndexLibraryConfig;
  /** Tiempo de espera para agrupar ráfagas de eventos (copias, renombrados...). */
  debounceMs?: number;
  onIndexed?: (stats: IndexStats) => void;
  onError?: (error: unknown) => void;
};

/** Vigilancia activa de las raíces de la biblioteca. */
export type LibraryWatcher = {
  /** Se resuelve cuando chokidar ha terminado el escaneo inicial. */
  ready: Promise<void>;
  close: () => Promise<void>;
};

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Reindexa la biblioteca cuando cambia un fichero de vídeo.
 *
 * Los eventos se agrupan con un debounce y se ejecuta `indexLibrary`, que ya es
 * incremental: los ficheros sin cambios no se escriben. La reindexación es
 * completa para que las eliminaciones también se detecten; filtrar por raíz
 * desactivaría el borrado de huérfanos en el indexador.
 */
export function watchLibrary(options: WatchLibraryOptions): LibraryWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const watcher = watch(
    options.library.roots.map((root) => root.path),
    {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
    },
  );

  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | null = null;
  let pending = false;

  const run = (): void => {
    if (closed || running !== null) {
      pending = !closed;
      return;
    }

    running = (async (): Promise<void> => {
      try {
        const stats = await indexLibrary(options.repositories, options.library);
        options.onIndexed?.(stats);
      } catch (error) {
        options.onError?.(error);
      } finally {
        running = null;
        if (pending && !closed) {
          pending = false;
          schedule();
        }
      }
    })();
  };

  function schedule(): void {
    if (closed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      run();
    }, debounceMs);
  }

  const onEvent = (event: string, filePath: string): void => {
    if (closed) return;
    if (event === 'unlinkDir') {
      schedule();
      return;
    }
    if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
    if (!isVideoFile(filePath)) return;
    schedule();
  };

  watcher.on('all', onEvent);
  watcher.on('error', (error) => {
    options.onError?.(error);
  });

  const ready = new Promise<void>((resolve, reject) => {
    watcher.once('ready', () => {
      resolve();
    });
    watcher.once('error', reject);
  });

  return {
    ready,
    async close(): Promise<void> {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      watcher.off('all', onEvent);
      await watcher.close();
      if (running !== null) await running;
    },
  };
}
