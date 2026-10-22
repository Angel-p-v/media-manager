import pc from 'picocolors';

/** Paleta y estilos centralizados de la interfaz. */
export const theme = {
  primary: pc.cyan,
  accent: pc.magenta,
  success: pc.green,
  warning: pc.yellow,
  error: pc.red,
  muted: pc.dim,
  border: 'gray',
  title: (text: string): string => pc.bold(pc.cyan(text)),
  highlight: (text: string): string => pc.bold(pc.cyan(text)),
  selected: (text: string): string => pc.bold(pc.cyan(text)),
  label: (text: string): string => pc.bold(text),
  value: (text: string): string => pc.white(text),
  type: (type: string): string => {
    if (type === 'series') return pc.blue('serie');
    if (type === 'anime') return pc.magenta('anime');
    return pc.yellow('película');
  },
} as const;

/** Formatea una ruta acortándola para que quepa en la terminal. */
export function shortenPath(target: string, maxLength = 48): string {
  if (target.length <= maxLength) return target;
  return `…${target.slice(target.length - maxLength + 1)}`;
}
