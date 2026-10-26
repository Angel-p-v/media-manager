import { Box, Text, useInput, type Key } from 'ink';
import React, { useCallback, useMemo, useState } from 'react';

import { defaultConfig } from '../../core/config/defaults.js';

import type { AppConfig } from '../../core/config/schema.js';

export type KeybindingsViewProps = {
  config: AppConfig;
  /** Guarda la configuración actualizada en el archivo YAML. */
  onSave: (config: AppConfig) => Promise<void>;
  /** Vuelve a la vista anterior. */
  onBack: () => void;
};

/** Vista para reasignar atajos de teclado desde la TUI (T2 del plan-9). */
export function KeybindingsView({
  config,
  onSave,
  onBack,
}: KeybindingsViewProps): React.JSX.Element {
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const actions = useMemo<{ action: string; key: string }[]>(
    () =>
      Object.keys(defaultConfig.keybindings).map((action) => ({
        action,
        key: config.keybindings[action] ?? defaultConfig.keybindings[action] ?? '',
      })),
    [config],
  );

  const handleKey = useCallback(
    (input: string, key: Key) => {
      // Ctrl+C siempre sale de la vista de edición sin guardar.
      if (key.ctrl && input === 'c') {
        setEditingAction(null);
        setStatus(null);
        return;
      }

      // Si estamos editando una acción, capturar la nueva tecla.
      if (editingAction !== null) {
        // Solo se reasignan teclas imprimibles de un solo carácter.
        const newKey = input.length === 1 ? input : undefined;
        if (!newKey) return;

        const nextKeybindings: Record<string, string> = {
          ...config.keybindings,
          [editingAction]: newKey,
        };
        const nextConfig: AppConfig = { ...config, keybindings: nextKeybindings };

        setEditingAction(null);
        setSaving(true);
        onSave(nextConfig)
          .then(() => {
            setSaving(false);
            setStatus(`Atajo de «${editingAction}» cambiado a «${newKey}».`);
          })
          .catch(() => {
            setSaving(false);
            setStatus('No se pudo guardar la configuración.');
          });
        return;
      }

      // Navegación normal.
      if (key.escape || input === 'q') {
        onBack();
        return;
      }

      if (input === 'e' && editingAction === null) {
        // Entrar en modo edición de la acción seleccionada (la primera por ahora;
        // una versión completa añadiría selección por filas).
        const first = actions[0];
        if (first) setEditingAction(first.action);
        return;
      }
    },
    [editingAction, actions, config, onSave, onBack],
  );

  useInput(handleKey);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text>{saving ? 'Guardando…' : 'Atajos de teclado'}</Text>
      <Text> </Text>
      <Text>
        Presiona{' '}
        {editingAction
          ? 'una tecla para reasignar'
          : '«e» para editar el primer atajo, «q» para volver'}
      </Text>
      <Text> </Text>
      {actions.map(({ action, key }) => {
        const isEditing = editingAction === action;
        return (
          <Text key={action}>
            {isEditing ? '▶ ' : '  '}
            {action}: {key}
            {isEditing ? ' (escucha nueva tecla…)' : ''}
          </Text>
        );
      })}
      <Text> </Text>
      {status && <Text>{status}</Text>}
      <Text>{saving ? 'Esperando a que se guarde…' : ''}</Text>
    </Box>
  );
}
