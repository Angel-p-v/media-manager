import { Box, Text, useApp, useInput } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';

import { Header } from './components/Header.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { StatusBar } from './components/StatusBar.js';
import { useConfig } from './hooks/useConfig.js';
import { matchesKey, useKeymap } from './hooks/useKeymap.js';
import { useLibrary } from './hooks/useLibrary.js';
import { useMediaDetails } from './hooks/useMediaDetails.js';
import { theme } from './theme.js';
import { LibraryView } from './views/Library.js';
import { SearchView } from './views/Search.js';
import { SettingsView } from './views/Settings.js';
import { createLaunchPlan, launchPlayer as spawnPlayer } from '../core/player/launcher.js';
import { selectMediaFile } from '../core/player/selection.js';
import { formatError } from '../shared/errors.js';

import type { Counts, Section, ViewName } from './types.js';
import type { AppConfig } from '../core/config/schema.js';
import type { MediaFileRow } from '../core/db/types.js';
import type { LibraryService } from '../core/library/service.js';
import type { LaunchPlayerFn } from '../core/player/launcher.js';

export type AppProps = {
  config: AppConfig;
  library: LibraryService;
  /** Solo para tests: sustituye al cierre real de Ink. */
  onQuit?: () => void;
  /** Solo para tests: permite observar o simular el lanzamiento del reproductor. */
  launchPlayer?: LaunchPlayerFn;
};

const SECTION_ORDER: readonly Section[] = ['all', 'in-progress', 'series', 'anime', 'movie'];

const VIEW_TITLE: Record<ViewName, string> = {
  library: 'Biblioteca',
  search: 'Búsqueda',
  settings: 'Ajustes',
};

/**
 * Componente raíz de la TUI.
 *
 * Mantiene el estado de navegación local (vista, sección, selección y búsqueda) y
 * delega todas las consultas en `LibraryService`. No escribe SQL ni conoce SQLite.
 */
export function App({
  config,
  library,
  onQuit,
  launchPlayer = spawnPlayer,
}: AppProps): React.JSX.Element {
  const { keybindings } = useConfig(config);
  const { exit } = useApp();
  const [view, setView] = useState<ViewName>('library');
  const [section, setSection] = useState<Section>('all');
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [helpVisible, setHelpVisible] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const type = section === 'all' || section === 'in-progress' ? undefined : section;
  const { items, total, error } = useLibrary(library, {
    limit: view === 'search' ? 100 : 200,
    ...(type === undefined ? {} : { type }),
    ...(view === 'search' ? { query } : {}),
    section: section === 'in-progress' ? 'in-progress' : undefined,
  });
  const safeSelected = items.length === 0 ? 0 : Math.min(selected, items.length - 1);
  const selectedMedia = items[safeSelected];
  const details = useMediaDetails(library, selectedMedia?.id);

  const counts = useMemo<Counts>(() => {
    try {
      const stats = library.stats();
      return {
        all: stats.media.total,
        'in-progress': stats.inProgress,
        series: stats.media.series,
        anime: stats.media.anime,
        movie: stats.media.movie,
      };
    } catch {
      return { all: 0, 'in-progress': 0, series: 0, anime: 0, movie: 0 };
    }
  }, [library]);

  useEffect(() => {
    setSelected(0);
  }, [view, section, query]);

  const exitApp = (): void => {
    if (onQuit !== undefined) {
      onQuit();
      return;
    }
    exit();
  };

  const handleQuit = (): void => {
    // Dentro del buscador, «q» es texto; solo Ctrl+C cierra.
    if (view !== 'search') exitApp();
  };

  const handleSearch = (): void => {
    if (view === 'search') return;
    setView('search');
    setStatus(null);
  };

  const handleSettings = (): void => {
    if (view === 'search') return;
    setView('settings');
    setStatus(null);
  };

  const handleHelp = (): void => {
    if (view === 'search') return;
    setHelpVisible((visible) => !visible);
  };

  const handlePlay = (): void => {
    if (view !== 'library') return;

    if (details === null) {
      setStatus('Selecciona un título para reproducirlo.');
      return;
    }

    try {
      const file = selectMediaFile(details.files);
      // La TUI nunca espera al reproductor: el hijo se desacopla y sigue vivo
      // aunque el usuario cierre Ink justo después.
      const plan = createLaunchPlan({
        playerConfig: config.player,
        filePath: file.filePath,
        mode: 'detach',
      });
      const label = playbackLabel(details.media.title, file);
      setStatus(`Abriendo ${label} en ${plan.player}…`);

      void launchPlayer(plan)
        .then(() => {
          setStatus(`▶ ${label} · ${plan.player}`);
        })
        .catch((error: unknown) => {
          setStatus(formatError(error));
        });
    } catch (error) {
      setStatus(formatError(error));
    }
  };

  const handleNextSection = (): void => {
    if (view !== 'library') return;
    const current = SECTION_ORDER.indexOf(section);
    const next = SECTION_ORDER[(current + 1) % SECTION_ORDER.length] ?? 'all';
    setSection(next);
    setStatus(null);
  };

  const handleEscape = (): void => {
    if (view !== 'library') {
      setView('library');
      setStatus(null);
      return;
    }
    setStatus(null);
  };

  useKeymap(
    keybindings,
    {
      forceQuit: exitApp,
      quit: handleQuit,
      help: handleHelp,
      search: handleSearch,
      settings: handleSettings,
      play: handlePlay,
      nextSection: handleNextSection,
      up: () => {
        if (view !== 'settings') setSelected((index) => Math.max(0, index - 1));
      },
      down: () => {
        if (view === 'settings') return;
        setSelected((index) => Math.min(Math.max(0, items.length - 1), index + 1));
      },
      escape: handleEscape,
    },
    !helpVisible,
  );

  // La ayuda es modal: cualquier tecla de cierre evita que se dispare otra acción.
  useInput((input, key) => {
    if (!helpVisible) return;

    if (key.ctrl && input === 'c') {
      exitApp();
      return;
    }

    if (
      key.escape ||
      matchesKey(keybindings.help ?? '?', input, key) ||
      matchesKey(keybindings.quit ?? 'q', input, key)
    ) {
      setHelpVisible(false);
    }
  });

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      <Header
        title={VIEW_TITLE[view]}
        {...(view === 'library' && section !== 'all' ? { subtitle: section } : {})}
        count={total}
      />
      <Box flexGrow={1} flexDirection="column">
        {helpVisible ? <HelpOverlay bindings={keybindings} /> : null}
        {!helpVisible && view === 'library' ? (
          <LibraryView
            items={items}
            selected={safeSelected}
            section={section}
            counts={counts}
            details={details}
            showDetails={config.ui.showDetails}
          />
        ) : null}
        {!helpVisible && view === 'search' ? (
          <SearchView
            query={query}
            onQueryChange={(value) => {
              setQuery(value);
              setStatus(null);
            }}
            items={items}
            selected={safeSelected}
            details={details}
            showDetails={config.ui.showDetails}
          />
        ) : null}
        {!helpVisible && view === 'settings' ? <SettingsView config={config} /> : null}
      </Box>
      {error === null ? null : (
        <Box paddingX={1}>
          <Text>{theme.error(error)}</Text>
        </Box>
      )}
      <StatusBar bindings={keybindings} message={status} />
    </Box>
  );
}

/** Etiqueta corta del fichero para la barra de estado. */
function playbackLabel(title: string, file: MediaFileRow): string {
  if (file.episode === null) return title;

  const season = file.season === null ? '' : `T${String(file.season).padStart(2, '0')}`;
  const episode = `E${String(file.episode).padStart(2, '0')}`;
  return `${title} · ${season}${episode}`;
}
