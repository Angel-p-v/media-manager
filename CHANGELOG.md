# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado [SemVer](https://semver.org/lang/es/). A partir de `v1.0.0`, release-please
mantiene este archivo a partir de los commits convencionales.

## [3.0.2](https://github.com/Angel-p-v/media-manager/compare/v3.0.1...v3.0.2) (2026-10-24)


### Bug Fixes

* **ci:** usa rutas absolutas para install.ps1 y uninstall.ps1 en el install-test Windows ([#87](https://github.com/Angel-p-v/media-manager/issues/87)) ([5f62201](https://github.com/Angel-p-v/media-manager/commit/5f6220151ab220c53d0c61acf2120e2a444dd279))

## [3.0.1](https://github.com/Angel-p-v/media-manager/compare/v3.0.0...v3.0.1) (2026-10-24)


### Bug Fixes

* **ci:** busca install.json por nombre en el install-test Windows ([#85](https://github.com/Angel-p-v/media-manager/issues/85)) ([a1cf472](https://github.com/Angel-p-v/media-manager/commit/a1cf472978e7dd47a946e9f72468aa3c00a0f348))
* **ci:** usa nombre de tipo completo System.IO.Compression.ZipFile en install-test Windows ([#84](https://github.com/Angel-p-v/media-manager/issues/84)) ([350a919](https://github.com/Angel-p-v/media-manager/commit/350a919cc4dbcf848c7110f19ddd9fd1dc7a21f2))

## [3.0.0](https://github.com/Angel-p-v/media-manager/compare/v2.0.0...v3.0.0) (2026-10-24)


### ⚠ BREAKING CHANGES

* v2.0.0 consolida los hitos M9–M12:

### Features

* **cli:** auto-completado de shell (M20) ([#64](https://github.com/Angel-p-v/media-manager/issues/64)) ([fd73068](https://github.com/Angel-p-v/media-manager/commit/fd73068cb9fc40dcec73ce31e2961ad2f600e21f))
* **cli:** comando self-update para auto-actualización (M14c) ([#52](https://github.com/Angel-p-v/media-manager/issues/52)) ([543897b](https://github.com/Angel-p-v/media-manager/commit/543897b5ec8b5705f6ad4955fb784df16a5525ac))
* **cli:** sincronización automática de metadatos (M17) ([#58](https://github.com/Angel-p-v/media-manager/issues/58)) ([27a6b4f](https://github.com/Angel-p-v/media-manager/commit/27a6b4f7926557d1a5b14b4d63b4f8830d6f6561))
* **config,db,cli:** configuración YAML metadatos + TVDB proveedor (M16) ([#56](https://github.com/Angel-p-v/media-manager/issues/56)) ([ea4f39a](https://github.com/Angel-p-v/media-manager/commit/ea4f39af5c0a5937b163760162bf2b339646e665))
* **db,cli:** etiquetas y colecciones (M14d) ([#53](https://github.com/Angel-p-v/media-manager/issues/53)) ([50fb278](https://github.com/Angel-p-v/media-manager/commit/50fb27878a1da2316ba61459a2de47bba6358301))
* **db,cli:** metadatos externos TMDB/TVDB (M15) ([#55](https://github.com/Angel-p-v/media-manager/issues/55)) ([52ce526](https://github.com/Angel-p-v/media-manager/commit/52ce5266e13f0f49c10f53c1c8d8c533250d4eb2))
* **db:** añade countFavorites a LibraryService ([#40](https://github.com/Angel-p-v/media-manager/issues/40)) ([58d58dd](https://github.com/Angel-p-v/media-manager/commit/58d58ddff9b27f0ef1997b42105a2012d8b27d44))
* **db:** esquema v3, estado reproducción, doctor y comandos CLI ([#20](https://github.com/Angel-p-v/media-manager/issues/20)) ([93e2ba8](https://github.com/Angel-p-v/media-manager/commit/93e2ba8c35d02d625c3a8554e72b3f922ff14489))
* M11 Biblioteca sana y M12 macOS — filtros, favoritos, TUI, CI 4 plataformas ([#35](https://github.com/Angel-p-v/media-manager/issues/35)) ([7a4e437](https://github.com/Angel-p-v/media-manager/commit/7a4e437a529f20439d46ed88ec5030d9a394b2ce))
* **player:** soporte Windows para v2.1 (M14b) ([#51](https://github.com/Angel-p-v/media-manager/issues/51)) ([7d438b7](https://github.com/Angel-p-v/media-manager/commit/7d438b70116b59e805fadbcb384049a036ea249d))
* **player:** tracker IPC mpv y integración en launcher ([#23](https://github.com/Angel-p-v/media-manager/issues/23)) ([70de97c](https://github.com/Angel-p-v/media-manager/commit/70de97c8c4100c9cfaa1be4d6a79a388709dde76))
* release v2.0.0 — M9/M10/M11/M12 completados ([#45](https://github.com/Angel-p-v/media-manager/issues/45)) ([c2e1410](https://github.com/Angel-p-v/media-manager/commit/c2e1410a930259ffe0ffeb5c580882374df1e1a8))
* **release:** artefactos verificados y publicación sin npm (fases 3-4) ([#13](https://github.com/Angel-p-v/media-manager/issues/13)) ([75f8ea9](https://github.com/Angel-p-v/media-manager/commit/75f8ea97b220ccfbe5bdd5e905c47893f8bfb120))
* **release:** instaladores seguros desde GitHub Releases (fases 1-2) ([#12](https://github.com/Angel-p-v/media-manager/issues/12)) ([5ca5674](https://github.com/Angel-p-v/media-manager/commit/5ca5674530c8b2da9cbb7e306a22bd08d10e1969))
* **test:** mejora cobertura de pruebas (M22) ([#66](https://github.com/Angel-p-v/media-manager/issues/66)) ([64cfa5a](https://github.com/Angel-p-v/media-manager/commit/64cfa5a65626b690d7efc69d1e5f208c9f704fad))
* **test:** tests interactivos con TTY real usando node-pty (M21) ([#65](https://github.com/Angel-p-v/media-manager/issues/65)) ([a4f2b84](https://github.com/Angel-p-v/media-manager/commit/a4f2b8465426bd742d566878604944a300a7949e))
* **ui,db:** sincronización automática de metadatos (M19) ([#62](https://github.com/Angel-p-v/media-manager/issues/62)) ([2fa2e22](https://github.com/Angel-p-v/media-manager/commit/2fa2e22851b0698f74584bdbb31d36ca5f015cdf))
* **ui:** metadatos visuales en TUI (M18) ([#61](https://github.com/Angel-p-v/media-manager/issues/61)) ([5797005](https://github.com/Angel-p-v/media-manager/commit/579700545c3759b468dc81c42b201905773709aa))
* **ui:** sección Continuar en la TUI ([#27](https://github.com/Angel-p-v/media-manager/issues/27)) ([539dcc5](https://github.com/Angel-p-v/media-manager/commit/539dcc5cc7301822cbd356e5dbd5a77390977038))


### Bug Fixes

* **ci:** corrige matrix macOS en release-artifacts ([#46](https://github.com/Angel-p-v/media-manager/issues/46)) ([1ce0ea2](https://github.com/Angel-p-v/media-manager/commit/1ce0ea24b435cda805a5a925e0d6793a31478ccf))
* **cli:** corrige precedencia de operadores en find (macOS quarantine) ([#39](https://github.com/Angel-p-v/media-manager/issues/39)) ([9b4655c](https://github.com/Angel-p-v/media-manager/commit/9b4655c533d731f8ad27c3b64617b517e473278d))
* corrige errores de tipo + actualiza README con diagrama de flujos ([#54](https://github.com/Angel-p-v/media-manager/issues/54)) ([25edc1e](https://github.com/Angel-p-v/media-manager/commit/25edc1ecf060a93e89882e7e766352ea95939ea6))
* **db:** mediaRepo IN clause parameterizado y chunking (&gt;999 params) ([#41](https://github.com/Angel-p-v/media-manager/issues/41)) ([6688934](https://github.com/Angel-p-v/media-manager/commit/66889343410df380cb4b0b9acfa351e75ed8db4b))
* macOS quarantine todos ejecutables + JSDoc watched/unwatched + benchmarks migraciones ([#43](https://github.com/Angel-p-v/media-manager/issues/43)) ([a74096a](https://github.com/Angel-p-v/media-manager/commit/a74096a9797d598aa68f6553df20a6bb9ee8d406))
* **release:** expande ~ correctamente en los instaladores ([#16](https://github.com/Angel-p-v/media-manager/issues/16)) ([3ac5bd4](https://github.com/Angel-p-v/media-manager/commit/3ac5bd4efc3c4fc0f1bd02f645ac55d0a6c0ab4e))
* **ui:** corrige exportación ESM de App para Node 22 + verbatimModuleSyntax ([#44](https://github.com/Angel-p-v/media-manager/issues/44)) ([1f6022f](https://github.com/Angel-p-v/media-manager/commit/1f6022f492edd122133c5cb0f4334af8d3cb486e))

## [1.3.0](https://github.com/Angel-p-v/media-manager/compare/v1.2.0...v1.3.0) (2026-10-23)


### Features

* M11 Biblioteca sana y M12 macOS — filtros, favoritos, TUI, CI 4 plataformas ([#35](https://github.com/Angel-p-v/media-manager/issues/35)) ([7a4e437](https://github.com/Angel-p-v/media-manager/commit/7a4e437a529f20439d46ed88ec5030d9a394b2ce))

## [1.2.0](https://github.com/Angel-p-v/media-manager/compare/v1.1.0...v1.2.0) (2026-10-23)


### Features

* **player:** tracker IPC mpv y integración en launcher ([#23](https://github.com/Angel-p-v/media-manager/issues/23)) ([70de97c](https://github.com/Angel-p-v/media-manager/commit/70de97c8c4100c9cfaa1be4d6a79a388709dde76))
* **ui:** sección Continuar en la TUI ([#27](https://github.com/Angel-p-v/media-manager/issues/27)) ([539dcc5](https://github.com/Angel-p-v/media-manager/commit/539dcc5cc7301822cbd356e5dbd5a77390977038))

## [1.1.0](https://github.com/Angel-p-v/media-manager/compare/v1.0.1...v1.1.0) (2026-10-23)


### Features

* **db:** esquema v3, estado reproducción, doctor y comandos CLI ([#20](https://github.com/Angel-p-v/media-manager/issues/20)) ([93e2ba8](https://github.com/Angel-p-v/media-manager/commit/93e2ba8c35d02d625c3a8554e72b3f922ff14489))

## [1.0.1](https://github.com/Angel-p-v/media-manager/compare/v1.0.0...v1.0.1) (2026-10-23)


### Bug Fixes

* **release:** expande ~ correctamente en los instaladores ([#16](https://github.com/Angel-p-v/media-manager/issues/16)) ([3ac5bd4](https://github.com/Angel-p-v/media-manager/commit/3ac5bd4efc3c4fc0f1bd02f645ac55d0a6c0ab4e))

## [1.0.0] - 2026-10-23

Primera versión estable de `media-manager-cli`: un gestor de series, anime y películas
100 % terminal, con índice local y reproducción en `mpv` o `vlc`.

### Añadido

- CLI `mm` con `config`, `index`, `list`, `search`, `show`, `play`, `watch`, `db stats` y
  `db optimize`, con salida humana y `--json` para scripts.
- TUI a pantalla completa con navegación, búsqueda, detalles, ayuda y atajos
  configurables.
- Base SQLite local con WAL, FTS5, migraciones versionadas y repositorios inyectables.
- Indexación incremental y modo `watch` con reindexado automático.
- Parser de nombres de series, anime y películas, con detección de temporada, episodio,
  año y calidad.
- Reproductor configurable con plantillas de argumentos y modos `detach`/`foreground`;
  soporte de `mpv` y `vlc`.
- Configuración YAML validada con Zod, variables de entorno y valores por defecto.
- Logging estructurado (`text`/`json`), niveles configurables y `--verbose`.
- Errores con código estable y pila opcional con `--verbose`.
- Migración v2 con índices de rendimiento y mantenimiento explícito de SQLite
  (`PRAGMA optimize` / `VACUUM`).
- Benchmarks de escaneo, indexado y consultas, y test de estrés de 100 000 títulos.
- Instaladores POSIX `install.sh` y `uninstall.sh` con checksum SHA-256 obligatorio,
  validación del artefacto, instalación atómica y desinstalación conservadora.
- Bundles portables para Linux x64 y arm64 con Node oficial verificado, `install.json`,
  avisos de terceros, SBOM CycloneDX y atestación de procedencia.
- Documentación de arquitectura, rendimiento, seguridad, contribución y publicación.

### Cambiado

- La distribución pasa a GitHub Releases; no se publica en npm. El binario sigue
  llamándose `mm`.
- La configuración de logging emite siempre en `stderr`, dejando `stdout` para los datos.

### Documentación

- README con instalación, demo, configuración, atajos y contrato de la CLI.
- ADR 0001–0007 y presupuesto de rendimiento en `docs/guides/performance.md`.

[1.0.0]: https://github.com/Angel-p-v/media-manager/releases/tag/v1.0.0
