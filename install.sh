#!/bin/sh
# Instalador de media-manager-cli.
#
# Descarga un bundle portable desde GitHub Releases, verifica su integridad y
# lo instala por usuario sin sudo. Revisa el script antes de ejecutarlo.
set -eu
umask 022

REPOSITORY="Angel-p-v/media-manager"
RELEASES_URL="https://github.com/${REPOSITORY}/releases"
APP_NAME="media-manager-cli"
MARKER="# managed by media-manager-cli installer"

PREFIX="${HOME}/.local"
PREFIX_EXPLICIT=0
BINDIR=""
VERSION_INPUT=""
ARCHIVE_INPUT=""
CHECKSUM_INPUT=""
FORCE=0
DRY_RUN=0
VERIFY_ATTESTATION=0
NO_PATH_CHECK=0

TMP_DIR=""
STAGE_DIR=""
LOCK_DIR=""
CURRENT_OLD=""
STAGE_OLD=""

usage() {
  cat <<'EOF'
Uso: install.sh [opciones]

Instala media-manager-cli y el comando `mm` desde GitHub Releases.

Opciones:
  --version <tag>        versión a instalar; por defecto, la última release
  --prefix <dir>         prefijo de instalación (por defecto, ~/.local)
  --bindir <dir>         directorio del wrapper (por defecto, <prefix>/bin)
  --file <tar.gz>        instala desde un archivo local
  --sha256 <archivo>     checksum del archivo local (por defecto, <archivo>.sha256)
  --verify-attestation   exige verificar la atestación de GitHub con `gh`
  --force                reinstala la misma versión o reemplaza el wrapper
  --dry-run              muestra los cambios sin aplicarlos
  --no-path-check        no avisa si <bindir> no está en PATH
  --help                 muestra esta ayuda

Ejemplos:
  sh install.sh
  sh install.sh --version v1.0.0
  sh install.sh --file media-manager-cli-1.0.0-linux-x64.tar.gz \
    --sha256 media-manager-cli-1.0.0-linux-x64.tar.gz.sha256

Códigos de salida:
  0 éxito · 1 red/checksum · 2 uso incorrecto · 3 plataforma no soportada
  4 instalación existente sin --force
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
  if [ -n "$STAGE_DIR" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf "$STAGE_DIR" 2>/dev/null || true
  fi
  if [ -n "$CURRENT_OLD" ] && [ -e "$CURRENT_OLD" ]; then
    rm -f "$CURRENT_OLD" 2>/dev/null || true
  fi
  if [ -n "$STAGE_OLD" ] && [ -e "$STAGE_OLD" ]; then
    rm -rf "$STAGE_OLD" 2>/dev/null || true
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR" 2>/dev/null || true
  fi
  if [ -n "$LOCK_DIR" ] && [ -d "$LOCK_DIR" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
  exit "$_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || die 2 "falta el valor de --version"
      VERSION_INPUT=$2
      shift 2
      ;;
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
    --file)
      [ $# -ge 2 ] || die 2 "falta el valor de --file"
      ARCHIVE_INPUT=$2
      shift 2
      ;;
    --sha256)
      [ $# -ge 2 ] || die 2 "falta el valor de --sha256"
      CHECKSUM_INPUT=$2
      shift 2
      ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --verify-attestation) VERIFY_ATTESTATION=1; shift ;;
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
  "~") PREFIX="${HOME}" ;;
  ~/*) PREFIX="${HOME}${PREFIX#??}" ;;
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
  "~") BINDIR="${HOME}" ;;
  ~/*) BINDIR="${HOME}${BINDIR#??}" ;;
  /*) ;;
  *) die 2 "--bindir debe ser una ruta absoluta" ;;
esac
while [ "${BINDIR%/}" != "$BINDIR" ]; do BINDIR="${BINDIR%/}"; done
case "$BINDIR" in
  "" | "/") die 2 "--bindir no puede ser la raíz del sistema" ;;
esac

APP_DIR="${PREFIX}/share/${APP_NAME}"
CURRENT_LINK="${APP_DIR}/current"
BINARY="${BINDIR}/mm"

have tar || die 1 "se necesita 'tar'"
if [ -n "$ARCHIVE_INPUT" ]; then
  [ -f "$ARCHIVE_INPUT" ] || die 2 "no existe el archivo: $ARCHIVE_INPUT"
  if [ -z "$CHECKSUM_INPUT" ]; then
    CHECKSUM_INPUT="${ARCHIVE_INPUT}.sha256"
  fi
  [ -f "$CHECKSUM_INPUT" ] || die 2 "falta el checksum: $CHECKSUM_INPUT"
  if ! have sha256sum && ! have shasum; then
    die 1 "se necesita 'sha256sum' o 'shasum' para verificar el archivo"
  fi
else
  if ! have curl && ! have wget; then
    die 1 "se necesita 'curl' o 'wget' para descargar la release"
  fi
  if ! have sha256sum && ! have shasum; then
    die 1 "se necesita 'sha256sum' o 'shasum' para verificar la descarga"
  fi
fi
if [ "$VERIFY_ATTESTATION" -eq 1 ] && ! have gh; then
  die 1 "--verify-attestation requiere 'gh' en PATH"
fi

is_musl() {
  if have ldd && ldd --version 2>&1 | head -n 1 | grep -qi musl; then
    return 0
  fi
  for _libc in /lib/ld-musl-*.so.1; do
    [ -e "$_libc" ] && return 0
  done
  return 1
}

detect_platform() {
  _os=$(uname -s)
  _arch=$(uname -m)
  case "$_os" in
    Linux)
      _os=linux
      if is_musl; then
        die 3 "musl/Alpine no está soportado; se necesita glibc"
      fi
      ;;
    Darwin)
      die 3 "macOS todavía no tiene bundle publicado"
      ;;
    *)
      die 3 "sistema no soportado: $_os (solo Linux)"
      ;;
  esac
  case "$_arch" in
    x86_64 | amd64) _arch=x64 ;;
    aarch64 | arm64) _arch=arm64 ;;
    *) die 3 "arquitectura no soportada: $_arch" ;;
  esac
  printf '%s-%s' "$_os" "$_arch"
}

normalize_version() {
  printf '%s' "${1#v}"
}

valid_version() {
  printf '%s' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
}

fetch() {
  _url=$1
  _output=$2
  if have curl; then
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
      --location --retry 3 --output "$_output" "$_url"
  else
    wget --https-only --secure-protocol=TLSv1_2 --quiet --output-document="$_output" "$_url"
  fi
}

resolve_latest_tag() {
  _url="${RELEASES_URL}/latest"
  if have curl; then
    _effective=$(curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
      --location --head --output /dev/null --write-out '%{url_effective}' "$_url") ||
      die 1 "no se pudo resolver la última release"
  else
    _location=$(wget --https-only --secure-protocol=TLSv1_2 --max-redirect=0 \
      --server-response --spider "$_url" 2>&1 |
      sed -n 's/^[[:space:]]*Location:[[:space:]]*//p' | head -n 1 | tr -d '\r') ||
      die 1 "no se pudo resolver la última release"
    case "$_location" in
      http*) _effective=$_location ;;
      /*) _effective="https://github.com${_location}" ;;
      *) die 1 "respuesta inesperada al resolver la última release" ;;
    esac
  fi
  _tag=${_effective##*/}
  valid_version "$(normalize_version "$_tag")" || die 1 "tag de release inválido: $_tag"
  printf '%s' "$_tag"
}

sha256_of() {
  if have sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

json_string() {
  _key=$1
  _file=$2
  sed -n "s/^[[:space:]]*\"${_key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*\$/\1/p" "$_file" | head -n 1
}

assert_checksum_name() {
  _checksum_file=$1
  _expected_name=$2
  _listed=$(awk 'NR == 1 { print $2 }' "$_checksum_file" | sed 's/^\*//')
  [ -n "$_listed" ] || die 1 "el archivo de checksum está vacío o mal formado"
  [ "$_listed" = "$_expected_name" ] ||
    die 1 "el checksum corresponde a '$_listed' y no a '$_expected_name'"

  if have sha256sum; then
    (cd "$TMP_DIR" && sha256sum -c "$(basename "$_checksum_file")") >/dev/null 2>&1 ||
      die 1 "el checksum SHA-256 no coincide"
  else
    (cd "$TMP_DIR" && shasum -a 256 -c "$(basename "$_checksum_file")") >/dev/null 2>&1 ||
      die 1 "el checksum SHA-256 no coincide"
  fi
}

validate_archive() {
  _archive=$1
  _entries="${TMP_DIR}/entries.txt"
  tar -tzf "$_archive" >"$_entries" 2>/dev/null || die 1 "el archivo no es un tar.gz válido"
  [ -s "$_entries" ] || die 1 "el archivo está vacío"

  _root=""
  while IFS= read -r _entry; do
    case "$_entry" in
      /*) die 1 "el archivo contiene una ruta absoluta: $_entry" ;;
      *../* | .. | */..) die 1 "el archivo contiene una ruta con '..': $_entry" ;;
      "") die 1 "el archivo contiene una entrada vacía" ;;
    esac
    case "$_entry" in
      */) _entry=${_entry%/} ;;
    esac
    _first=${_entry%%/*}
    if [ -z "$_root" ]; then
      _root=$_first
    elif [ "$_first" != "$_root" ]; then
      die 1 "el archivo contiene más de un directorio raíz"
    fi
  done <"$_entries"
  [ -n "$_root" ] || die 1 "el archivo no tiene un directorio raíz"

  printf '%s\n' "$_root" >"${TMP_DIR}/root.txt"
  sed "s|^${_root}/||" "$_entries" | grep -v "^${_root}\$" >"${TMP_DIR}/members.txt" || true

  tar -xzOf "$_archive" "${_root}/install.json" >"${TMP_DIR}/install-build.json" 2>/dev/null ||
    die 1 "el archivo no contiene install.json"

  for _required in install.json mm node node_modules/${APP_NAME}/dist/cli.js; do
    grep -Fxq "$_required" "${TMP_DIR}/members.txt" ||
      die 1 "el archivo no contiene ${_required}"
  done

  [ "$(grep -cx 'install.json' "${TMP_DIR}/members.txt")" -eq 1 ] ||
    die 1 "el archivo contiene un install.json inesperado"
}

read_build_metadata() {
  _file="${TMP_DIR}/install-build.json"
  grep -Eq '"schemaVersion"[[:space:]]*:[[:space:]]*1([^0-9]|$)' "$_file" ||
    die 1 "install.json: schemaVersion inválido"
  [ "$(json_string name "$_file")" = "$APP_NAME" ] || die 1 "install.json: nombre inválido"
  _build_version=$(json_string version "$_file")
  valid_version "$_build_version" || die 1 "install.json: versión inválida"
  _build_platform=$(json_string platform "$_file")
  [ -n "$_build_platform" ] || die 1 "install.json: plataforma ausente"
}

PLATFORM=$(detect_platform)
ARTIFACT=""
ARCHIVE=""
CHECKSUM=""

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t mm-install)

if [ -n "$ARCHIVE_INPUT" ]; then
  ARTIFACT=$(basename "$ARCHIVE_INPUT")
  case "$ARTIFACT" in
    *.tar.gz) ;;
    *) die 2 "el archivo debe tener extensión .tar.gz" ;;
  esac
  ARCHIVE="${TMP_DIR}/${ARTIFACT}"
  CHECKSUM="${TMP_DIR}/${ARTIFACT}.sha256"
  cp "$ARCHIVE_INPUT" "$ARCHIVE" || die 1 "no se pudo copiar el archivo local"
  cp "$CHECKSUM_INPUT" "$CHECKSUM" || die 1 "no se pudo copiar el checksum"

  step "verificando el checksum"
  assert_checksum_name "$CHECKSUM" "$ARTIFACT"

  step "inspeccionando el archivo"
  validate_archive "$ARCHIVE"
  read_build_metadata

  if [ -n "$VERSION_INPUT" ]; then
    VERSION=$(normalize_version "$VERSION_INPUT")
    [ "$VERSION" = "$_build_version" ] ||
      die 1 "el archivo contiene la versión $_build_version y se pidió $VERSION"
  else
    VERSION=$_build_version
  fi
  [ "$_build_platform" = "$PLATFORM" ] ||
    die 3 "el archivo es para $_build_platform y este sistema es $PLATFORM"
else
  if [ -n "$VERSION_INPUT" ]; then
    VERSION=$(normalize_version "$VERSION_INPUT")
    valid_version "$VERSION" || die 2 "versión inválida: $VERSION_INPUT"
  else
    TAG=$(resolve_latest_tag)
    VERSION=$(normalize_version "$TAG")
  fi
  TAG="v${VERSION}"
  ARTIFACT="${APP_NAME}-${VERSION}-${PLATFORM}.tar.gz"
  ARCHIVE="${TMP_DIR}/${ARTIFACT}"
  CHECKSUM="${TMP_DIR}/${ARTIFACT}.sha256"
  _base="${RELEASES_URL}/download/${TAG}/${ARTIFACT}"

  step "descargando ${ARTIFACT}"
  fetch "$_base" "$ARCHIVE" || die 1 "no se pudo descargar el artefacto"
  fetch "${_base}.sha256" "$CHECKSUM" || die 1 "no se pudo descargar el checksum"

  step "verificando el checksum"
  assert_checksum_name "$CHECKSUM" "$ARTIFACT"

  step "inspeccionando el archivo"
  validate_archive "$ARCHIVE"
  read_build_metadata
  [ "$_build_version" = "$VERSION" ] ||
    die 1 "el artefacto contiene la versión $_build_version y se esperaba $VERSION"
  [ "$_build_platform" = "$PLATFORM" ] ||
    die 3 "el artefacto es para $_build_platform y este sistema es $PLATFORM"
fi

if [ "$VERIFY_ATTESTATION" -eq 1 ]; then
  step "verificando la atestación de procedencia"
  gh attestation verify "$ARCHIVE" --repo "$REPOSITORY" >/dev/null 2>&1 ||
    die 1 "la atestación de procedencia no es válida"
fi

TARGET="${APP_DIR}/${VERSION}"

is_our_wrapper() {
  [ -f "$1" ] && [ ! -L "$1" ] && grep -Fqx "$MARKER" "$1" 2>/dev/null
}

if [ -d "$TARGET" ]; then
  [ "$FORCE" -eq 1 ] || die 4 "la versión $VERSION ya está instalada; usa --force"
fi
if [ -e "$BINARY" ] || [ -L "$BINARY" ]; then
  if ! is_our_wrapper "$BINARY" && [ "$FORCE" -ne 1 ]; then
    die 4 "$BINARY existe y no lo gestiona este instalador; usa --force para reemplazarlo"
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  say ""
  say "Simulación (no se modifica nada):"
  say "  versión:  ${VERSION}"
  say "  plataforma: ${PLATFORM}"
  say "  artefacto:  ${ARTIFACT}"
  say "  destino:    ${TARGET}"
  say "  enlace:     ${CURRENT_LINK} -> ${VERSION}"
  say "  comando:    ${BINARY}"
  exit 0
fi

if [ -e "$PREFIX" ] && [ ! -d "$PREFIX" ]; then
  die 1 "$PREFIX existe y no es un directorio"
fi
mkdir -p "$APP_DIR" "$BINDIR" || die 1 "no se pudo crear el directorio de instalación"

LOCK_DIR="${APP_DIR}/.install.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_DIR=""
  die 1 "hay otra instalación en curso; si no es así, borra ${APP_DIR}/.install.lock"
fi

STAGE_DIR="${APP_DIR}/.stage-${VERSION}-$$"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" || die 1 "no se pudo preparar el directorio temporal"

step "extrayendo el artefacto"
tar -xzf "$ARCHIVE" -C "$STAGE_DIR" --strip-components=1 2>/dev/null ||
  die 1 "no se pudo extraer el archivo"

_archive_hash=$(sha256_of "$ARCHIVE")
_installed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
_json_prefix=$(json_escape "$PREFIX")
_json_app_dir=$(json_escape "$APP_DIR")
_json_binary=$(json_escape "$BINARY")

cat >"${STAGE_DIR}/install.json" <<EOF
{
  "schemaVersion": 1,
  "name": "${APP_NAME}",
  "version": "${VERSION}",
  "platform": "${PLATFORM}",
  "prefix": "${_json_prefix}",
  "appDir": "${_json_app_dir}",
  "binary": "${_json_binary}",
  "artifact": "${ARTIFACT}",
  "sha256": "${_archive_hash}",
  "installedAt": "${_installed_at}"
}
EOF

step "instalando en ${TARGET}"
if [ -d "$TARGET" ]; then
  STAGE_OLD="${APP_DIR}/.old-${VERSION}-$$"
  mv "$TARGET" "$STAGE_OLD" || die 1 "no se pudo apartar la instalación anterior"
fi
if ! mv "$STAGE_DIR" "$TARGET"; then
  if [ -n "$STAGE_OLD" ] && [ -d "$STAGE_OLD" ]; then
    mv "$STAGE_OLD" "$TARGET" 2>/dev/null || true
    STAGE_OLD=""
  fi
  die 1 "no se pudo mover la instalación a su destino"
fi
STAGE_DIR=""
if [ -n "$STAGE_OLD" ]; then
  rm -rf "$STAGE_OLD"
  STAGE_OLD=""
fi

if [ -L "$CURRENT_LINK" ]; then
  :
elif [ -e "$CURRENT_LINK" ]; then
  die 1 "$CURRENT_LINK existe y no es un enlace simbólico"
fi
CURRENT_OLD="${APP_DIR}/.current-$$"
ln -s "$VERSION" "$CURRENT_OLD" || die 1 "no se pudo crear el enlace current"
# `mv` sin -T seguiría un `current` que apunte a un directorio y movería el
# enlace dentro de la versión. Se elimina el enlace y se mueve el nuevo.
rm -f "$CURRENT_LINK"
mv "$CURRENT_OLD" "$CURRENT_LINK" || die 1 "no se pudo actualizar current"
CURRENT_OLD=""

step "creando ${BINARY}"
if [ -e "$BINARY" ] && ! is_our_wrapper "$BINARY" && [ "$FORCE" -ne 1 ]; then
  die 4 "$BINARY existe y no lo gestiona este instalador"
fi
_wrapper_tmp="${BINDIR}/.mm.$$"
if ! {
  printf '%s\n' '#!/bin/sh' "$MARKER" "exec \"${CURRENT_LINK}/mm\" \"\$@\"" >"$_wrapper_tmp"
}; then
  rm -f "$_wrapper_tmp"
  die 1 "no se pudo escribir el wrapper"
fi
chmod 755 "$_wrapper_tmp"
mv -f "$_wrapper_tmp" "$BINARY" || die 1 "no se pudo instalar el wrapper"

step "comprobando la instalación"
_installed_version=$("$BINARY" --version 2>/dev/null | tr -d '\r') || {
  die 1 "el comando instalado no se pudo ejecutar"
}
[ "$_installed_version" = "$VERSION" ] ||
  die 1 "el comando devolvió '$_installed_version' y se esperaba '$VERSION'"

say ""
say "✔ ${APP_NAME} ${VERSION} instalado"
say "  comando: ${BINARY}"
say "  versión: ${TARGET}"
if [ "$NO_PATH_CHECK" -ne 1 ]; then
  case ":${PATH}:" in
    *":${BINDIR}:"*) ;;
    *) warn "${BINDIR} no está en PATH; añádelo para ejecutar 'mm' sin ruta absoluta" ;;
  esac
fi
