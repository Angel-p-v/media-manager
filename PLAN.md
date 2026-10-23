# Plan de desarrollo — media-manager

> Documento vivo. Define **qué** se construye, **en qué orden**, **cómo se valida** y
> **qué tooling** acompaña el proyecto. Cualquier deviation relevante se registra en
> [`docs/adr/`](./docs/adr) y se actualiza aquí.

- **Proyecto:** `media-manager` (`mm`) — gestor de contenido multimedia para terminal
- **Naturaleza:** proyecto personal open source, mantenido a largo plazo
- **Objetivo:** llegar a una `v1.0.0` estable, publicada en GitHub Releases, con CI/CD, tests y docs
- **Última actualización:** 2026-10-22

---

## 1. Principios de ingeniería

1. **Dominio aislado de la interfaz.** La lógica (parseo, indexado, búsqueda, lanzamiento)
   no depende de Ink/React ni de la base de datos concreta: se pueden testear en milisegundos.
2. **SOLID y Clean Code.** Funciones pequeñas, nombres explícitos, dependencias inyectadas
   (DIP), sin estado global mutable, sin `any` (TypeScript `strict`).
3. **Configuración declarativa y validada.** Nada de valores mágicos en el código: todo
   comportamiento ajustable vive en `config.yaml` y se valida con un esquema Zod al arrancar.
4. **Tests primero.** Toda functionality entra con su test. El objetivo no es cobertura de
   líneas, sino **confianza en el comportamiento**.
5. **Automatable.** Si un humano debe repetirlo, es un script o un job de CI.
6. **Degradación elegante.** Si `mpv` no existe o el índice está corrupto, la app explica el
   problema y sigue funcionando en modo degradado.

## 2. Stack y versiones (verificadas)

| Capa        | Elección                         | Versión                        | Nota                                            |
| ----------- | -------------------------------- | ------------------------------ | ----------------------------------------------- |
| Runtime     | Node.js                          | `>=22` (CI: 22/24/26)          | Ecosistema Node-first para Ink                  |
| Lenguaje    | TypeScript                       | `~6.0.3`                       | Fijado por el peer range de `typescript-eslint` |
| TUI         | Ink + React                      | `8.0.0` / `19.3.1`             | Yoga/Flexbox; usado por Gemini CLI, Copilot CLI |
| Widgets TUI | `@inkjs/ui`                      | `2.0.0`                        | Select, TextInput, Spinner…                     |
| Tests TUI   | `ink-testing-library`            | `4.0.0`                        | Renderiza frames sin terminal real              |
| CLI         | Commander                        | `15.0.0`                       | Subcomandos + ayuda autogenerada                |
| Config      | `yaml` + `zod`                   | `2.9.1` / `4.6.7`              | `z.toJSONSchema()` genera el JSON Schema        |
| BD          | `better-sqlite3`                 | `13.0.3`                       | Prebuilds nativos, API síncrona, FTS5           |
| Watch       | `chokidar`                       | `6.0.0`                        | Reindexado automático                           |
| Globs       | `tinyglobby`                     | `0.2.17`                       | Exclusiones de ficheros                         |
| Color       | `picocolors`                     | `1.1.1`                        | Estilos sin dependencias pesadas                |
| Lint        | ESLint + typescript-eslint       | `10.13.0` / `8.72.0`           | Flat config, reglas type-aware                  |
| Formato     | Prettier                         | `3.9.10`                       | + `prettier-plugin-sort-package-json`           |
| Tests       | Vitest + coverage-v8             | `5.0.5`                        | Proyectos `unit` / `integration` / `e2e`        |
| Hooks       | Husky + lint-staged + commitlint | `9.1.7` / `17.6.0` / `21.2.4`  | Verificación en commit y push                   |
| CI          | GitHub Actions                   | `checkout@v7`, `setup-node@v7` | Matriz de versiones + cobertura                 |

> ⚠️ **Nota de versionado:** `typescript-eslint@8.72.0` declara `typescript: ">=4.8.4 <6.1.0"`.
> While TS 7 no esté soportado por el linter, se usa la rama `6.x`. Alternativa evaluada:
> Biome 2.6.2 (más rápido, sin type-checking) — decisión abierta en §10.

## 3. Estructura del repositorio

```
media-manager/
├─ .github/
│  ├─ workflows/{ci.yml,release-artifacts.yml,release.yml,release-please.yml}
│  ├─ dependabot.yml
│  ├─ ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml}
│  └─ pull_request_template.md
├─ .husky/{pre-commit,commit-msg,pre-push}
├─ config/config.example.yaml
├─ docs/
│  ├─ README.md
│  ├─ adr/000N-*.md
│  ├─ assets/demo.svg
│  ├─ guides/{architecture,performance,release}.md
│  └─ plans/*.md
├─ src/
│  ├─ cli.tsx                    # bin: mm
│  ├─ commands/                  # subcomandos headless
│  ├─ core/                      # dominio puro (config, db, indexer, library, player)
│  ├─ ui/                        # presentación Ink (App, components, views, hooks)
│  └─ shared/                    # errores, logger, rutas
├─ scripts/
│  ├─ build/{standalone,fetch-node,notices,platform}.mjs
│  ├─ build/node-version.txt     # versión exacta del runtime incluido
│  └─ test/smoke-pack.mjs        # smoke del tarball
├─ install.sh  uninstall.sh      # instaladores POSIX
├─ tests/
│  ├─ unit/                      # lógica pura, sin I/O
│  ├─ integration/               # SQLite real, fs real, render de Ink
│  ├─ e2e/                       # binario compilado como proceso hijo
│  └─ fixtures/library/          # árbol de pruebas versionado
├─ CHANGELOG.md  CONTRIBUTING.md  LICENSE  README.md
├─ commitlint.config.mjs  eslint.config.mjs  prettier.config.mjs
├─ tsconfig.json  tsconfig.build.json  vitest.config.ts
└─ package.json
```

**Reglas de dependencia (verificadas por test):**

```
ui/  commands/  ──▶  core/  ──▶  shared/
                     │
                     └──▶ db/ (accede a SQLite; nunca al revés)
```

- `core/**` no importa nada de `ui/**` ni de `commands/**`.
- `ui/**` y `commands/**` no escriben SQL: usan los repositorios de `core/db`.
- Todo acceso a disco/SQLite pasa por una interfaz inyectable (testeable con dobles).

## 4. Tooling de calidad

### Lint y formato

- ESLint 10 en _flat config_ con `recommendedTypeChecked` + `stylisticTypeChecked`:
  `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`,
  `no-unused-vars` con prefijo `_`, `eqeqeq`, `curly`.
- `eslint-plugin-import-x` para orden de imports (`builtin → external → internal`, alfabético)
  y detección de duplicados.
- `eslint-config-prettier/flat` al final de la cadena para desactivar reglas de estilo que
  contradigan al formateador.
- Prettier 3.9: `singleQuote`, `trailingComma: all`, `printWidth: 100`, LF, tabuladores a 2
  espacios. `prettier-plugin-sort-package-json` mantiene `package.json` ordenado.
- Excepciones controladas en `tests/**` (`no-non-null-assertion`, `no-unsafe-assignment`).

### Hooks de Git (Husky)

| Hook         | Acción                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| `pre-commit` | `lint-staged` (ESLint `--fix` + Prettier sobre lo staged) y `npm run typecheck` |
| `commit-msg` | `commitlint --edit` — valida Conventional Commits                               |
| `pre-push`   | `npm run verify` (lint + formato + tipos + tests)                               |

### Conventional Commits

Tipos: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`
Scopes: `config` `db` `indexer` `parser` `player` `ui` `cli` `deps` `ci` `docs` `test` `release`

```
feat(indexer): soporta el patrón 1x02
fix(config): no sobrescribir el array `exclude` al fusionar defaults
test(db): cubre la cascada de borrado en media_files
```

Regla de versionado (SemVer): `feat` → minor · `fix`/`perf` → patch ·
`BREAKING CHANGE` → major.

## 5. Estrategia de pruebas

**Pirámide objetivo:** ~70 % unitarias, ~25 % integración, ~5 % e2e.

| Nivel       | Ubicación            | Qué cubre                                          | Entorno       | Objetivo de tiempo |
| ----------- | -------------------- | -------------------------------------------------- | ------------- | ------------------ |
| Unitario    | `tests/unit/`        | Parsers, esquema/loader de config, lógica pura     | Node, sin I/O | < 1 s              |
| Integración | `tests/integration/` | SQLite real, `fs` real en `mkdtemp`, render de Ink | Node + disco  | < 10 s             |
| E2E         | `tests/e2e/`         | Binario compilado: argv, stdout, exit code         | Proceso hijo  | < 60 s             |

**Principios**

1. Ciclo **rojo → verde → refactor**: el test falla antes de que exista la implementación.
2. Se testea **comportamiento público**, no estructura interna.
3. Nombres en estilo `describe` → `it` con Given/When/Then en el cuerpo.
4. **Aislamiento**: cada test usa su propio `mkdtemp` y cierra la BD en `afterEach`;
   nada de estado global ni dependencias de orden entre tests.
5. **Dobles de prueba**: SQLite `:memory:`, ficheros temporales reales, binario _fake_
   (`sh` que registra argv) para el launcher, `ink-testing-library` para la TUI.
6. **Cobertura como puerta, no como fin**: umbrales en `vitest.config.ts`
   (85 % líneas / 85 % funciones / 80 % ramas / 85 % statements). `src/ui/**` se excluye del
   umbral numérico y se cubre con tests de render.
7. **Test de arquitectura**: recorre los imports y falla si `core/` depende de `ui/`.

## 6. CI/CD

### `ci.yml` (push y PR a `main`)

- Job `verify`: matriz Node 22 / 24 / 26 → `npm ci` → lint → format:check → typecheck →
  build → test. Artefacto `dist` en Node 24.
- Job `smoke`: instala el tarball real con `npm run smoke` en Node 24.
- Job `installers`: `sh -n`, `dash -n` y `shellcheck` sobre `install.sh` y `uninstall.sh`.
- Job `coverage`: `npm run coverage` → subida a Codecov (no bloquea si el token no está).
- `concurrency` con `cancel-in-progress` para no gastar minutos en pushes seguidos.
- `permissions: contents: read` (mínimo privilegio).

### `release.yml` + `release-artifacts.yml`

- `release.yml` se dispara con `release: published` y delega en el workflow reutilizable
  `release-artifacts.yml` con el tag de la release.
- `release-artifacts.yml` construye el bundle en la matriz Linux x64/arm64 con el Node
  oficial verificado, ejecuta `verify`, comprueba el `.sha256`, atesta la procedencia y
  sube los assets sin `--clobber`.
- Un job independiente genera y sube el SBOM CycloneDX.
- No se publica en npm ni se necesita `NPM_TOKEN`.

### `release-please.yml`

- Observa los pushes a `main` y abre la PR de release con `CHANGELOG` y bump de versión.
- La configuración vive en `release-please-config.json` y `.release-please-manifest.json`.
- Si la release se crea, invoca `release-artifacts.yml` como workflow reutilizable para
  publicar los assets en el mismo run (los eventos de `GITHUB_TOKEN` no disparan otros
  workflows).

### Dependabot

- Actualizaciones semanales de npm (agrupando las dev-deps) y de GitHub Actions.

### Puertas de calidad (bloquean el merge)

| Puerta                               | Dónde           | Bloquea |
| ------------------------------------ | --------------- | ------- |
| `eslint .` (0 warnings en lo tocado) | pre-commit + CI | sí      |
| `prettier --check .`                 | pre-commit + CI | sí      |
| `tsc --noEmit` (strict)              | pre-commit + CI | sí      |
| Tests (unit + integration + e2e)     | pre-push + CI   | sí      |
| Cobertura ≥ umbrales                 | CI              | sí      |
| Build con `tsconfig.build.json`      | CI              | sí      |
| Formato del mensaje de commit        | hook + CI       | sí      |

## 7. Roadmap por hitos

> **Seguimiento obligatorio.** Cada tarea completada se marca `[x]` en el mismo commit
> en que se termina. Un hito pasa a ✅ solo cuando todas sus casillas están marcadas,
> `npm run verify` está en verde y su PR se ha mergeado con squash. El estado se
> refleja aquí, en la tabla de hitos de `README.md` y en `AGENTS.md`.
>
> **Leyenda:** ✅ completado · 🟡 en curso · ☐ pendiente

| Hito | Contenido                                             | Estado | Progreso |
| ---- | ----------------------------------------------------- | ------ | -------- |
| M0   | Cimientos: tooling, hooks, CI                         | ✅     | 6/6      |
| M1   | Núcleo de configuración (YAML + Zod)                  | ✅     | 5/5      |
| M2   | Persistencia SQLite (migraciones, repositorios, FTS5) | ✅     | 5/5      |
| M3   | Indexación y parseo (scanner + parsers)               | ✅     | 9/9      |
| M4   | CLI _headless_ + búsqueda                             | ✅     | 10/10    |
| M5   | TUI (Ink)                                             | ✅     | 7/7      |
| M6   | Reproductor + modo _watch_                            | ✅     | 6/6      |
| M7   | Robustez y rendimiento                                | ✅     | 6/6      |
| M8   | Release `v1.0.0`                                      | ✅     | 7/7      |
| M9   | Esquema v3, estado reproducción, doctor               | ✅     | 6/6      |
| M10  | Reproducción con memoria (tracker IPC, TUI)           | 🟡     | 3/6      |

### M0 — Cimientos del repositorio · `0.0.1`

**Tareas**

- [x] Estructura de carpetas, `tsconfig` estricto y ficheros base del repositorio
- [x] ESLint 10 _type-aware_ + Prettier 3.9
- [x] Vitest 5 con proyectos `unit`, `integration` y `e2e`
- [x] Husky 9 + lint-staged 17 + commitlint 21
- [x] CI en Node 22/24/26, Dependabot y plantillas de GitHub
- [x] README, LICENSE y `npm run verify` reproducible desde cero

**Alcance:** `git init` en `main`, estructura de carpetas, `tsconfig` estricto, ESLint,
Prettier, Vitest con 3 proyectos, Husky + lint-staged + commitlint, workflow de CI,
README/LICENSE, Dependabot, `.editorconfig`/`.gitignore`/`.npmrc`/`.nvmrc`.

**A testear:** smoke test del harness (`tests/unit/smoke.test.ts`); verificación de que
`npm run verify` pasa en local y en CI para los 3 nodos; comprobación manual de que un
commit con formato inválido es rechazado por el hook.

**DoD:** primer push con CI verde en Node 22/24/26 · hooks activos y bloqueando · repositorio
público con `npm run verify` reproducible desde cero.

---

### M1 — Núcleo de configuración · `0.1.0`

**Tareas**

- [x] Esquema Zod estricto y valores por defecto
- [x] Fusión profunda con arrays reemplazados
- [x] Carga de YAML con precedencia `defaults → archivo → entorno` y errores accionables
- [x] Rutas XDG, `~`, `MM_CONFIG` y `mm config [--path|--validate|--json]`
- [x] Tests unitarios/integración y ADR 0002

**Alcance:** `src/core/config/{schema,defaults,loader,paths}.ts` con Zod estricto;
carga de `~/.config/media-manager/config.yaml`; precedencia
`defaults → YAML → env → flags`; expansión de `~` y rutas relativas; `MM_CONFIG`;
errores accionables con ruta y campo; `mm config [--path|--validate|--json]`.

**A testear**

- _Unit_: esquema (casos válidos/inválidos y mensaje por campo); loader (merge profundo,
  arrays reemplazados, defaults, YAML malformado, archivo ausente, clave desconocida);
  rutas (XDG, `~`, `homedir`, env var).
- _Integración_: carga real desde `mkdtemp`; `mm config --validate` como proceso hijo.

**DoD:** cobertura del módulo ≥ 90 % · cero `any` · todo error de config indica archivo y campo.

---

### M2 — Persistencia SQLite · `0.2.0` ✅

**Tareas**

- [x] Conexión SQLite con WAL, claves foráneas y `busy_timeout`
- [x] Migraciones versionadas en TypeScript e idempotentes
- [x] Repositorios `mediaRepo`/`fileRepo`/`indexRunRepo` con la `Database` inyectada
- [x] Búsqueda FTS5 con disparadores insert/update/delete
- [x] Tests de integración sobre SQLite real (`:memory:` y fichero temporal)

**Alcance:** `src/core/db/` con `connection.ts` (WAL, `foreign_keys`, `busy_timeout`),
migraciones versionadas, repositorios `mediaRepo`/`fileRepo`, tabla FTS5 para búsqueda.
El comando `mm db stats` se implementa en M4, cuando existe la capa de consulta.

**A testear**

- _Integración_ (SQLite real, `:memory:` y fichero temporal): migraciones idempotentes y
  ordenadas · CRUD de repositorios · cascadas `ON DELETE` · triggers FTS en
  insert/update/delete · `VACUUM`/`ANALYZE`.
- _Unit_: nada; los repositorios se validan por comportamiento público.

**DoD:** la `Database` se inyecta (DIP), sin singleton global · migraciones idempotentes ·
cobertura ≥ 85 %.

**Estado:** implementado. Migraciones declaradas en TypeScript (viajan compiladas en
`dist/`), repositorios `mediaRepo`/`fileRepo`/`indexRunRepo` con la `Database` inyectada,
búsqueda FTS5 con disparadores y 22 tests de integración sobre SQLite real.

---

### M3 — Indexación y parseo · `0.3.0` ✅ _hito crítico_

**Tareas**

- [x] `scanner` con profundidad, exclusiones, tamaño mínimo y orden estable
- [x] `classifier` para series, anime y películas
- [x] Parsers puros `episode`/`movie`/`text` con tabla de casos
- [x] Indexación incremental por ruta + `mtime` (sin duplicados)
- [x] Detección de ficheros borrados y títulos huérfanos
- [x] `mm index [--dry-run|--root|--json]`
- [x] Fixtures versionados en `tests/fixtures/library/`
- [x] CLI y `core` comparten la misma lógica de parseo
- [x] Tests unitarios/integración, parsers al 100 % de cobertura y ADR 0003

**Alcance:** `src/core/indexer/` con `scanner.ts` (recorrido, profundidad, exclusiones),
`classifier.ts` (serie/anime/película), `parsers/episode.ts` y `parsers/movie.ts` **puros y sin
efectos**, upsert incremental (ruta + mtime), detección de borrados,
`mm index [--dry-run|--root]`.

**A testear**

- _Unit_ (el grueso del proyecto): tabla de casos por patrón — `S01E02`, `1x02`,
  `Season 1 Episode 2`, `- 03 -`, `E03`, `T1E2`; limpieza de tags (`1080p`, `BluRay`,
  `x264`, `WEB-DL`, grupos `[Subs]`); títulos con año, unicode y acentos; casos ambiguos →
  resultado `null` explícito, nunca excepción.
- _Integración_: árbol fixture en disco → índice correcto · reindexado idempotente (0
  duplicados) · borrado de un fichero → fila huérfana eliminada · `--dry-run` no escribe.

**DoD:** parsers al 100 % de cobertura con tabla de casos · fixtures versionados en
`tests/fixtures/library/` · CLI y `core` comparten la misma lógica de parseo.

**Estado:** implementado en `feat/indexer`. Fixtures reales en `tests/fixtures/library/`,
pruebas unitarias de patrones y de clasificación, integración con SQLite y árbol temporal,
y `mm index --dry-run|--root|--json` con estadísticas de ejecución.

---

### M4 — CLI _headless_ + búsqueda · `0.4.0` ✅

**Tareas**

- [x] Casos de uso en `src/core/library/` (listar, buscar, resolver, estadísticas)
- [x] `mm list` con filtros de tipo, orden y paginación
- [x] `mm search` con FTS5 y filtro de tipo
- [x] `mm show` por id o título, con sus ficheros
- [x] `mm db stats`
- [x] Códigos de salida 0/1/2 documentados
- [x] `--json` estable con _snapshots_
- [x] E2E del binario compilado (argv, stdout, stderr y `exitCode`)
- [x] Integración FTS5 vs `LIKE` comparando planes con `EXPLAIN QUERY PLAN`
- [x] README, arquitectura y `AGENTS.md` actualizados

**Alcance:** `src/cli.tsx` con Commander · subcomandos `index|search|show|list|db|config` ·
códigos de salida documentados (0 ok · 1 error · 2 uso incorrecto) · salida `--json` estable.

**A testear**

- _E2E_: spawn del binario compilado contra un fixture; aserciones sobre stdout, stderr y
  `exitCode`.
- _Integración_: `libraryService` con FTS5 vs `LIKE`, comparando planes con
  `EXPLAIN QUERY PLAN`.

**DoD:** `--json` estable con snapshot tests · ayuda de cada subcomando completa y coherente.

**Estado:** implementado en `feat/cli-library`. `LibraryService` con listado, búsqueda FTS5,
resolución por id/título y estadísticas; comandos `mm list|search|show|db stats` con
`--json`; códigos de salida 0/1/2; ADR 0004; suite E2E contra `dist/cli.js`.

---

### M5 — TUI (Ink) · `0.5.0` ✅

**Tareas**

- [x] `App.tsx`, `theme.ts` y `screen.ts` (alternate screen)
- [x] Hooks `useLibrary`, `useKeymap` y `useConfig`
- [x] Componentes `Header`, `Sidebar`, `MediaList`, `MediaDetails`, `StatusBar` y `HelpOverlay`
- [x] Vistas `Library`, `Search` y `Settings`
- [x] Keybindings configurables desde YAML
- [x] Tests de render con `ink-testing-library` y test de arquitectura
- [x] Arranque en < 300 ms con 10 000 elementos

**Alcance:** `src/ui/` con `App.tsx`, `theme.ts`, `screen.ts` (alternate screen `?1049h`),
hooks (`useLibrary`, `useKeymap`, `useConfig`), componentes (`Header`, `Sidebar`,
`MediaList`, `MediaDetails`, `StatusBar`, `HelpOverlay`) y vistas (`Library`, `Search`,
`Settings`); keybindings configurables desde YAML.

**A testear**

- _Integración_ (render): `ink-testing-library` para renderizar frames y afirmar texto y
  selección · simulación de teclas (`q`, `/`, `p`, `tab`) · test de arquitectura que
  comprueba que `core/` no importa desde `ui/`.

**DoD:** ningún componente de UI accede al dominio directamente (usa casos de uso) · la TUI
arranca en < 300 ms con 10 000 elementos.

**Estado:** implementado en `feat/tui`. Pantalla alternativa, navegación por secciones,
buscador con `TextInput`, panel de detalles, ayuda modal y ajustes de solo lectura. La
selección se mueve con flechas y los atajos se fusionan con `defaultConfig`. Tests de render
con `ink-testing-library`, test de arquitectura y presupuesto de arranque verificado.

---

### M6 — Reproductor + modo _watch_ · `0.6.0` ✅

**Tareas**

- [x] Launcher con plantilla `{file}`, `detach`/`foreground` y `spawn` sin `shell`
- [x] Reproductores `mpv`/`vlc` configurables
- [x] `mm play`
- [x] `mm watch` con `chokidar` y reindexado incremental
- [x] Tests con reproductor _fake_ y E2E de `mm play --dry-run`
- [x] UI no bloqueante y proceso hijo que sobrevive al cierre de la TUI

**Alcance:** `src/core/player/launcher.ts` (plantilla de args con `{file}`, `detach` /
`foreground`, `spawn` sin `shell`), reproductores `mpv`/`vlc` configurables, `mm play`, y
`mm watch` con `chokidar` → reindexado incremental.

**A testear**

- _Unit_: construcción de la línea de comandos · selección de reproductor · error si el
  binario no existe · rutas con espacios.
- _Integración_: reproductor **fake real** (script `sh` que escribe argv a un fichero) para
  verificar el comando y los argumentos que llegan al SO.
- _E2E_: `mm play --dry-run` produce el comando sin lanzar nada.

**DoD:** la UI no se bloquea al lanzar · el proceso hijo sobrevive al cierre de la TUI ·
nunca se usa `shell: true`.

**Estado:** implementado en `feat/player-watch`. El launcher valida el binario antes de
lanzar, sustituye `{file}` en cada argumento y usa `spawn` con `shell: false`. `mm play`
elige el primer fichero ordenado o el indicado con `--file`, admite `--player`,
`--foreground` y `--dry-run`. La TUI siempre lanza en `detach` para no bloquearse. `mm
watch` agrupa eventos con debounce y reindexa de forma incremental, incluyendo borrados.
Tests con scripts `sh` reales, E2E del binario y prueba de supervivencia del hijo
desacoplado.

---

### M7 — Robustez y rendimiento · `0.7.0`

**Tareas**

- [x] Benchmarks de escaneo, indexado y búsqueda con `vitest bench`
- [x] Logging estructurado con niveles configurables y `--verbose`
- [x] Gestor global de errores con códigos
- [x] `PRAGMA optimize` / `VACUUM`
- [x] Prueba de migración de esquema v1 → v2
- [x] `docs/guides/performance.md` con presupuesto de rendimiento

**Alcance:** `vitest bench` (escaneo de 10 000 ficheros, indexado completo, búsqueda) ·
logging estructurado con niveles configurables · gestor de errores global con códigos ·
`--verbose` · `PRAGMA optimize` / `VACUUM` · prueba de migración de esquema v1 → v2.

**A testear:** benchmarks con umbral de regresión documentado · test de estrés con 100 000
entradas · test de migración desde la v0.2.

**DoD:** cobertura global ≥ 80 % · presupuesto de rendimiento escrito en
`docs/guides/performance.md`.

**Estado:** implementado en `feat/robustness`. `npm run bench` mide escaneo de 10 000
ficheros, indexado completo y búsqueda/listado sobre 100 000 títulos; el test de estrés de
100 000 entradas forma parte de la suite de integración. Logging configurable en YAML y
por entorno, formato `text`/`json` en `stderr` y `--verbose` global. Los errores de la CLI
se imprimen con código estable (`[CONFIG_ERROR]`, `[NOT_FOUND]`, …) y pila opcional. La
migración v2 añade índices de rendimiento y se prueba desde v1 con datos. `PRAGMA
optimize` se ejecuta al cerrar y `mm db optimize --vacuum` compacta la base. Decisiones en
el [ADR 0007](./docs/adr/0007-logging-errores-y-mantenimiento.md); presupuesto en
[`docs/guides/performance.md`](./docs/guides/performance.md).

---

### M8 — Release `v1.0.0` · `1.0.0`

**Tareas**

- [x] Artefactos portables con Node oficial verificado y checksums
- [x] Instaladores `install.sh` / `uninstall.sh` con verificación de integridad
- [x] `CHANGELOG.md` con release-please
- [x] README con demo, `SECURITY.md` y `CONTRIBUTING.md`
- [x] Workflow de release
- [x] _Smoke post-build_ con el tarball (`npm pack` → instalar → ejecutar)
- [x] Tag `v1.0.0`, release de GitHub y verificación en los 3 nodos

> **Plan de ejecución (2026-10-22):**
> [`docs/plans/instaladores-y-seguridad.md`](./docs/plans/instaladores-y-seguridad.md).
> La publicación en npm se sustituye por GitHub Releases con instaladores y artefactos
> verificables; el alcance y el DoD de M8 se ajustarán al ejecutar ese plan.
>
> **Siguiente plan (post-v1.0.0):**
> [`docs/plans/version-2.0.md`](./docs/plans/version-2.0.md). Se ejecuta cuando M8 y el
> plan de instaladores estén cerrados.

**Alcance:** bundles portables con Node oficial verificado · instaladores POSIX ·
checksums, SBOM y atestaciones de procedencia · `CHANGELOG.md` (release-please) · README
con demo · `SECURITY.md` · `CONTRIBUTING.md` · workflow de release.

**A testear:** _smoke post-build_: `npm pack` → instalar el tarball en un directorio
temporal → ejecutar `--version`, `config --validate` e `index --dry-run`.

**DoD:** tag `v1.0.0` · release de GitHub con assets, checksums, SBOM y atestación ·
instalación verificada sin Node · `npm run verify` verde en los 3 nodos.

**Estado:** completado. `v1.0.0` se publicó el 2026-10-23 con bundles Linux x64/arm64,
checksums, SBOM CycloneDX y atestaciones de procedencia. El job de instalación en
contenedor limpio destapó un fallo en la expansión de `~` de los instaladores, corregido en
`v1.0.1` (release publicada con todos los jobs en verde e instalación verificada sin Node).
El canal oficial es GitHub Releases (ADR 0009). El detalle del proceso y el resultado están
en [`docs/guides/release.md`](./docs/guides/release.md). El siguiente paso es
[`docs/plans/version-2.0.md`](./docs/plans/version-2.0.md).

---

### M9 — Esquema v3, estado reproducción, doctor · `2.0.0`

**Tareas**

- [x] ADR 0010: estado de reproducción y reanudación.
- [x] ADR 0011: salud de la biblioteca y reparaciones seguras.
- [x] Esquema v3 (playback_state, media_preferences), repositorios y migración con backup.
- [x] Configuración `playback` y placeholder `{start}`.
- [x] Contrato CLI/JSON de los comandos nuevos (`play --resume/--restart/--next`, `continue`, `history`, `mark`, `favorite`, `doctor`).
- [x] Tests de migración y repositorios.

**Alcance:** migración v3 aditiva con backup automático, repositorios `playbackRepo` y `preferencesRepo`, dominio de reproducción (`calculatePlayback`, `findNextEpisode`, `applyStartPlaceholder`), comandos CLI, `mm doctor` con diagnóstico y `--prune-missing`, integración en launcher con `{start}`.

**A testear:** migración desde base `v1` y `v2` con backup, repositorios playback/preferences, dominio playback, comandos CLI.

**DoD:** una base `1.0` migra a v3, conserva todos los títulos y deja backup verificable; `mm play --resume` reanuda posición guardada; `mm doctor` detecta ausentes/duplicados; `npm run verify` verde en los 3 nodos.

**Estado:** completado. Migración v3, repositorios, dominio, comandos y tests integrados y verificados en CI.

---

### M10 — Reproducción con memoria · `2.0.0`

**Tareas**

- [x] `playback_state` y cálculo de progreso (completado en M9).
- [x] Tracker IPC de mpv y fallback manual.
- [x] `mm play --resume/--restart/--next` (completado en M9).
- [x] `mm mark`, `mm continue`, `mm history` (completado en M9).
- [x] Sección "Continuar" en la TUI con barra de progreso y acciones rápidas.
- [ ] Tests con IPC falso y E2E de `--dry-run`.

**Alcance:** tracker IPC de mpv (`MpvTracker`), integración en `launchPlayer`, guardado de posición cada 5s, limpieza de socket y proceso. La TUI añade sección "Continuar" usando `playbackRepo.listInProgress` y muestra indicadores de progreso.

**A testear:** tracker con servidor IPC falso, E2E `mm play --dry-run` muestra `{start}`, reanudación tras cerrar mpv, sección TUI "Continuar".

**DoD:** se puede empezar un episodio, salir, volver a `mm` y continuar donde se dejó.

**Estado:** en curso. Tracker IPC y sección TUI "Continuar" completados. Pendiente: tests E2E con IPC falso y `--dry-run`.

```bash
mkdir -p ~/Projects/media-manager && cd ~/Projects/media-manager
git init -b main

npm init -y
npm pkg set name="media-manager-cli" version="1.0.0" type="module" license="MIT" \
  description="Gestor de contenido multimedia para terminal" engines.node=">=22" \
  bin.mm="./dist/cli.js"

npm i ink@^8 react@^19 @inkjs/ui@^2 commander@^15 yaml@^2 zod@^4 better-sqlite3@^13 \
      chokidar@^6 tinyglobby@^0.2 picocolors@^1.1

npm i -D typescript@~6.0.3 @types/node@^26 @types/react@^19 @types/better-sqlite3@^9 \
      tsx@^4 vitest@^5 @vitest/coverage-v8@^5 ink-testing-library@^4 node-pty@^1 \
      eslint@^10 @eslint/js@^10 typescript-eslint@^8 eslint-config-prettier@^10 \
      eslint-plugin-import-x@^4 prettier@^3.9 prettier-plugin-sort-package-json@^1 \
      husky@^9 lint-staged@^17 @commitlint/cli@^21 @commitlint/config-conventional@^21

npm pkg set scripts.prepare="husky" \
  scripts.dev="tsx watch src/cli.tsx" \
  scripts.build="tsc -p tsconfig.build.json" \
  scripts.start="node dist/cli.js" \
  scripts.typecheck="tsc --noEmit" \
  scripts.lint="eslint ." scripts.lint:fix="eslint . --fix" \
  scripts.format="prettier --write ." scripts.format:check="prettier --check ." \
  scripts.test="vitest run" scripts.test:unit="vitest run --project unit" \
  scripts.test:integration="vitest run --project integration" \
  scripts.test:e2e="vitest run --project e2e" scripts.test:watch="vitest" \
  scripts.coverage="vitest run --coverage" scripts.bench="vitest bench --reporter=verbose" \
  scripts.verify="npm run lint && npm run format:check && npm run typecheck && npm run test"

npx husky init
git add -A && git commit -m "chore: bootstrap del proyecto con tooling, hooks y CI"
```

## 9. Flujo de trabajo Git

```
main (protegida)  ←  squash merge  ←  PR (CI verde)  ←  feat/xyz | fix/xyz
```

- Ramas: `feat/…`, `fix/…`, `refactor/…`, `chore/…`, `docs/…`.
- PR: descripción con _qué_ y _por qué_, checklist de verificación, referencia a la issue.
- Commits en la rama: un commit = un cambio conceptual; el squash mantiene el historial legible.
- `main` recibe mensajes Conventional validados (rama protegida + hook).
- Release: release-please abre la PR con `CHANGELOG` y el bump; al mergear, tag `vX.Y.Z`
  → GitHub Release → `release-artifacts.yml` publica. `v1.0.0` se preparó a mano y desde
  `v1.0.1` el flujo es automático; ver [`docs/guides/release.md`](./docs/guides/release.md).

## 10. Decisiones pendientes

| #   | Decisión                     | Propuesta                                                     | Estado |
| --- | ---------------------------- | ------------------------------------------------------------- | ------ |
| 1   | Nombre del paquete / binario | `media-manager-cli` + bin `mm` (npm ya tiene `media-manager`) | ✅     |
| 2   | Versionado de TypeScript     | `~6.0.3` mientras typescript-eslint no soporte TS7            | ☐      |
| 3   | Estructura del repositorio   | Monomodular (extraer a workspaces si aparecen plugins)        | ☐      |
| 4   | E2E interactivo              | `node-pty` para TTY real, o headless + `ink-testing-library`  | ☐      |
| 5   | Licencia                     | MIT                                                           | ☐      |
| 6   | Proveedor de changelog       | release-please (primera release manual)                       | ✅     |
| 7   | Codecov                      | integration vía OIDC (sin secreto)                            | ☐      |

## 11. Cómo evoluciona este plan

- Cada hito cerrado actualiza la tabla de estado de la §7 y la tabla de hitos del `README.md`.
- Toda decisión técnica con más de un camino válido genera un ADR en `docs/adr/`.
- Los cambios de alcance se anotan en la sección 10 y se comunican en el `CHANGELOG.md`.
