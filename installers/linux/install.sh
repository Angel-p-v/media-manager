#!/bin/sh
# Instalador de media-manager-cli.
#
# Descarga un release precompilado de GitHub Releases, verifica el
# checksum SHA-256 y deja el comando `mm` disponible por usuario
# sin sudo. Revisa el script antes de ejecutarlo.
set -eu
umask 022

APP_NAME="media-manager-cli"
REPO="Angel-p-v/media-manager"

PREFIX="${HOME}/.local"
PREFIX_EXPLICIT=0
BINDIR=""
FORCE=0
DRY_RUN=0
NO_PATH_CHECK=0
VERSION=""

TMP_DIR=""

usage() {
  cat <<'EOF'
Uso: install.sh [opciones]

Instala media-manager-cli descargando un release precompilado de
GitHub Releases y verificando el checksum SHA-256.

Opciones:
  --prefix <dir>         prefijo de instalación (por defecto, ~/.local)
  --bindir <dir>         directorio del wrapper (por defecto, <prefix>/bin)
  --version <ver>        versión a instalar (por defecto, la última release)
  --force                reinstala aunque ya exista
  --dry-run              muestra los cambios sin aplicarlos
  --no-path-check        no avisa si <bindir> no está en PATH
  --help                 muestra esta ayuda

Ejemplos:
  sh install.sh
  sh install.sh --prefix "$HOME/.local"
  sh install.sh --version v3.1.0
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
    --version)
      [ $# -ge 2 ] || die 2 "falta el valor de --version"
      VERSION=$2
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

# URL del asset para descargar (sobreescrito por MM_ASSET_URL en tests)
ASSET_URL_OVERRIDE="${MM_ASSET_URL:-}"

# Detectar sistema y arquitectura
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux) OS_NAME="linux" ;;
  *) die 1 "sistema operativo no soportado: ${OS} (solo Linux)" ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_NAME="x64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *) die 1 "arquitectura no soportada: ${ARCH} (solo x64 y arm64)" ;;
esac

if [ -n "$ASSET_URL_OVERRIDE" ]; then
  # Modo test: descargar directamente de una URL dada
  ASSET_NAME=$(basename "$ASSET_URL_OVERRIDE")
  CHECKSUM_NAME="${ASSET_NAME}.sha256"
else
  ASSET_NAME="${APP_NAME}-${VERSION:-latest}-${OS_NAME}-${ARCH_NAME}.tar.gz"
  CHECKSUM_NAME="${ASSET_NAME}.sha256"
fi

# Verificar herramientas necesarias
have curl || have wget || die 1 "se necesita 'curl' o 'wget' para descargar"
have tar || die 1 "se necesita 'tar' para extraer el paquete"
have sha256sum || die 1 "se necesita 'sha256sum' para verificar el checksum"

if [ -d "$APP_DIR" ]; then
  [ "$FORCE" -eq 1 ] || die 4 "la versión ya está instalada en ${APP_DIR}; usa --force para reinstalar o ejecuta primero installers/linux/uninstall.sh"
fi
if [ -e "$BINARY" ] || [ -L "$BINARY" ]; then
  [ "$FORCE" -eq 1 ] || die 4 "${BINARY} existe y no lo gestiona este instalador; usa --force para reemplazarlo o desinstálalo primero con installers/linux/uninstall.sh"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  say ""
  say "Simulación (no se modifica nada):"
  say "  release:     ${VERSION:-última}"
  say "  asset:       ${ASSET_NAME}"
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

# Descargar el release (o usar URL directa si se indica MM_ASSET_URL)
if [ -n "$ASSET_URL_OVERRIDE" ]; then
  # Si es una ruta local, copiar directamente; si es URL, descargar
  case "$ASSET_URL_OVERRIDE" in
    http://*|https://*)
      step "descargando ${ASSET_NAME} desde URL remota"
      if have curl; then
        curl -fsSL "${ASSET_URL_OVERRIDE}" -o "${TMP_DIR}/${ASSET_NAME}" || die 1 "no se pudo descargar ${ASSET_NAME}"
      else
        wget -qO "${TMP_DIR}/${ASSET_NAME}" "${ASSET_URL_OVERRIDE}" || die 1 "no se pudo descargar ${ASSET_NAME}"
      fi
      ;;
    *)
      step "copiando ${ASSET_NAME} desde archivo local"
      cp "${ASSET_URL_OVERRIDE}" "${TMP_DIR}/${ASSET_NAME}" || die 1 "no se pudo copiar ${ASSET_NAME}"
      ;;
  esac
else
  # Descargar el release
  step "obteniendo información del release"
  if [ -n "$VERSION" ]; then
    RELEASE_URL="https://api.github.com/repos/${REPO}/releases/tags/${VERSION}"
  else
    RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
  fi

  if have curl; then
    RELEASE_JSON=$(curl -fsSL "${RELEASE_URL}" 2>/dev/null) || die 1 "no se pudo obtener información del release"
  else
    RELEASE_JSON=$(wget -qO- "${RELEASE_URL}" 2>/dev/null) || die 1 "no se pudo obtener información del release"
  fi

  ASSET_URL=$(printf '%s' "${RELEASE_JSON}" | grep -o "https://[^\"]*${ASSET_NAME}" | head -n 1)
  if [ -z "$ASSET_URL" ]; then
    die 1 "no se encontró el asset ${ASSET_NAME} en el release"
  fi

  step "descargando ${ASSET_NAME}"
  if have curl; then
    curl -fsSL "${ASSET_URL}" -o "${TMP_DIR}/${ASSET_NAME}" || die 1 "no se pudo descargar ${ASSET_NAME}"
  else
    wget -qO "${TMP_DIR}/${ASSET_NAME}" "${ASSET_URL}" || die 1 "no se pudo descargar ${ASSET_NAME}"
  fi
fi

# Descargar y verificar checksum
step "verificando checksum SHA-256"
if [ -n "$ASSET_URL_OVERRIDE" ]; then
  CHECKSUM_PATH="${ASSET_URL_OVERRIDE}.sha256"
  case "$CHECKSUM_PATH" in
    http://*|https://*)
      if have curl; then
        curl -fsSL "${CHECKSUM_PATH}" -o "${TMP_DIR}/${CHECKSUM_NAME}" 2>/dev/null || die 1 "no se pudo descargar el checksum SHA-256"
      else
        wget -qO "${TMP_DIR}/${CHECKSUM_NAME}" "${CHECKSUM_PATH}" 2>/dev/null || die 1 "no se pudo descargar el checksum SHA-256"
      fi
      ;;
    *)
      cp "${CHECKSUM_PATH}" "${TMP_DIR}/${CHECKSUM_NAME}" || die 1 "no se pudo copiar el checksum SHA-256"
      ;;
  esac
else
  CHECKSUM_URL="${ASSET_URL}.sha256"
  if have curl; then
    curl -fsSL "${CHECKSUM_URL}" -o "${TMP_DIR}/${CHECKSUM_NAME}" 2>/dev/null || die 1 "no se pudo descargar el checksum SHA-256"
  else
    wget -qO "${TMP_DIR}/${CHECKSUM_NAME}" "${CHECKSUM_URL}" 2>/dev/null || die 1 "no se pudo descargar el checksum SHA-256"
  fi
fi

EXPECTED_SHA=$(awk '{print $1}' "${TMP_DIR}/${CHECKSUM_NAME}")
ACTUAL_SHA=$(sha256sum "${TMP_DIR}/${ASSET_NAME}" | awk '{print $1}')

if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
  die 1 "checksum SHA-256 no coincide:\n  esperado: ${EXPECTED_SHA}\n  obtenido: ${ACTUAL_SHA}"
fi

step "extrayendo en ${APP_DIR}"
tar -xzf "${TMP_DIR}/${ASSET_NAME}" -C "${TMP_DIR}" || die 1 "no se pudo extraer el paquete"

# El tar puede extraer directamente los archivos o dentro de un subdirectorio
EXTRACT_DIR="${TMP_DIR}"
if [ -d "${TMP_DIR}/dist" ]; then
  EXTRACT_DIR="${TMP_DIR}"
else
  # Buscar subdirectorio que coincida con el patrón del paquete extraído
  _found=0
  for _d in "${TMP_DIR}"/*/; do
    case "$_d" in
      *"${APP_NAME}"-*)
        EXTRACT_DIR="${_d%/}"
        _found=1
        break
        ;;
    esac
  done
  [ "$_found" -eq 1 ] || EXTRACT_DIR="${TMP_DIR}"
fi

if [ ! -d "${EXTRACT_DIR}/dist" ]; then
  die 1 "el paquete no contiene el directorio dist/ esperado"
fi

if [ -d "$APP_DIR" ]; then
  rm -rf "$APP_DIR" || die 1 "no se pudo eliminar la instalación anterior"
fi
mkdir -p "$APP_DIR" || die 1 "no se pudo crear el directorio de instalación"
cp -r "${EXTRACT_DIR}/dist" "${APP_DIR}/dist" || die 1 "no se pudo copiar dist/"
if [ -f "${EXTRACT_DIR}/package.json" ]; then
  cp "${EXTRACT_DIR}/package.json" "${APP_DIR}/package.json" || die 1 "no se pudo copiar package.json"
fi

# Crear script de entrada mm
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

step "creando install.json"
_installed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
_installed_version=$("$BINARY" --version 2>/dev/null | tr -d '\r') || {
  die 1 "el comando instalado no se pudo ejecutar"
}
cat > "${APP_DIR}/install.json" <<JSON
{
  "schemaVersion": 1,
  "name": "${APP_NAME}",
  "version": "${_installed_version}",
  "platform": "${OS_NAME}-${ARCH_NAME}",
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
say "  plataforma: ${OS_NAME}-${ARCH_NAME}"
say "  configuración: ${CONFIG_FILE}"
if [ "$NO_PATH_CHECK" -ne 1 ]; then
  case ":${PATH}:" in
    *":${BINDIR}:"*) ;;
    *) warn "${BINDIR} no está en PATH; añádelo para ejecutar 'mm' sin ruta absoluta" ;;
  esac
fi

exit 0