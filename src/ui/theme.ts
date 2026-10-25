import pc from 'picocolors';

/** Una paleta de colores para un tema de la interfaz. */
export type Theme = {
  primary: typeof pc.cyan;
  accent: typeof pc.magenta;
  success: typeof pc.green;
  warning: typeof pc.yellow;
  error: typeof pc.red;
  muted: typeof pc.dim;
  border: string;
  title: (text: string) => string;
  highlight: (text: string) => string;
  selected: (text: string) => string;
  label: (text: string) => string;
  value: (text: string) => string;
  type: (type: string) => string;
};

/** Paleta por defecto (colores brillantes sobre fondo oscuro). */
export const defaultTheme: Theme = {
  primary: pc.cyan,
  accent: pc.magenta,
  success: pc.green,
  warning: pc.yellow,
  error: pc.red,
  muted: pc.dim,
  border: 'gray',
  title: (text) => pc.bold(pc.cyan(text)),
  highlight: (text) => pc.bold(pc.cyan(text)),
  selected: (text) => pc.bold(pc.cyan(text)),
  label: (text) => pc.bold(text),
  value: (text) => pc.white(text),
  type: (type) => {
    if (type === 'series') return pc.blue('serie');
    if (type === 'anime') return pc.magenta('anime');
    return pc.yellow('película');
  },
};

/** Paleta oscura (colores suaves, menos contraste). */
export const darkTheme: Theme = {
  primary: pc.cyan,
  accent: pc.magenta,
  success: pc.green,
  warning: pc.yellow,
  error: pc.red,
  muted: pc.dim,
  border: 'gray',
  title: (text) => pc.bold(pc.cyan(text)),
  highlight: (text) => pc.bold(pc.cyan(text)),
  selected: (text) => pc.bold(pc.cyan(text)),
  label: (text) => pc.bold(text),
  value: (text) => pc.white(text),
  type: (type) => {
    if (type === 'series') return pc.blue('serie');
    if (type === 'anime') return pc.magenta('anime');
    return pc.yellow('película');
  },
};

/** Paleta clara (colores adaptados para fondos claros). */
export const lightTheme: Theme = {
  primary: pc.blue,
  accent: pc.magenta,
  success: pc.green,
  warning: pc.yellow,
  error: pc.red,
  muted: pc.dim,
  border: 'gray',
  title: (text) => pc.bold(pc.blue(text)),
  highlight: (text) => pc.bold(pc.blue(text)),
  selected: (text) => pc.bold(pc.blue(text)),
  label: (text) => pc.bold(text),
  value: (text) => pc.black(text),
  type: (type) => {
    if (type === 'series') return pc.blue('serie');
    if (type === 'anime') return pc.magenta('anime');
    return pc.yellow('película');
  },
};

/** Temas disponibles. */
export const themes: Record<string, Theme> = {
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
};

/** Resuelve el tema por nombre; devuelve el por defecto si no se reconoce. */
export function getTheme(name: string): Theme {
  return themes[name] ?? defaultTheme;
}

/** Tema activo: se resuelve desde la configuración al arrancar la TUI. */
export let theme = defaultTheme;

/** Establece el tema activo. Los componentes que importan `theme` lo ven reflejado. */
export function setTheme(name: string): void {
  theme = getTheme(name);
}

/** Formatea una ruta acortándola para que quepa en la terminal. */
export function shortenPath(target: string, maxLength = 48): string {
  if (target.length <= maxLength) return target;
  return `…${target.slice(target.length - maxLength + 1)}`;
}
