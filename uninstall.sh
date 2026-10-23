#!/bin/sh
# Desinstalador de media-manager-cli.
#
# Conserva la configuración y la base de datos salvo que se use --purge.
set -eu
umask 022

APP_NAME="media-manager-cli"
MARKER="# managed by media-manager-cli installer"

PREFIX="${HOME}/.local"
BINDIR=""
PURGE=0
DRY_RUN=0
ASSUME_YES=0

PREFIX_REAL=""
APP_DIR=""
BINARY=""
CONFIG_DIR=""
DATA_DIR=""

usage() {
  cat <<'EOF'
Uso: uninstall.sh [opciones]

Desinstala media-manager-cli y el comando `mm`.

Opciones:
  --prefix <dir>   prefijo usado en la instalación (por defecto, ~/.local)
  --bindir <dir>   directorio del wrapper (por defecto, <prefix>/bin)
  --purge          elimina también configuración y base de datos
  --dry-run        muestra lo que haría sin borrar nada
  --yes            no pide confirmación
  --help           muestra esta ayuda

Por defecto se conservan:
  ~/.config/media-manager/   (o $XDG_CONFIG_HOME/media-manager)
  ~/.local/share/media-manager/ (o $XDG_DATA_HOME/media-manager)

La biblioteca multimedia nunca se toca. Las versiones antiguas instaladas bajo
<prefix>/share/media-manager-cli se eliminan junto con la instalación.
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

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)
      [ $# -ge 2 ] || die 2 "falta el valor de --prefix"
      PREFIX=$2
      shift 2
      ;;
    --bindir)
      [ $# -ge 2 ] || die 2 "falta el valor de --bindir"
      BINDIR=$2
      shift 2
      ;;
    --purge) PURGE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes | -y) ASSUME_YES=1; shift ;;
    --help | -h) usage; exit 0 ;;
    --) shift; break ;;
    *) die 2 "opción desconocida: $1 (usa --help)" ;;
  esac
done
[ $# -eq 0 ] || die 2 "argumentos inesperados: $*"

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

resolve_path() { (unset CDPATH; cd -- "$1" 2>/dev/null && pwd -P); }

HOME_REAL=$(resolve_path "$HOME") || die 1 "no se pudo resolver HOME"

if [ -e "$PREFIX" ] || [ -L "$PREFIX" ]; then
  PREFIX_REAL=$(resolve_path "$PREFIX") || die 1 "no se pudo resolver --prefix"
else
  PREFIX_REAL=$PREFIX
fi

case "$PREFIX_REAL" in
  "" | "/") die 2 "--prefix no puede ser la raíz del sistema" ;;
esac
if [ "$PREFIX_REAL" = "$HOME_REAL" ]; then
  die 2 "--prefix no puede ser el directorio personal"
fi
case "$HOME_REAL" in
  "$PREFIX_REAL"/*) die 2 "--prefix no puede ser un directorio padre de $HOME_REAL" ;;
esac

APP_DIR="${PREFIX_REAL}/share/${APP_NAME}"
CURRENT_LINK="${APP_DIR}/current"
BINARY="${BINDIR}/mm"

if ! { [ -e "$APP_DIR" ] || [ -L "$APP_DIR" ]; }; then
  say "No hay ninguna instalación de ${APP_NAME} en ${APP_DIR}."
  exit 0
fi
if [ ! -L "$CURRENT_LINK" ]; then
  die 1 "${APP_DIR} existe pero no tiene un enlace 'current' válido; revísalo manualmente"
fi
CURRENT_REAL=$(resolve_path "$CURRENT_LINK") ||
  die 1 "el enlace 'current' apunta a una ruta inexistente; revísalo manualmente"
case "$CURRENT_REAL" in
  "$APP_DIR"/*) ;;
  *) die 1 "el enlace 'current' apunta fuera de ${APP_DIR}; no se continúa" ;;
esac
MANIFEST="${CURRENT_REAL}/install.json"
if [ ! -f "$MANIFEST" ] || [ -L "$MANIFEST" ]; then
  die 1 "${CURRENT_REAL} no contiene un install.json válido; revísalo manualmente"
fi

VERSION=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' \
  "$MANIFEST" | head -n 1)
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$' ||
  die 1 "install.json contiene una versión inválida"
INSTALLED_AT=$(sed -n 's/^[[:space:]]*"installedAt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' \
  "$MANIFEST" | head -n 1)

if [ -n "${XDG_CONFIG_HOME:-}" ]; then
  case "$XDG_CONFIG_HOME" in
    /*) CONFIG_DIR="${XDG_CONFIG_HOME}/media-manager" ;;
    *) CONFIG_DIR="${HOME}/.config/media-manager" ;;
  esac
else
  CONFIG_DIR="${HOME}/.config/media-manager"
fi
if [ -n "${XDG_DATA_HOME:-}" ]; then
  case "$XDG_DATA_HOME" in
    /*) DATA_DIR="${XDG_DATA_HOME}/media-manager" ;;
    *) DATA_DIR="${HOME}/.local/share/media-manager" ;;
  esac
else
  DATA_DIR="${HOME}/.local/share/media-manager"
fi

say ""
say "Se desinstalará ${APP_NAME} ${VERSION}"
[ -n "$INSTALLED_AT" ] && say "  instalado: ${INSTALLED_AT}"
say "  aplicación: ${APP_DIR}"
say "  comando:    ${BINARY}"
if [ "$PURGE" -eq 1 ]; then
  say "  configuración: ${CONFIG_DIR} (se eliminará)"
  say "  base de datos: ${DATA_DIR} (se eliminará)"
else
  say "  configuración: ${CONFIG_DIR} (se conserva)"
  say "  base de datos: ${DATA_DIR} (se conserva)"
fi
say ""

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ -t 0 ] || die 2 "no hay terminal interactiva; usa --yes para confirmar"
  printf '%s [y/N] ' "$1"
  read -r _answer || _answer=""
  case "$_answer" in
    y | Y | yes | YES | Yes) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "$DRY_RUN" -eq 1 ]; then
  say "Simulación: no se ha borrado nada."
  exit 0
fi

confirm "¿Continuar?" || {
  say "Cancelado."
  exit 0
}

if [ "$PURGE" -eq 1 ]; then
  confirm "Esto eliminará también la configuración y la base de datos. ¿Seguro?" || {
    say "Cancelado."
    exit 0
  }
fi

remove_within() {
  _path=$1
  _parent=$2
  if [ ! -e "$_path" ] && [ ! -L "$_path" ]; then
    return 0
  fi
  if [ -L "$_path" ]; then
    step "eliminando el enlace ${_path}"
    rm -f "$_path" || die 1 "no se pudo eliminar ${_path}"
    return 0
  fi
  _resolved=$(resolve_path "$_path") || die 1 "no se pudo resolver ${_path}"
  _parent_resolved=$(resolve_path "$_parent") || die 1 "no se pudo resolver ${_parent}"
  case "$_resolved" in
    "$_parent_resolved"/*) ;;
    *) die 1 "${_path} queda fuera de ${_parent}; no se elimina" ;;
  esac
  [ "$_resolved" != "$_parent_resolved" ] || die 1 "no se elimina ${_parent} directamente"
  case "$_resolved" in
    "" | "/" | "$HOME_REAL") die 1 "ruta peligrosa: ${_resolved}" ;;
  esac
  step "eliminando ${_path}"
  rm -rf "$_path" || die 1 "no se pudo eliminar ${_path}"
}

if [ -e "$BINARY" ] || [ -L "$BINARY" ]; then
  if [ -L "$BINARY" ] || ! grep -Fqx "$MARKER" "$BINARY" 2>/dev/null; then
    warn "${BINARY} no lo gestiona este instalador; no se elimina"
  else
    step "eliminando ${BINARY}"
    rm -f "$BINARY" || die 1 "no se pudo eliminar ${BINARY}"
  fi
fi

remove_within "$APP_DIR" "${PREFIX_REAL}/share"

if [ "$PURGE" -eq 1 ]; then
  remove_within "$CONFIG_DIR" "$(dirname "$CONFIG_DIR")"
  remove_within "$DATA_DIR" "$(dirname "$DATA_DIR")"
fi

say ""
say "✔ ${APP_NAME} desinstalado"
if [ "$PURGE" -ne 1 ]; then
  say "  Se conservan ${CONFIG_DIR} y ${DATA_DIR}."
  say "  Usa --purge para eliminarlos."
fi
