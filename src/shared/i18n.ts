import { readFile } from 'node:fs/promises';

import type { Locale } from './i18n.types.js';

/** Diccionario de traducciones cargado en memoria. */
let translations: Record<string, string> = {};
let currentLocale: Locale = 'en';

/** Idiomas disponibles. */
export const AVAILABLE_LOCALES: readonly Locale[] = ['en', 'es'];

/**
 * Carga las traducciones para un idioma desde un archivo JSON.
 * Si el archivo no existe o es inválido, se mantiene el diccionario vacío
 * y se devuelven las claves como texto (fallback).
 */
export async function loadTranslations(locale: Locale): Promise<void> {
  try {
    const content = await readFile(`locales/${locale}.json`, 'utf8');
    translations = JSON.parse(content);
    currentLocale = locale;
  } catch {
    translations = {};
    currentLocale = locale;
  }
}

/** Devuelve el idioma actualmente activo. */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Traduce una clave. Si no hay traducción disponible, devuelve la propia clave.
 * Sustituye placeholders `{key}` con los valores proporcionados.
 */
export function t(key: string, values?: Record<string, string | number>): string {
  let text = translations[key] ?? key;
  if (values !== undefined) {
    for (const [placeholder, value] of Object.entries(values)) {
      text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
    }
  }
  return text;
}
