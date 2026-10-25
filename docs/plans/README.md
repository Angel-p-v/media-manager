# Índice de planes de desarrollo

Este directorio contiene los planes de ejecución del proyecto `media-manager`. Cada plan documenta alcance, tareas, criterios de aceptación y estado.

## Planes activos

| Plan                                                         | Estado    | Descripción                                                                                                         |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| [`mejoras-continuas-fase2.md`](./mejoras-continuas-fase2.md) | 🟡 Activo | Mejoras continuas post-M22 (Fase 2): pruebas, indexador, metadatos, TUI, CLI, doctor, empaquetado, i18n, seguridad. |

## Planes pendientes de ejecución

| Plan                                             | Estado       | Descripción                                                                                                                           |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`code-review-fixes.md`](./code-review-fixes.md) | 🔴 Pendiente | Corrección de errores del code review: bug `find` en install.sh, `countFavorites`, SQL injection en mediaRepo, tests de filtros, etc. |

## Planes completados

| Plan                                                                                       | Estado        | Descripción                                                                                             | PR de cierre |
| ------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| [`fixes-seguridad-COMPLETADO.md`](./fixes-seguridad-COMPLETADO.md)                         | ✅ Completado | Corrección de errores y vulnerabilidades (bugs B1-B4, vulnerabilidades V1-V4).                          | #142         |
| [`hitos-mejoras-m18-m22-COMPLETADO.md`](./hitos-mejoras-m18-m22-COMPLETADO.md)             | ✅ Completado | Hitos M18–M22: TUI metadatos visuales, sync en segundo plano, autocompletado shell, E2E TTY, cobertura. | —            |
| [`mejoras-pendientes-post-m22-COMPLETADO.md`](./mejoras-pendientes-post-m22-COMPLETADO.md) | ✅ Completado | 10 ítems post-M22 todos completados y mergeados.                                                        | #114–#121    |
| [`version-2.0-COMPLETADO.md`](./version-2.0-COMPLETADO.md)                                 | ✅ Completado | Plan v2.0: estado de reproducción, continuar viendo, biblioteca sana, soporte macOS.                    | —            |
| [`instaladores-y-seguridad-COMPLETADO.md`](./instaladores-y-seguridad-COMPLETADO.md)       | ✅ Completado | Instaladores POSIX, distribución por GitHub Releases, checksums, SBOM, atestaciones.                    | —            |
| [`distribucion-sin-npm-SUSTITUIDO.md`](./distribucion-sin-npm-SUSTITUIDO.md)               | 🔄 Sustituido | Sustituido por `instaladores-y-seguridad.md`.                                                           | —            |

## Leyenda de estado

- 🟡 **Activo**: plan en ejecución, ítems pendientes por implementar.
- 🔴 **Pendiente**: plan aprobado pero no iniciado.
- ✅ **Completado**: todos los ítems implementados, verificados y mergeados en `main`.
- 🔄 **Sustituido**: plan reemplazado por otro más actual.

## Flujo de trabajo obligatorio (AGENTS.md)

1. **Una rama por ítem o hito**: `feat/…`, `fix/…`, `test/…`, `ci/…`, `docs/…`.
2. **Commits con Conventional Commits y scope del proyecto** (`config`, `db`, `indexer`, `parser`, `player`, `ui`, `cli`, `deps`, `ci`, `docs`, `test`, `release`).
3. **`npm run verify` debe pasar antes de cada push** (pre-push lo comprueba; pre-commit ejecuta lint-staged y typecheck).
4. **`git push -u origin <rama>` y PR a `main`** con `gh pr create`.
5. Revisar que la CI está en verde y **mergear con squash**: `gh pr merge <n> --squash --delete-branch`.
6. `main` queda siempre desplegable: cada commit compila, pasa lint y tiene tests.
