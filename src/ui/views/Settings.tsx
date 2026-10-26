import { Box, Text, useInput } from 'ink';
import React, { useCallback, useState } from 'react';

import { saveConfig } from '../../core/config/loader.js';
import { shortenPath, theme } from '../theme.js';

import type { AppConfig } from '../../core/config/schema.js';

/** Ítem editable de la configuración (raíz de biblioteca o ruta de base de datos). */
type SettingsItem = {
  /** Identificador único del ítem. */
  id: string;
  /** Etiqueta mostrada a la izquierda (p. ej. "series  "). */
  label: string;
  /** Valor actual (p. ej. ruta de la carpeta). */
  value: string;
  /** Valor original antes de empezar a editar (para restaurar al cancelar). */
  originalValue: string;
  /** Si el ítem está en modo edición. */
  editing: boolean;
};

/** Vista de configuración editable desde la TUI. */
export function SettingsView({
  config,
  configPath,
  onSave,
  onBack,
}: {
  config: AppConfig;
  /** Ruta del archivo de configuración (para guardar cambios). */
  configPath: string | undefined;
  /** Callback opcional tras guardar cambios. */
  onSave?: () => void;
  /** Callback para volver a la vista anterior (biblioteca). */
  onBack?: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<SettingsItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  /** Valor que se está editando actualmente (construido caracter a caracter). */
  const [editingValue, setEditingValue] = useState('');

  /** Reconstruye la lista de ítems editables a partir de la config. */
  const rebuildItems = useCallback((nextConfig: AppConfig): SettingsItem[] => {
    const items: SettingsItem[] = [];

    nextConfig.library.roots.forEach((root, index) => {
      items.push({
        id: `library-root-${index}`,
        label: `${root.type.padEnd(7)}`,
        value: root.path,
        originalValue: root.path,
        editing: false,
      });
    });

    items.push({
      id: 'database-path',
      label: 'Base de datos',
      value: nextConfig.database.path,
      originalValue: nextConfig.database.path,
      editing: false,
    });

    return items;
  }, []);

  // Sincronizamos ítems con la config entrante preservando el estado de edición.
  React.useEffect(() => {
    const next = rebuildItems(config);
    const merged = next.map((item) => {
      const existing = items.find((i) => i.id === item.id);
      return { ...item, editing: existing?.editing ?? false };
    });
    setItems(merged);
    if (selectedIndex >= merged.length) {
      setSelectedIndex(Math.max(0, merged.length - 1));
    }
  }, [config, rebuildItems, items, selectedIndex]);

  const itemCount = items.length;
  const hasItems = itemCount > 0;
  const selectedItem = hasItems ? items[selectedIndex] : null;
  const isEditing = selectedItem?.editing ?? false;

  /**
   * Navega al ítem siguiente o anterior dentro de la lista de ajustes.
   */
  const moveSelection = useCallback(
    (delta: number): void => {
      if (!hasItems || isEditing) return;
      setSelectedIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return itemCount - 1;
        if (next >= itemCount) return 0;
        return next;
      });
      setStatus(null);
    },
    [hasItems, itemCount, isEditing],
  );

  /** Entra en modo edición del ítem seleccionado. */
  const startEdit = useCallback((): void => {
    const item = selectedItem;
    if (!item) return;
    setEditingValue(item.value);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, editing: true } : it)));
    setStatus('Escribe el nuevo valor. Enter para guardar, Escape para cancelar.');
  }, [selectedItem]);

  /** Guarda el valor editado y persiste la configuración. */
  const saveEdit = useCallback(
    (newValue: string): void => {
      const item = selectedItem;
      if (!item || !configPath) {
        setStatus('No se puede guardar: no hay ruta de configuración.');
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, value: newValue, editing: false, originalValue: newValue }
            : it,
        ),
      );

      const nextConfig: AppConfig = { ...config };

      if (item.id.startsWith('library-root-')) {
        const index = Number(item.id.split('-').pop());
        nextConfig.library = {
          ...nextConfig.library,
          roots: nextConfig.library.roots.map((root, i) =>
            i === index ? { ...root, path: newValue } : root,
          ),
        };
      } else if (item.id === 'database-path') {
        nextConfig.database = { ...nextConfig.database, path: newValue };
      }

      void saveConfig(nextConfig, configPath)
        .then(() => {
          setStatus('Guardado.');
          setEditingValue('');
          onSave?.();
        })
        .catch(() => {
          setStatus('No se pudo guardar la configuración.');
        });
    },
    [selectedItem, config, configPath, onSave],
  );

  /** Cancela la edición y restaura el valor original. */
  const cancelEdit = useCallback((): void => {
    const item = selectedItem;
    if (!item) return;
    setEditingValue('');
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, value: it.originalValue, editing: false } : it,
      ),
    );
    setStatus('Edición cancelada.');
  }, [selectedItem]);

  /**
   * Maneja el teclado dentro de la vista de ajustes.
   * Cuando se está editando, captura caracteres para construir el nuevo valor.
   */
  useInput((input, key) => {
    // Ctrl+C siempre sale sin guardar.
    if (key.ctrl && input === 'c') {
      setItems((prev) => prev.map((item) => ({ ...item, editing: false })));
      setEditingValue('');
      setStatus(null);
      return;
    }

    // Escape: cancela edición o vuelve a la biblioteca.
    if (key.escape) {
      const item = selectedItem;
      if (isEditing && item) {
        cancelEdit();
      } else {
        setItems((prev) => prev.map((it) => ({ ...it, editing: false })));
        onBack?.();
      }
      return;
    }

    if (isEditing) {
      // En modo edición: Enter guarda, cualquier otro caracter se añade al valor.
      if (key.return) {
        saveEdit(editingValue);
        return;
      }
      // Retroceso: borrar último caracter.
      if (key.backspace || key.delete) {
        setEditingValue((prev) => prev.slice(0, -1));
        return;
      }
      // Caracter imprimible: añadir al valor.
      if (input.length === 1) {
        setEditingValue((prev) => prev + input);
        return;
      }
      return;
    }

    // No estamos editando: navegamos con flechas y Enter.
    if (key.upArrow) {
      moveSelection(-1);
      return;
    }
    if (key.downArrow) {
      moveSelection(1);
      return;
    }
    if (key.return || input === ' ') {
      startEdit();
      return;
    }
    // Tab vuelve a la biblioteca.
    if (key.tab) {
      onBack?.();
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
      <Text>{theme.highlight('Configuración efectiva')}</Text>
      <Text> </Text>
      <Text>{theme.muted('↑↓ navegan · Enter edita · Escape cancela/volver · q sale')}</Text>
      <Text> </Text>

      {hasItems ? (
        items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isEditingThis = item.editing;
          return (
            <Box key={item.id} flexDirection="row" marginBottom={1}>
              <Text>{isSelected ? '▸ ' : '  '}</Text>
              <Text>{item.label}</Text>
              <Text> </Text>
              {isEditingThis ? (
                <Text>
                  {theme.primary(editingValue)}
                  {theme.muted(' █')}
                </Text>
              ) : (
                <Text>
                  {isSelected
                    ? theme.primary(shortenPath(item.value, 50))
                    : theme.muted(shortenPath(item.value, 50))}
                </Text>
              )}
            </Box>
          );
        })
      ) : (
        <Text>{theme.muted('No hay elementos configurables.')}</Text>
      )}

      <Text> </Text>
      {status && <Text>{theme.muted(status)}</Text>}
      <Text>{theme.muted('Presiona «Escape» o «Tab» para volver a la biblioteca.')}</Text>
    </Box>
  );
}
