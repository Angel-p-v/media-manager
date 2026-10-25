# Plan: Mejoras pendientes post-M22

**Objetivo:** Revisar e implementar las mejoras y correcciones restantes tras completar todos los hitos M0–M22. Cada ítem se ejecuta en su propia rama, se verifica con `npm run verify`, se abre PR y se mergea con squash antes de pasar al siguiente.

## Contexto

Todos los hitos M0–M22 están completados y mergeados en `main`. Quedan pendientes:

1. Test de estrés fallante en ARM64 (`stress.integration.test.ts`)
2. TODO pendiente en `src/commands/doctor.ts` (`migrated: false` hardcodeado)
3. Módulos con baja cobertura de pruebas
4. Mejoras sugeridas en `docs/plans/hitos-mejoras-m18-m22.md` §2 (I1–I7)
5. Auditoría de seguridad y dependencias (`fixes-seguridad.md`)

---

## Ítems del plan

| #   | Área         | Descripción                                                                                                                                | Prioridad | Rama sugerida                          |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------- |
| 1   | CI / Test    | Ajustar o revisar el test de estrés de 100 000 entradas que falla en ARM64 por budget de rendimiento                                       | Alta      | `fix/ci-stress-test-arm64`             |
| 2   | CLI / doctor | Resolver TODO en `doctor.ts:199`: rastrear estado real de migración en `mm doctor --json`                                                  | Media     | `fix/doctor-migrated-status`           |
| 3   | Tests        | Añadir tests para módulos con baja cobertura: `scanner.ts`, `service.ts` (indexer), `launcher.ts`, `playbackRepo.ts`, `preferencesRepo.ts` | Media     | `test/coverage-modulos-bajos`          |
| 4   | TUI          | Soporte para temas personalizables (modo oscuro/claro)                                                                                     | Baja      | `feat/tui-temas`                       |
| 5   | Indexación   | Índice incremental por carpeta (no solo reindexado completo)                                                                               | Baja      | `feat/indexer-incremental-por-carpeta` |
| 6   | Metadatos    | Caché local de imágenes/pósteres descargadas para uso offline                                                                              | Baja      | `feat/metadatos-cache-imagenes`        |
| 7   | CLI          | Exportar biblioteca a JSON/CSV                                                                                                             | Baja      | `feat/cli-exportar-json-csv`           |
| 8   | Config       | Validación de rutas de biblioteca al arrancar (advertir si no existen)                                                                     | Baja      | `feat/config-validar-rutas-arranque`   |
| 9   | Seguridad    | Ejecutar `npm audit` y revisar dependencias con CVEs; firmado GPG de commits                                                               | Media     | `ci/auditoria-seguridad`               |
| 10  | Instaladores | Ejecutar `shellcheck` y `sh -n` sobre instaladores; verificar desinstalación edge cases                                                    | Media     | `ci/installers-shellcheck`             |

---

## Estrategia de trabajo

1. Crear este documento de plan y mergearlo en `main`.
2. Para cada ítem:
   - Crear rama `feat/…`, `fix/…`, `test/…` o `ci/…` según corresponda.
   - Implementar con tests.
   - Ejecutar `npm run verify` (lint + format + typecheck + test).
   - Push, abrir PR a `main`, revisar CI verde, mergear con squash y borrar rama.
3. No pasar al siguiente ítem hasta que el anterior esté mergeado y sin errores.
4. Actualizar `PLAN.md`, `AGENTS.md` y `README.md` si corresponde al finalizar.

---

## Criterios de aceptación (DoD) por ítem

- [ ] Código en inglés, sin `any`, sin `as` sin justificación, sin estados globales.
- [ ] Cada función nueva tiene su test.
- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` pasan.
- [ ] `npm run test` pasa (salvo el test de estrés ARM64 pre-existing si no es el ítem actual).
- [ ] Commit atómico con Conventional Commits y scope del proyecto.
- [ ] PR mergeado con squash en `main`, CI verde, rama borrada.
