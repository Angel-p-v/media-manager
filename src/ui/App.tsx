import { Box, Text, useApp, useInput } from 'ink';
import React, { useEffect, useMemo, useState } from 'react';

import { Header } from './components/Header.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { StatusBar } from './components/StatusBar.js';
import { useConfig } from './hooks/useConfig.js';
import { matchesKey, useKeymap } from './hooks/useKeymap.js';
import { useLibrary } from './hooks/useLibrary.js';
import { useMediaDetails } from './hooks/useMediaDetails.js';
import { theme, setTheme } from './theme.js';
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

const SECTION_ORDER: readonly Section[] = [
  'all',
  'in-progress',
  'favorites',
  'series',
  'anime',
  'movie',
];

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
function AppImpl({
  config,
  library,
  onQuit,
  launchPlayer = spawnPlayer,
}: AppProps): React.JSX.Element {
  const { keybindings } = useConfig(config);
  setTheme(config.ui.theme);
  const { exit } = useApp();
  const [view, setView] = useState<ViewName>('library');
  const [section, setSection] = useState<Section>('all');
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [helpVisible, setHelpVisible] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshingMetadata, setRefreshingMetadata] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(config.ui.showDetails);

  const type =
    section === 'all' || section === 'in-progress' || section === 'favorites' ? undefined : section;
  const { items, total, error } = useLibrary(library, {
    limit: view === 'search' ? 100 : 200,
    ...(type === undefined ? {} : { type }),
    ...(view === 'search' ? { query } : {}),
    section:
      section === 'in-progress' ? 'in-progress' : section === 'favorites' ? 'favorites' : undefined,
  });
  const safeSelected = items.length === 0 ? 0 : Math.min(selected, items.length - 1);
  const selectedMedia = items[safeSelected];
  const details = useMediaDetails(library, selectedMedia?.id);

  const counts = useMemo<Counts>(() => {
    try {
      const stats = library.stats();
      const favoritesCount = library.countFavorites();
      return {
        all: stats.media.total,
        'in-progress': stats.inProgress,
        favorites: favoritesCount,
        series: stats.media.series,
        anime: stats.media.anime,
        movie: stats.media.movie,
      };
    } catch {
      return { all: 0, 'in-progress': 0, favorites: 0, series: 0, anime: 0, movie: 0 };
    }
  }, [library]);

  useEffect(() => {
    setSelected(0);
  }, [view, section, query]);

  // Sincronización automática de metadatos expirados al montar la TUI.
  // Si hay metadatos expirados y un proveedor configurado, se refrescan
  // automáticamente al abrir la biblioteca (M19.2).
  useEffect(() => {
    if (view !== 'library') return;
    const expiredCount = library.getExpiredMetadataCount();
    if (expiredCount > 0 && library.hasMetadataProviderConfigured()) {
      setStatus(`Refrescando ${expiredCount} metadatos expirados…`);
      void library
        .refreshExpiredMetadata()
        .then(({ refreshed, failed }) => {
          if (refreshed === 0 && failed === 0) {
            setStatus('No hay metadatos expirados para actualizar.');
          } else if (failed === 0) {
            setStatus(`Metadatos actualizados: ${refreshed}.`);
          } else {
            setStatus(`Metadatos actualizados: ${refreshed} correctos, ${failed} fallidos.`);
          }
        })
        .catch(() => {
          setStatus('No se pudieron refrescar los metadatos expirados.');
        });
    }
  }, [library, config.metadata?.cacheTtlHours, view]);

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

  const handleRefreshMetadata = (): void => {
    if (view !== 'library' || selectedMedia === undefined) return;
    setRefreshingMetadata(true);
    setStatus('Obteniendo metadatos…');
    void library.getOrFetchMetadata(selectedMedia.id).then(
      () => {
        setStatus('Metadatos actualizados.');
        setRefreshingMetadata(false);
      },
      () => {
        setStatus('No se pudieron obtener metadatos.');
        setRefreshingMetadata(false);
      },
    );
  };

  const handleGotoTaggedMedia = (): void => {
    if (view !== 'library') return;
    const start = (selected + 1) % items.length;
    for (let i = 0; i < items.length; i++) {
      const idx = (start + i) % items.length;
      const media = items[idx];
      if (media === undefined) continue;
      const meta = library.getMetadata(media.id);
      if (meta) {
        setSelected(idx);
        setStatus(`Metadatos disponibles para "${media.title}".`);
        return;
      }
    }
    setStatus('No hay títulos con metadatos en esta sección.');
  };

  const handleRefreshAllMetadata = (): void => {
    if (view !== 'library') return;
    setRefreshingMetadata(true);
    setStatus('Refrescando metadatos expirados…');
    void library
      .refreshExpiredMetadata()
      .then(
        ({ refreshed, failed }) => {
          if (refreshed === 0 && failed === 0) {
            setStatus('No hay metadatos expirados para actualizar.');
          } else {
            setStatus(`Metadatos actualizados: ${refreshed} actualizados, ${failed} fallidos.`);
          }
        },
        () => {
          setStatus('No se pudieron refrescar los metadatos.');
        },
      )
      .finally(() => {
        setRefreshingMetadata(false);
      });
  };

  const handleGoToDetails = (): void => {
    if (view !== 'library') return;
    setDetailsVisible((visible) => !visible);
    if (!detailsVisible && selectedMedia === undefined) {
      setStatus('Selecciona un título para ver sus detalles.');
    }
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
      refreshMetadata: handleRefreshMetadata,
      refreshAll: handleRefreshAllMetadata,
      goToDetails: handleGoToDetails,
      gotoTaggedMedia: handleGotoTaggedMedia,
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
            showDetails={detailsVisible}
            library={library}
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
            library={library}
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
      {refreshingMetadata && (
        <Box paddingX={1}>
          <Text>{theme.muted('  actualizando metadatos…')}</Text>
        </Box>
      )}
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

/** Exportación nombrada para compatibilidad con ESM y verbatimModuleSyntax. */
export { AppImpl as App };
