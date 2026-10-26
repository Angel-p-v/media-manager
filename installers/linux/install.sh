#!/bin/sh
# Instalador de media-manager-cli.
#
# Clona el repositorio, instala dependencias, compila y deja el comando `mm`
# disponible por usuario sin sudo. Revisa el script antes de ejecutarlo.
set -eu
umask 022

REPOSITORY="${MM_REPOSITORY:-https://github.com/Angel-p-v/media-manager.git}"
APP_NAME="media-manager-cli"

PREFIX="${HOME}/.local"
PREFIX_EXPLICIT=0
BINDIR=""
FORCE=0
DRY_RUN=0
NO_PATH_CHECK=0

TMP_DIR=""
CLONE_DIR=""

usage() {
  cat <<'EOF'
Uso: install.sh [opciones]

Instala media-manager-cli clonando el repositorio y compilando desde fuente.

Opciones:
  --prefix <dir>         prefijo de instalación (por defecto, ~/.local)
  --bindir <dir>         directorio del wrapper (por defecto, <prefix>/bin)
  --force                reinstala aunque ya exista
  --dry-run              muestra los cambios sin aplicarlos
  --no-path-check        no avisa si <bindir> no está en PATH
  --help                 muestra esta ayuda

Ejemplos:
  sh install.sh
  sh install.sh --prefix "$HOME/.local"
  sh install.sh --dry-run            # muestra los cambios sin aplicarlos

Códigos de salida:
  0 éxito · 1 error · 2 uso incorrecto · 4 instalación existente sin --force
EOF
}

say() { printf '%s\n' "$*"; }
step() { printf '· %s\n' "$*"; }
warn() { printf 'aviso: %s\n' "$*" >&2; }
die() {
  _code=$1
  shift
  printf 'error: %s\n' "$*" >&2
  exit "$_code"
}

have() { command -v "$1" >/dev/null 2>&1; }

cleanup() {
  _status=$?
  trap - EXIT INT TERM HUP
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR" 2>/dev/null || true
  fi
  if [ -n "$CLONE_DIR" ] && [ -d "$CLONE_DIR" ]; then
    rm -rf "$CLONE_DIR" 2>/dev/null || true
  fi
  exit "$_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)
      [ $# -ge 2 ] || die 2 "falta el valor de --prefix"
      PREFIX=$2
      PREFIX_EXPLICIT=1
      shift 2
      ;;
    --bindir)
      [ $# -ge 2 ] || die 2 "falta el valor de --bindir"
      BINDIR=$2
      shift 2
      ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-path-check) NO_PATH_CHECK=1; shift ;;
    --help | -h) usage; exit 0 ;;
    --) shift; break ;;
    *) die 2 "opción desconocida: $1 (usa --help)" ;;
  esac
done
[ $# -eq 0 ] || die 2 "argumentos inesperados: $*"

if [ "$(id -u)" -eq 0 ] && [ "$PREFIX_EXPLICIT" -ne 1 ]; then
  die 2 "no ejecutes como root; si es necesario, pasa --prefix explícito"
fi

case "$PREFIX" in
  \~) PREFIX="${HOME}" ;;
  \~/*) PREFIX="${HOME}/${PREFIX#??}" ;;
  /*) ;;
  *) die 2 "--prefix debe ser una ruta absoluta" ;;
esac
while [ "${PREFIX%/}" != "$PREFIX" ]; do PREFIX="${PREFIX%/}"; done
case "$PREFIX" in
  "" | "/") die 2 "--prefix no puede ser la raíz del sistema" ;;
esac

if [ -z "$BINDIR" ]; then
  BINDIR="${PREFIX}/bin"
fi
case "$BINDIR" in
  \~) BINDIR="${HOME}" ;;
  \~/*) BINDIR="${HOME}/${BINDIR#??}" ;;
  /*) ;;
  *) die 2 "--bindir debe ser una ruta absoluta" ;;
esac
while [ "${BINDIR%/}" != "$BINDIR" ]; do BINDIR="${BINDIR%/}"; done
case "$BINDIR" in
  "" | "/") die 2 "--bindir no puede ser la raíz del sistema" ;;
esac

APP_DIR="${PREFIX}/share/${APP_NAME}"
BINARY="${BINDIR}/mm"
CONFIG_DIR="${HOME}/.config/media-manager"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"

# Verificar herramientas necesarias
have git || die 1 "se necesita 'git' para clonar el repositorio"
have node || die 1 "se necesita 'node' (Node.js >= 22) para compilar"
have npm || die 1 "se necesita 'npm' para instalar dependencias"

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ] 2>/dev/null; then
  die 1 "Node.js debe ser >= 22 (detectado: ${NODE_VERSION})"
fi

if [ -d "$APP_DIR" ]; then
  [ "$FORCE" -eq 1 ] || die 4 "la versión ya está instalada en ${APP_DIR}; usa --force"
fi
if [ -e "$BINARY" ] || [ -L "$BINARY" ]; then
  [ "$FORCE" -eq 1 ] || die 4 "${BINARY} existe y no lo gestiona este instalador; usa --force para reemplazarlo"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  say ""
  say "Simulación (no se modifica nada):"
  say "  repositorio: ${REPOSITORY}"
  say "  destino:     ${APP_DIR}"
  say "  comando:     ${BINARY}"
  say "  config:      ${CONFIG_FILE}"
  exit 0
fi

if [ -e "$PREFIX" ] && [ ! -d "$PREFIX" ]; then
  die 1 "$PREFIX existe y no es un directorio"
fi
mkdir -p "$APP_DIR" "$BINDIR" "$CONFIG_DIR" || die 1 "no se pudieron crear los directorios de instalación"

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t mm-install)

step "clonando el repositorio"
CLONE_DIR="${TMP_DIR}/repo"
git clone "${REPOSITORY}" "${CLONE_DIR}" || die 1 "no se pudo clonar el repositorio"

step "instalando dependencias"
if [ "${MM_SKIP_BUILD:-0}" != "1" ]; then
  cd "${CLONE_DIR}" || die 1 "no se pudo entrar al directorio clonado"
  npm install --omit=dev || die 1 "falló 'npm install'"
else
  echo "  (omitido: MM_SKIP_BUILD=1)"
fi

step "compilando"
if [ "${MM_SKIP_BUILD:-0}" != "1" ]; then
  npm run build || die 1 "falló 'npm run build'"
else
  echo "  (omitido: MM_SKIP_BUILD=1)"
  # Para pruebas, crear un dist/ mínimo si no existe
  if [ ! -d "${CLONE_DIR}/dist" ]; then
    mkdir -p "${CLONE_DIR}/dist"
    echo '#!/usr/bin/env node' > "${CLONE_DIR}/dist/cli.js"
    echo "console.log('1.0.0');" >> "${CLONE_DIR}/dist/cli.js"
    chmod 755 "${CLONE_DIR}/dist/cli.js"
  fi
fi

step "instalando en ${APP_DIR}"
if [ -d "$APP_DIR" ]; then
  rm -rf "$APP_DIR" || die 1 "no se pudo eliminar la instalación anterior"
fi
mkdir -p "$APP_DIR" || die 1 "no se pudo crear el directorio de instalación"
cp -r "${CLONE_DIR}/dist" "${APP_DIR}/dist" || die 1 "no se pudo copiar dist/"
if [ -d "${CLONE_DIR}/node_modules" ]; then
  cp -r "${CLONE_DIR}/node_modules" "${APP_DIR}/node_modules" || die 1 "no se pudo copiar node_modules/"
fi
cp "${CLONE_DIR}/package.json" "${APP_DIR}/package.json" || die 1 "no se pudo copiar package.json"

# Crear script de entrada mm que ejecute el CLI compilado
cat > "${APP_DIR}/mm" <<'SCRIPT'
#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${DIR}/dist/cli.js" "$@"
SCRIPT
chmod 755 "${APP_DIR}/mm"

step "creando ${BINARY}"
mkdir -p "$BINDIR"
cat > "${BINARY}" <<SCRIPT
#!/bin/sh
# managed by media-manager-cli installer
exec "${APP_DIR}/mm" "\$@"
SCRIPT
chmod 755 "${BINARY}"

step "creando archivo de configuración por defecto"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'YAML'
version: 1

library:
  roots: []
  exclude:
    - '**/*.sample.*'
    - '**/sample/**'
    - '**/.hidden/**'
    - '**/@eaDir/**'
  scan:
    followSymlinks: false
    maxDepth: 4
    minSizeBytes: 0

database:
  path: ~/.local/share/media-manager/library.db

player:
  default: mpv
  onLaunch: detach
  players:
    mpv:
      command: mpv
      args: ['--force-window=immediate', '{file}']
    vlc:
      command: vlc
      args: ['--started-from-file', '{file}']

playback:
  tracking: auto
  resume: true
  resumeMinSeconds: 30
  completedThreshold: 0.9
  completedTailSeconds: 30

ui:
  theme: default
  layout: split
  sort: title
  showDetails: true
  compact: false

logging:
  level: warn
  format: text

keybindings:
  quit: q
  help: '?'
  search: /
  play: p
  nextSection: tab
  settings: s
  up: up
  down: down
  left: left
  right: right
  enter: return
  escape: escape
  configureKeybindings: k
YAML
  say "  creado: ${CONFIG_FILE}"
else
  say "  ya existe: ${CONFIG_FILE} (se conserva)"
fi

step "creando enlace 'current'"
ln -sfn "${APP_DIR}" "${APP_DIR}/current"

step "comprobando la instalación"
_installed_version=$("$BINARY" --version 2>/dev/null | tr -d '\r') || {
  die 1 "el comando instalado no se pudo ejecutar"
}

step "creando install.json"
_installed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
cat > "${APP_DIR}/install.json" <<JSON
{
  "schemaVersion": 1,
  "name": "${APP_NAME}",
  "version": "${_installed_version}",
  "platform": "$(uname -s)-$(uname -m)",
  "prefix": "${PREFIX}",
  "appDir": "${APP_DIR}",
  "binary": "${BINARY}",
  "installedAt": "${_installed_at}"
}
JSON

say ""
say "✔ ${APP_NAME} instalado"
say "  comando: ${BINARY}"
say "  versión: ${_installed_version}"
say "  configuración: ${CONFIG_FILE}"
if [ "$NO_PATH_CHECK" -ne 1 ]; then
  case ":${PATH}:" in
    *":${BINDIR}:"*) ;;
    *) warn "${BINDIR} no está en PATH; añádelo para ejecutar 'mm' sin ruta absoluta" ;;
  esac
fi

# Limpiar clone temporal
rm -rf "$CLONE_DIR" 2>/dev/null || true
CLONE_DIR=""

exit 0