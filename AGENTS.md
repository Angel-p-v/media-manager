# AGENTS.md — media-manager

Instrucciones para el agente que trabaje en este repositorio. Léete esto antes de tocar nada.

## Qué es este proyecto

`media-manager` (CLI: `mm`) es un gestor de contenido multimedia **100 % terminal**:
indexa la colección de series, anime y películas del usuario en una **base de datos SQLite
local** y permite buscarla y **lanzarla en `mpv`/`vlc`** sin salir de la terminal.

No hay servidor, no hay web, no hay streaming: solo índice local + reproductor local.

- Plan de desarrollo completo: [`PLAN.md`](./PLAN.md)
- Documentación técnica: [`docs/architecture.md`](./docs/architecture.md)
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
   pre-commit y el de pre-push).
4. `git push -u origin <rama>` y **PR a `main`** con `gh pr create`.
5. Revisar que la CI de la PR está en verde y **mergear con squash**:
   `gh pr merge <n> --squash --delete-branch`.
6. `main` queda siempre desplegable: cada commit compila, pasa lint y tiene tests.

**Nunca se commitea directamente en `main`.**

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
  dependa de rutas en disco.
- **`zod` v4**: `.default()` exige el tipo de _salida_; para objetos con subcampos
  opcionales usar `.prefault({})`.

## Estado actual y siguiente paso

Hitos del plan (ver `PLAN.md` §7):

| Hito | Contenido                                             | Estado      |
| ---- | ----------------------------------------------------- | ----------- |
| M0   | Cimientos: tooling, hooks, CI                         | ✅ hecho    |
| M1   | Núcleo de configuración (YAML + Zod)                  | ✅ hecho    |
| M2   | Persistencia SQLite (migraciones, repositorios, FTS5) | ✅ en curso |
| M3   | Indexación y parseo (scanner + parsers)               | ☐ siguiente |
| M4   | CLI headless + búsqueda                               | ☐           |
| M5   | TUI (Ink)                                             | ☐           |
| M6   | Reproductor mpv/vlc + modo watch                      | ☐           |
| M7   | Robustez y rendimiento                                | ☐           |
| M8   | Release v1.0.0                                        | ☐           |

## Reglas para el agente

- Escribe código en **inglés** (identificadores, comentarios técnicos) y la
  documentación de cara al usuario en **español**.
- Nada de `any`, nada de `as` sin motivo justificado, nada de estados globales.
- Cada función nueva va con su test; si el bug es curioso, el test lo documenta.
- Comenta **por qué**, no el qué obvious.
- Si hay que tomar una decisión con más de un camino válido, escribe un ADR en
  `docs/adr/` y anótala en el `PLAN.md`.
- No amplíes el alcance del hito en curso sin avisar; es un proyecto por hitos.
- Al terminar un hito: `npm run verify`, commit, push, PR, merge, y actualizar la
  tabla de estado de `PLAN.md` y del `README.md`.
