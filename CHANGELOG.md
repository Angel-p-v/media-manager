# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado [SemVer](https://semver.org/lang/es/). A partir de `v1.0.0`, release-please
mantiene este archivo a partir de los commits convencionales.

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
