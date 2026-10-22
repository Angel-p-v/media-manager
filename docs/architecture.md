# Arquitectura

`media-manager` se organiza en cuatro capas con dependencias que apuntan **hacia
dentro**. La regla principal es que la lógica de negocio no sabe que existe una
terminal: eso permite testearla en milisegundos y reutilizarla desde cualquier
interfaz.

```
┌──────────────────────────────┐
│  ui/        commands/        │   Presentación: Ink (TUI) y CLI headless
├──────────────────────────────┤
│  core/                        │   Dominio: config, db, indexer, library, player
├──────────────────────────────┤
│  core/db/                     │   Persistencia: SQLite + repositorios
├──────────────────────────────┤
│  shared/                      │   Utilidades transversales
└──────────────────────────────┘
```

## Reglas de dependencia

| Regla                                               | Cómo se verifica                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `core/**` no importa de `ui/**` ni de `commands/**` | Test de arquitectura (hito M5)                                      |
| `ui/**` y `commands/**` no escriben SQL             | Solo se accede a datos por repositorios                             |
| `shared/**` no depende de nada del proyecto         | Solo librerías estándar                                             |
| El acceso a datos se inyecta (DIP)                  | `openDatabase()` devuelve la instancia; los repositorios la reciben |

## Capas

### `src/shared/`

Errores tipados (`AppError` y derivados), logger con niveles y utilidades de rutas.

### `src/core/config/`

Esquema Zod (`schema.ts`), valores por defecto (`defaults.ts`), fusión profunda
(`merge.ts`), rutas XDG (`paths.ts`) y carga/validación (`loader.ts`).

Precedencia de la configuración: `defaults → archivo YAML → variables de entorno`.

### `src/core/db/`

Conexión SQLite (WAL, claves foráneas), migraciones versionadas y repositorios
`mediaRepo` / `fileRepo`. Se implementa en el hito M2.

### `src/core/indexer/`

Recorrido del árbol de ficheros, clasificación del contenido y parsers de nombres
(`S01E02`, `1x02`, títulos de película). Hito M3.

### `src/core/library/`

Casos de uso de consulta: listado, búsqueda (FTS5) y detalle. Hito M4.

### `src/core/player/`

Lanzamiento de reproductores externos (`mpv`, `vlc`) mediante `spawn` sin shell.
Hito M6.

### `src/ui/`

Interfaz de terminal con Ink: componentes, vistas y hooks. Hito M5.

### `src/commands/`

Subcomandos de la CLI que no dependen de Ink: `config`, `index`, `search`, `show`,
`play`, `db`.

## Flujo de datos de una indexación

```
config.yaml
   │  loader (YAML → Zod → AppConfig)
   ▼
AppConfig ──▶ indexer/scanner ──▶ parsers ──▶ mediaRepo ──▶ SQLite
```

## Decisiones registradas

Las decisiones con más de un camino válido se documentan en [`adr/`](./adr).
