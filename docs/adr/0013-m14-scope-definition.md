# ADR 0013: Alcance de la versión post-v2.0.1 (M14)

**Fecha:** 2026-10-24
**Estado:** Aceptado
**Autor:** Coronel

## Contexto

La v2.0.1 (M13) se ha publicado consolidando M9–M12: esquema v3 con estado de reproducción, tracker IPC de mpv, TUI con secciones "Continuar" y "Favoritos", filtros de listado, salud de biblioteca (`doctor`), soporte macOS en CI/instalador, y release con assets Linux x64/arm64 + SBOM + atestaciones.

El siguiente hito (M14) debe definir el alcance de la siguiente versión. Los candidatos identificados en `PLAN.md` son:

1. **Completar asset macOS arm64/x64** (pendiente por capacidad de runners GitHub Actions)
2. **Windows** (instalador PowerShell, .zip, named pipes para IPC)
3. **Etiquetas/colecciones** (más allá de favoritos)
4. **Metadatos externos opcionales** (TMDB, TVDB) con claves API
5. **Auto-actualización** del binario instalado
6. **Migración a TypeScript 7 / Biome 2.6** (cuando linter lo soporte)
7. **Tests E2E interactivos** con `node-pty` (TTY real)

## Decisión

**Versión objetivo: `v2.1` (menor, no breaking)**

Razones:

- La v2.0.x ya introdujo breaking changes en la BD (esquema v3) y en la CLI (nuevos comandos). Otra versión mayor (v3.0) requeriría justificación de breaking changes adicionales que no están claros ahora.
- Los candidatos 1–5 son _features_ o _platform support_ que encajan en minor.
- Los candidatos 6–7 son _tooling/infra_ que no afectan API pública.

**Priorización para v2.1 (scope mínimo viable):**

| Prioridad | Tarea                                     | Justificación                                                               |
| --------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| **P0**    | Asset macOS arm64/x64                     | Deuda de M12/M13; desbloquea usuarios macOS sin build local                 |
| **P1**    | Windows (instalador + .zip + named pipes) | Nueva plataforma; paridad con Linux/macOS                                   |
| **P2**    | Auto-actualización del binario            | Mejora DX crítica; evita reinstalación manual                               |
| **P3**    | Etiquetas/colecciones                     | Extensión natural de favoritos; caso de uso real (ej. "por ver", "dropped") |

**Fuera de v2.1 (dejan para v2.2 o v3.0):**

- Metadatos externos (TMDB/TVDB): requiere diseño de caché, rate-limiting, claves API, y decisión de si vive en BD o sidecar. Es feature grande.
- TypeScript 7 / Biome 2.6: bloqueado por `typescript-eslint` peer range (`<6.1.0`). Esperar a que el linter lo soporte o evaluar Biome en ADR separado.
- Tests E2E con `node-pty`: mejora de confianza, no feature de usuario. Puede hacerse en paralelo sin bloquear release.

## Consecuencias

### Positivas

- v2.1 entrega valor incremental claro: macOS + Windows + auto-update = cobertura multiplataforma completa.
- Etiquetas/colecciones extienden el modelo de datos de forma aditiva (nueva tabla, sin migración breaking).
- Auto-update usa el mismo canal GitHub Releases ya establecido (ADR 0009).

### Negativas / Riesgos

- Windows requiere named pipes para IPC (mpv no usa Unix sockets) → código plataforma-específico en `MpvTracker`.
- Auto-update implica descargar y reemplazar binario en runtime: manejar permisos, atomicidad, rollback.
- Etiquetas/colecciones añade complejidad a `LibraryService` y TUI (nueva vista, filtros combinados).

### Migraciones

- **macOS assets**: build local o esperar runners; no requiere cambio de código.
- **Windows**: nuevo `install.ps1`, `.zip` en release, `MpvTracker` con named pipes (`\\.\pipe\...`).
- **Auto-update**: nuevo comando `mm self-update`, lógica de descarga/verificación/checksum, reemplazo atómico.
- **Etiquetas/colecciones**: migración BD v4 (tabla `tags`, `media_tags`), repositorio `tagRepo`, comandos `mm tag`, integración en `LibraryService.list` y TUI.

## Plan de ejecución sugerido (v2.1)

1. **M14a** — Asset macOS (build local + subir a release v2.0.1 existente o v2.1.0)
2. **M14b** — Windows (instalador + release assets + named pipes IPC)
3. **M14c** — Auto-update (`mm self-update` + integración en launcher)
4. **M14d** — Etiquetas/colecciones (migración v4 + CLI + TUI)

Cada sub-hito con su PR, CI verde, merge squash, y actualización de `PLAN.md`/`AGENTS.md`/`README.md`.

## Alternativas consideradas

| Alternativa                | Por qué se descarta                                                       |
| -------------------------- | ------------------------------------------------------------------------- |
| Saltar a v3.0 directamente | No hay breaking changes justificados; v2.1 entrega valor ya               |
| Incluir TMDB/TVDB en v2.1  | Scope demasiado grande; riesgo de retrasar multi-plataforma + auto-update |
| Hacer todo en paralelo     | Violación de "un hito a la vez" y política de commits pequeños            |

## Referencias

- `PLAN.md` §7 tabla de hitos (M14)
- ADR 0009 (distribución GitHub Releases)
- ADR 0010 (estado reproducción / IPC mpv)
- ADR 0012 (soporte macOS)
