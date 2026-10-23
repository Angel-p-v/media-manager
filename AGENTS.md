# AGENTS.md — media-manager

Instrucciones para el agente que trabaje en este repositorio. Léete esto antes de tocar nada.

## Qué es este proyecto

`media-manager` (CLI: `mm`) es un gestor de contenido multimedia **100 % terminal**:
indexa la colección de series, anime y películas del usuario en una **base de datos SQLite
local** y permite buscarla y **lanzarla en `mpv`/`vlc`** sin salir de la terminal.

No hay servidor, no hay web, no hay streaming: solo índice local + reproductor local.

- Plan de desarrollo completo: [`PLAN.md`](./PLAN.md)
- Índice de documentación: [`docs/README.md`](./docs/README.md)
- Documentación técnica: [`docs/guides/architecture.md`](./docs/guides/architecture.md)
- Decisiones registradas (ADR): [`docs/adr/`](./docs/adr)

## Stack (fijado, no cambiar sin ADR)

| Capa     | Elección                                                                         | Versión                       |
| -------- | -------------------------------------------------------------------------------- | ----------------------------- |
| Runtime  | Node.js                                                                          | `>=22` (CI prueba 22, 24, 26) |
| Lenguaje | TypeScript `strict`                                                              | `~6.0.3`                      |
| TUI      | Ink + React + `@inkjs/ui`                                                        | 8.x / 19.x / 2.x              |
| CLI      | Commander                                                                        | 15.x                          |
| Config   | YAML + Zod                                                                       | 2.x / 4.x                     |
| BD       | better-sqlite3 (WAL + FTS5)                                                      | 13.x                          |
| Tests    | Vitest                                                                           | 5.x                           |
| Calidad  | ESLint 10 (type-aware) + Prettier 3.9 + Husky 9 + lint-staged 17 + commitlint 21 | —                             |

## Arquitectura: la regla que no se rompe

```
ui/  commands/  ──▶  core/  ──▶  shared/
                     └──▶ core/db/
```

1. `core/**` **nunca** importa desde `ui/**` ni `commands/**`. El dominio no sabe que
   existe una terminal.
2. `ui/**` y `commands/**` **nunca** escriben SQL: acceden a datos por repositorios.
3. `core/db/` habla con SQLite; nadie más importa `better-sqlite3`.
4. `shared/**` no depende de nada del proyecto (solo librerías estándar).
5. El acceso a datos se **inyecta** (DIP): `openDatabase()` devuelve la instancia y los
   repositorios la reciben como parámetro. Nada de singletons globales.

## Flujo de trabajo (obligatorio)

1. **Una rama por hito o feature**: `feat/…`, `fix/…`, `refactor/…`, `chore/…`.
2. Commits con **Conventional Commits** y scope del proyecto
   (`config`, `db`, `indexer`, `parser`, `player`, `ui`, `cli`, `deps`, `ci`, `docs`,
   `test`, `release`):
   `feat(indexer): soporta el patrón 1x02`
3. `npm run verify` **debe pasar** antes de hacer push (lo comprueba el hook de
   pre-push; el de pre-commit ejecuta lint-staged y typecheck).
4. `git push -u origin <rama>` y **PR a `main`** con `gh pr create`.
5. Revisar que la CI de la PR está en verde y **mergear con squash**:
   `gh pr merge <n> --squash --delete-branch`.
6. `main` queda siempre desplegable: cada commit compila, pasa lint y tiene tests.

**Nunca se commitea directamente en `main`.**

### Política de commits pequeños y atómicos

Un commit debe representar **una sola intención revisable**, no el trabajo acumulado de
varias sesiones.

- **Objetivo:** cerrar un commit cada **5–10 archivos** o **200–300 líneas** de un mismo
  cambio coherente, en cuanto sus tests estén en verde. No esperes a terminar la feature
  completa.
- **Límite:** no superes **15 archivos ni 500 líneas modificadas** por commit. Si el
  cambio previsto los supera, párate y divídelo antes de seguir.
- El código y los tests del mismo comportamiento van juntos. La documentación, el
  _formatting_ masivo y las dependencias van en commits separados.
- Separa siempre que sea posible:
  - refactor mecánico (renombres, extracciones) sin cambio de comportamiento;
  - cambio funcional;
  - tests adicionales que no cubren el cambio principal;
  - documentación;
  - dependencias y lockfile;
  - formato o movimiento masivo de archivos.
- Los cambios masivos inevitables (movimientos, migraciones, lockfile, formato) se
  aíslan en su propio commit y se justifican en el cuerpo.
- Antes de commitear revisa `git diff --stat`, `git diff --check` y `git status`. Usa
  `git add <rutas>` o `git add -p`; evita `git add -A` si hay cambios mezclados.
- Si aparecen cambios no relacionados, no los mezcles: commitéalos aparte o déjalos sin
  _stage_. Cada commit debe dejar el árbol compilando y los tests relevantes en verde.

## Comandos

```bash
npm install            # instala y prepara los hooks (husky)
npm run dev            # CLI en modo watch (tsx)
npm run verify         # lint + format:check + typecheck + test  ← puerta de calidad
npm test               # suite completa
npm run test:unit      # solo unitarias (rápidas)
npm run test:integration
npm run test:e2e
npm run coverage       # informe de cobertura
npm run bench          # benchmarks de escaneo, indexado y consultas
npm run smoke          # npm pack → instalación limpia → smoke de la CLI
npm run standalone     # bundle portable con Node oficial verificado (--node-source official)
npm run build          # compila a dist/
npm run lint:fix       # eslint --fix
npm run format         # prettier --write
```

## Estrategia de tests

| Nivel       | Ubicación            | Qué cubre                                  | Objetivo |
| ----------- | -------------------- | ------------------------------------------ | -------- |
| unitario    | `tests/unit/`        | lógica pura, parsers, config               | < 1 s    |
| integración | `tests/integration/` | SQLite real, `fs` real, render de Ink      | < 10 s   |
| e2e         | `tests/e2e/`         | binario compilado: argv, stdout, exit code | < 60 s   |

Reglas: se testea **comportamiento público**, no implementación · cada test es
independiente (su propio `mkdtemp`, su propia BD) · nombres `describe > it` en
Given/When/Then · los umbrales de cobertura viven en `vitest.config.ts` (85/85/80/85).

## Gotchas conocidos (no repetirlos)

- **npm 11.19+ bloquea los scripts de instalación.** `package.json` tiene el campo
  `allowScripts` con `better-sqlite3`, `esbuild` y `unrs-resolver`. Si añades una
  dependencia con script de instalación, apruébala con
  `npm install-scripts approve <pkg>` y **commitea** el cambio (si no, el CI falla).
- **TypeScript está fijado a `~6.0.3`** porque `typescript-eslint@8` declara
  `typescript: ">=4.8.4 <6.1.0"`. No subir a TS 7 hasta que el linter lo soporte.
- **better-sqlite3 y los parámetros con nombre**: si una sentencia usa `@nombre`, hay
  que pasar **un objeto** (`stmt.all({ tipo: … })`). Pasar valores posicionales lanza
  `RangeError: Too many parameter values were provided`.
- **`mkdirSync` sobre `/proc` se queda bloqueado** en Linux: nunca usar rutas bajo
  `/proc` en tests; usa un fichero normal como "bloqueo" para provocar `ENOTDIR`.
- **Migraciones**: se declaran en TypeScript (`src/core/db/migrations/index.ts`), no como
  ficheros `.sql`, para que viajen compiladas en `dist/` y el paquete instalado no
  dependa de rutas en disco. La v2 solo añade índices de rendimiento; su test parte de
  una base v1 con datos y FTS5.
- **Logging**: `createLogger({ level, format, stream, bindings, now })` escribe siempre en
  `stderr`; `text` es para humanos y `json` emite una línea por evento. El valor por
  defecto es `warn`/`text`. `--verbose` es global y el hook `preAction` lo copia al
  subcomando: no añadas un flag local duplicado.
- **Cierre de SQLite**: `closeDatabase()` ejecuta `PRAGMA optimize` como _best effort_ y
  nunca debe tapar el error original. `VACUUM` solo se lanza con
  `mm db optimize --vacuum`, porque bloquea y necesita espacio temporal.
- **`zod` v4**: `.default()` exige el tipo de _salida_; para objetos con subcampos
  opcionales usar `.prefault({})`.
- **Reproductor**: la plantilla de `players.*.args` debe incluir `{file}`. Se usa
  `spawn` con `shell: false`; nunca se construye una línea de shell. La TUI fuerza
  `detach` para no bloquearse, aunque `player.onLaunch` sea `foreground`.
- **Watch**: chokidar v6 no recibe globs; se filtran eventos con `isVideoFile` y se
  reindexa la biblioteca completa (incremental) para que los borrados también se poden.
- **Paquete npm interno**: el nombre sigue siendo `media-manager-cli` y el binario `mm`,
  pero npm solo se usa para construir y probar. `files` es una lista blanca: si añades
  documentación que el instalador copie o el README enlace, inclúyela. `prepack` compila
  `dist/` y `npm run smoke` prueba el tarball real.
- **Instaladores**: `install.sh` y `uninstall.sh` son POSIX `sh`, sin `eval` ni `sudo`.
  Cualquier cambio debe pasar `shellcheck`, `sh -n` y los tests de
  `tests/integration/installer/`. El checksum es obligatorio incluso con `--file`; no
  ejecutes el bundle antes de verificarlo ni confíes en las rutas del `install.json`
  instalado para borrar nada.
- **Release**: las releases se publican desde GitHub Releases (ADR 0009), sin `NPM_TOKEN`.
  `release.yml` y `release-please.yml` llaman a `release-artifacts.yml`, que descarga el
  Node oficial verificado, genera `.sha256` y SBOM, atesta la procedencia y sube los
  assets sin sobrescribir. No muevas un tag ya publicado; ver `docs/guides/release.md`.
- **`CHANGELOG.md` es generado por release-please** y está en `.prettierignore`: su formato
  (incluidos los dobles saltos de línea) lo fija la herramienta y `format:check` no debe
  reformatearlo.

## Estado actual y siguiente paso

Hitos del plan (ver `PLAN.md` §7):

| Hito | Contenido                                             | Estado   |
| ---- | ----------------------------------------------------- | -------- |
| M0   | Cimientos: tooling, hooks, CI                         | ✅ hecho |
| M1   | Núcleo de configuración (YAML + Zod)                  | ✅ hecho |
| M2   | Persistencia SQLite (migraciones, repositorios, FTS5) | ✅ hecho |
| M3   | Indexación y parseo (scanner + parsers)               | ✅ hecho |
| M4   | CLI headless + búsqueda                               | ✅ hecho |
| M5   | TUI (Ink)                                             | ✅ hecho |
| M6   | Reproductor mpv/vlc + modo watch                      | ✅ hecho |
| M7   | Robustez y rendimiento                                | ✅ hecho |
| M8   | Release v1.0.0                                        | ✅ hecho |
| M9   | Esquema v3, estado reproducción, doctor               | ✅ hecho |
| M10  | Reproducción con memoria (tracker IPC, TUI)           | ✅ hecho |
| M11  | Biblioteca sana y descubrimiento                      | ✅ hecho |
| M12  | macOS y experiencia v2                                | ✅ hecho |

M9 está completado: esquema v3 (playback_state, media_preferences), migración con backup,
repositorios playback/preferences, dominio de reproducción, comandos CLI (play --resume/restart/next,
continue, history, mark, favorite), mm doctor. Tests de migración y repositorios en verde.

M10 está completado: tracker IPC de mpv, sección "Continuar" en la TUI, y tests E2E con IPC falso y `--dry-run` completados.

M11 está completado: filtros de favoritos/en curso/vistos/no vistos en `mm list` y TUI, sección "Favoritos" en la barra lateral, benchmarks de consultas con estado de reproducción. Tests integrados y verificados en CI.

M12 está completado: assets macOS x64/arm64, CI con runners macOS, instalador POSIX con eliminación automática de cuarentena, install-test en Ubuntu y macOS, README documenta instalación vía `sh install.sh` y Gatekeeper.

El siguiente paso es M13 (Release v2.0.0).

## Reglas para el agente

- Escribe código en **inglés** (identificadores, comentarios técnicos) y la
  documentación de cara al usuario en **español**.
- Nada de `any`, nada de `as` sin motivo justificado, nada de estados globales.
- Cada función nueva va con su test; si el bug es curioso, el test lo documenta.
- Comenta **por qué**, no el qué obvious.
- Si hay que tomar una decisión con más de un camino válido, escribe un ADR en
  `docs/adr/` y anótala en el `PLAN.md`.
- No amplíes el alcance del hito en curso sin avisar; es un proyecto por hitos.
- Trocea el trabajo según la política de commits pequeños; no acumules cambios para un
  único commit final.
- Al terminar un hito: `npm run verify`, commit, push, PR, merge, y actualizar la
  tabla de estado de `PLAN.md` y del `README.md`.
- **No pasar al siguiente hito hasta que la PR del hito actual esté mergeada y en `main`.**
  Cada hito debe cerrar su PR y verificarse en CI antes de empezar el siguiente.
- **Revisión y merge automático de PR:** al crear la PR al finalizar un hito, el agente
  debe hacer una **preview/revisión completa** de la PR (diff, tests, CI, documentación)
  y, **si la CI está en verde y no hay bloqueadores**, proceder al **merge con squash**
  (`gh pr merge --squash --delete-branch`) y limpiar la rama remota.
