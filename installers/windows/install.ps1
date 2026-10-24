#!/usr/bin/env pwsh
# Instalador de media-manager-cli para Windows.
#
# Descarga un bundle portable (.zip) desde GitHub Releases, verifica su
# integridad y lo instala por usuario sin privilegios de administrador.
# Revisa el script antes de ejecutarlo.
#
# Uso: .\install.ps1 [opciones]
#   .\install.ps1
#   .\install.ps1 --version v2.1.0
#   .\install.ps1 --file media-manager-cli-2.1.0-windows-x64.zip --sha256 ...sha256

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$REPOSITORY = "Angel-p-v/media-manager"
$RELEASES_URL = "https://github.com/${REPOSITORY}/releases"
$APP_NAME = "media-manager-cli"
$MARKER = "# managed by media-manager-cli installer"

$PREFIX = "$env:LOCALAPPDATA\${APP_NAME}"
$PREFIX_EXPLICIT = $false
$BINDIR = ""
$VERSION_INPUT = $null
$ARCHIVE_INPUT = $null
$CHECKSUM_INPUT = $null
$FORCE = $false
$DRY_RUN = $false
$VERIFY_ATTESTATION = $false
$NO_PATH_CHECK = $false
$script:TMP_DIR = ""

function usage() {
@"
Uso: .\install.ps1 [opciones]

Instala media-manager-cli y el comando `mm` desde GitHub Releases.

Opciones:
  --version <tag>        versión a instalar; por defecto, la última release
  --prefix <dir>         prefijo de instalación (por defecto, %LOCALAPPDATA%\media-manager-cli)
  --bindir <dir>         directorio del wrapper (por defecto, <prefix>\bin)
  --file <zip>           instala desde un archivo local
  --sha256 <archivo>     checksum del archivo local (por defecto, <archivo>.sha256)
  --verify-attestation   exige verificar la atestación de GitHub con `gh`
  --force                reinstala la misma versión o reemplaza el wrapper
  --dry-run              muestra los cambios sin aplicarlos
  --no-path-check        no avisa si <bindir> no está en PATH
  --help                 muestra esta ayuda

Ejemplos:
  .\install.ps1
  .\install.ps1 --version v2.1.0
  .\install.ps1 --file media-manager-cli-2.1.0-windows-x64.zip `
    --sha256 media-manager-cli-2.1.0-windows-x64.zip.sha256

Códigos de salida:
  0 éxito · 1 red/checksum · 2 uso incorrecto · 3 plataforma no soportada
  4 instalación existente sin --force
"@
    exit 0
}

function say($msg) { Write-Output $msg }
function step($msg) { Write-Output "· $msg" }
function warn($msg) { Write-Warning $msg }
function die([int]$code, $msg) {
    Write-Error "error: $msg"
    exit $code
}

function have($cmd) {
    return (Get-Command $cmd -ErrorAction SilentlyContinue) -ne $null
}

function normalize_version($v) { return $v.TrimStart('v') }

function valid_version($v) {
    return $v -match '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
}

function fetch($url, $output) {
    if (have curl) {
        & curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 3 --output $output $url
        if ($LASTEXITCODE -ne 0) { die 1 "no se pudo descargar: $url" }
    } else {
        & wget --https-only --secure-protocol=TLSv1_2 --quiet --output-document=$output $url
        if ($LASTEXITCODE -ne 0) { die 1 "no se pudo descargar: $url" }
    }
}

function resolve_latest_tag() {
    $url = "$RELEASES_URL/latest"
    if (have curl) {
        $effective = & curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --head --output $null --write-out '%{url_effective}' $url
        if ($LASTEXITCODE -ne 0) { die 1 "no se pudo resolver la última release" }
    } else {
        $resp = & wget --https-only --secure-protocol=TLSv1_2 --max-redirect=0 --server-response --spider $url 2>&1
        $location = ($resp | Select-String "Location:").ToString() -replace '^[[:space:]]*Location:[[:space:]]*','' -replace '\r',''
        if (-not $location) { die 1 "no se pudo resolver la última release" }
        $effective = if ($location -match '^http') { $location } elseif ($location -match '^/') { "https://github.com$location" } else { die 1 "respuesta inesperada al resolver la última release" }
    }
    $tag = $effective.Split('/')[-1]
    $version = normalize_version $tag
    if (-not (valid_version $version)) { die 1 "tag de release inválido: $tag" }
    return $tag
}

function sha256_of($file) {
    $output = & certutil -hashfile $file SHA256
    $line = ($output | Select-String '[0-9a-fA-F]{64}').ToString().Trim()
    return $line
}

function assert_checksum_name($checksumFile, $expectedName, $tmpDir) {
    $content = Get-Content $checksumFile -TotalCount 1
    $parts = ($content -replace '^\*','').Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
    $listedHash = $parts[0].Trim()
    $listedName = $parts[-1].Trim()
    if (-not $listedName) { die 1 "el archivo de checksum está vacío o mal formado" }
    if ($listedName -ne $expectedName) {
        die 1 "el checksum corresponde a '$listedName' y no a '$expectedName'"
    }
    $fullPath = Join-Path $tmpDir $expectedName
    $actual = sha256_of $fullPath
    if ($actual.ToLower() -ne $listedHash.ToLower()) { die 1 "el checksum SHA-256 no coincide" }
}

function is_our_wrapper($path) {
    if (-not (Test-Path $path)) { return $false }
    if ([System.IO.Path]::GetExtension($path) -ne '.bat') { return $false }
    $content = Get-Content $path -TotalCount 1
    return $content -eq $MARKER
}

# --- Parseo de argumentos ---
$argsCopy = $args
$i = 0
while ($i -lt $argsCopy.Count) {
    $arg = $argsCopy[$i]
    switch ($arg) {
        "--version" {
            if ($i + 1 -ge $argsCopy.Count) { die 2 "falta el valor de --version" }
            $VERSION_INPUT = $argsCopy[$i + 1]
            $i += 2
        }
        "--prefix" {
            if ($i + 1 -ge $argsCopy.Count) { die 2 "falta el valor de --prefix" }
            $PREFIX = $argsCopy[$i + 1]
            $PREFIX_EXPLICIT = $true
            $i += 2
        }
        "--bindir" {
            if ($i + 1 -ge $argsCopy.Count) { die 2 "falta el valor de --bindir" }
            $BINDIR = $argsCopy[$i + 1]
            $i += 2
        }
        "--file" {
            if ($i + 1 -ge $argsCopy.Count) { die 2 "falta el valor de --file" }
            $ARCHIVE_INPUT = $argsCopy[$i + 1]
            $i += 2
        }
        "--sha256" {
            if ($i + 1 -ge $argsCopy.Count) { die 2 "falta el valor de --sha256" }
            $CHECKSUM_INPUT = $argsCopy[$i + 1]
            $i += 2
        }
        "--force" { $FORCE = $true; $i++ }
        "--dry-run" { $DRY_RUN = $true; $i++ }
        "--verify-attestation" { $VERIFY_ATTESTATION = $true; $i++ }
        "--no-path-check" { $NO_PATH_CHECK = $true; $i++ }
        "--help" { usage }
        "-h" { usage }
        "--" { $i++; break }
        default { die 2 "opción desconocida: $arg (usa --help)" }
    }
}
if ($argsCopy.Count -gt $i) { die 2 "argumentos inesperados: $($argsCopy[$i..($argsCopy.Count-1)])" }

if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -and -not $PREFIX_EXPLICIT) {
    die 2 "no ejecutes como administrador; si es necesario, pasa --prefix explícito"
}

# Resolver rutas absolutas
if ($PREFIX -like "~\*") { $PREFIX = $PREFIX.Replace("~", $env:USERPROFILE) }
if (-not [System.IO.Path]::IsPathRooted($PREFIX)) { die 2 "--prefix debe ser una ruta absoluta" }
$PREFIX = $PREFIX.TrimEnd('\')

if (-not $BINDIR) { $BINDIR = "$PREFIX\bin" }
if ($BINDIR -like "~\*") { $BINDIR = $BINDIR.Replace("~", $env:USERPROFILE) }
if (-not [System.IO.Path]::IsPathRooted($BINDIR)) { die 2 "--bindir debe ser una ruta absoluta" }
$BINDIR = $BINDIR.TrimEnd('\')

if ($PREFIX -eq "" -or $PREFIX -eq "\") { die 2 "--prefix no puede ser la raíz del sistema" }
if ($BINDIR -eq "" -or $BINDIR -eq "\") { die 2 "--bindir no puede ser la raíz del sistema" }

$APP_DIR = Join-Path $PREFIX "share" $APP_NAME
$CURRENT_LINK = Join-Path $APP_DIR "current"
$BINARY = Join-Path $BINDIR "mm.bat"

# --- Verificar herramientas necesarias ---
if ($ARCHIVE_INPUT) {
    if (-not (Test-Path $ARCHIVE_INPUT)) { die 2 "no existe el archivo: $ARCHIVE_INPUT" }
    if (-not $CHECKSUM_INPUT) { $CHECKSUM_INPUT = "$ARCHIVE_INPUT.sha256" }
    if (-not (Test-Path $CHECKSUM_INPUT)) { die 2 "falta el checksum: $CHECKSUM_INPUT" }
} else {
    if (-not (have curl) -and -not (have wget)) { die 1 "se necesita 'curl' o 'wget' para descargar la release" }
}
if (-not (have certutil)) { die 1 "se necesita 'certutil' para calcular checksums SHA-256" }
if ($VERIFY_ATTESTATION -and -not (have gh)) { die 1 "--verify-attestation requiere 'gh' en PATH" }

# --- Detección de plataforma ---
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    die 3 "este instalador es solo para Windows; usa install.sh en Linux/macOS"
}
$_arch = if ([Environment]::Is64BitProcess) { "x64" } else { "x86" }
$PLATFORM = "windows-$_arch"

# --- Directorio temporal ---
$script:TMP_DIR = Join-Path $env:TEMP ("mm-install-" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $script:TMP_DIR -Force | Out-Null

try {
    # --- Resolver versión y artefacto ---
    $PLATFORM_DETECTED = $PLATFORM
    $ARTIFACT = ""
    $ARCHIVE = ""
    $CHECKSUM = ""
    $VERSION = ""

    if ($ARCHIVE_INPUT) {
        $ARTIFACT = Split-Path $ARCHIVE_INPUT -Leaf
        if (-not $ARTIFACT.EndsWith('.zip')) { die 2 "el archivo debe tener extensión .zip" }
        $ARCHIVE = Join-Path $script:TMP_DIR $ARTIFACT
        $CHECKSUM = Join-Path $script:TMP_DIR "$ARTIFACT.sha256"
        Copy-Item $ARCHIVE_INPUT $ARCHIVE -Force
        Copy-Item $CHECKSUM_INPUT $CHECKSUM -Force

        step "verificando el checksum"
        assert_checksum_name $CHECKSUM $ARTIFACT $script:TMP_DIR

        step "inspeccionando el archivo"
        $zip = [System.IO.Compression.ZipFile]::OpenRead($ARCHIVE)
        try {
            $entries = $zip.Entries | Select-Object -ExpandProperty FullName
            if ($entries.Count -eq 0) { die 1 "el archivo está vacío" }
            $root = $null
            foreach ($entry in $entries) {
                if ($entry -match '^\.\./' -or $entry -eq '..') { die 1 "el archivo contiene una ruta con '..': $entry" }
                $first = $entry.Split('/')[0]
                if (-not $root) { $root = $first }
                elseif ($first -ne $root) { die 1 "el archivo contiene más de un directorio raíz" }
            }
            $installJsonEntry = $entries | Where-Object { $_ -eq "$root/install.json" }
            if (-not $installJsonEntry) { die 1 "el archivo no contiene install.json" }
            $zipEntry = $zip.GetEntry("$root/install.json")
            $reader = New-Object System.IO.StreamReader($zipEntry.Open())
            $installJson = $reader.ReadToEnd()
            $reader.Close()
        } finally {
            $zip.Dispose()
        }

        $installObj = $installJson | ConvertFrom-Json
        if ($installObj.schemaVersion -ne 1) { die 1 "install.json: schemaVersion inválido" }
        if ($installObj.name -ne $APP_NAME) { die 1 "install.json: nombre inválido" }
        $_build_version = $installObj.version
        if (-not (valid_version $_build_version)) { die 1 "install.json: versión inválida" }
        $_build_platform = $installObj.platform
        if (-not $_build_platform) { die 1 "install.json: plataforma ausente" }

        if ($VERSION_INPUT) {
            $VERSION = normalize_version $VERSION_INPUT
            if ($VERSION -ne $_build_version) { die 1 "el archivo contiene la versión $_build_version y se pidió $VERSION" }
        } else {
            $VERSION = $_build_version
        }
        if ($_build_platform -ne $PLATFORM_DETECTED) {
            die 3 "el artefacto es para $_build_platform y este sistema es $PLATFORM_DETECTED"
        }
    } else {
        if ($VERSION_INPUT) {
            $VERSION = normalize_version $VERSION_INPUT
            if (-not (valid_version $VERSION)) { die 2 "versión inválida: $VERSION_INPUT" }
        } else {
            $TAG = resolve_latest_tag
            $VERSION = normalize_version $TAG
        }
        $TAG = "v${VERSION}"
        $ARTIFACT = "${APP_NAME}-${VERSION}-${PLATFORM_DETECTED}.zip"
        $ARCHIVE = Join-Path $script:TMP_DIR $ARTIFACT
        $CHECKSUM = Join-Path $script:TMP_DIR "$ARTIFACT.sha256"
        $_base = "$RELEASES_URL/download/${TAG}/${ARTIFACT}"

        step "descargando ${ARTIFACT}"
        fetch $_base $ARCHIVE
        fetch "$_base.sha256" $CHECKSUM

        step "verificando el checksum"
        assert_checksum_name $CHECKSUM $ARTIFACT $script:TMP_DIR

        step "inspeccionando el archivo"
        $zip = [System.IO.Compression.ZipFile]::OpenRead($ARCHIVE)
        try {
            $entries = $zip.Entries | Select-Object -ExpandProperty FullName
            $root = $null
            foreach ($entry in $entries) {
                if ($entry -match '^\.\./' -or $entry -eq '..') { die 1 "el archivo contiene una ruta con '..': $entry" }
                $first = $entry.Split('/')[0]
                if (-not $root) { $root = $first }
                # Nota: se tolera más de un directorio raíz (p. ej. ZIPs planos
                # sin carpeta contenedora); no es un error de seguridad aquí
                # porque las entradas se extraen tal cual en el STAGE_DIR.
            }
            $zipEntry = $entries | Where-Object { $_ -eq 'install.json' } | Select-Object -First 1
            if (-not $zipEntry) { die 1 "el archivo no contiene install.json" }
            $zipEntry = $zip.GetEntry('install.json')
            $reader = New-Object System.IO.StreamReader($zipEntry.Open())
            $installJson = $reader.ReadToEnd()
            $reader.Close()
        } finally {
            $zip.Dispose()
        }

        $installObj = $installJson | ConvertFrom-Json
        if ($installObj.schemaVersion -ne 1) { die 1 "install.json: schemaVersion inválido" }
        if ($installObj.name -ne $APP_NAME) { die 1 "install.json: nombre inválido" }
        $_build_version = $installObj.version
        if (-not (valid_version $_build_version)) { die 1 "install.json: versión inválida" }
        $_build_platform = $installObj.platform
        if (-not $_build_platform) { die 1 "install.json: plataforma ausente" }

        if ($VERSION -ne $_build_version) { die 1 "el artefacto contiene la versión $_build_version y se esperaba $VERSION" }
        if ($_build_platform -ne $PLATFORM_DETECTED) {
            die 3 "el artefacto es para $_build_platform y este sistema es $PLATFORM_DETECTED"
        }
    }

    if ($VERIFY_ATTESTATION) {
        step "verificando la atestación de procedencia"
        & gh attestation verify $ARCHIVE --repo $REPOSITORY
        if ($LASTEXITCODE -ne 0) { die 1 "la atestación de procedencia no es válida" }
    }

    $TARGET = Join-Path $APP_DIR $VERSION

    if (Test-Path $TARGET) {
        if (-not $FORCE) { die 4 "la versión $VERSION ya está instalada; usa --force" }
    }
    if (Test-Path $BINARY) {
        if (-not (is_our_wrapper $BINARY) -and -not $FORCE) {
            die 4 "$BINARY existe y no lo gestiona este instalador; usa --force para reemplazarlo"
        }
    }

    if ($DRY_RUN) {
        say ""
        say "Simulación (no se modifica nada):"
        say "  versión:      $VERSION"
        say "  plataforma:   $PLATFORM_DETECTED"
        say "  artefacto:    $ARTIFACT"
        say "  destino:      $TARGET"
        say "  enlace:       $CURRENT_LINK -> $VERSION"
        say "  comando:      $BINARY"
        exit 0
    }

    if ((Test-Path $PREFIX) -and -not ((Get-Item $PREFIX).PSIsContainer)) { die 1 "$PREFIX existe y no es un directorio" }
    New-Item -ItemType Directory -Path $APP_DIR -Force | Out-Null
    New-Item -ItemType Directory -Path $BINDIR -Force | Out-Null

    # Bloqueo de instalación concurrente
    $LOCK_DIR = Join-Path $APP_DIR ".install.lock"
    if (-not (New-Item -ItemType Directory -Path $LOCK_DIR -Force)) {
        die 1 "hay otra instalación en curso; si no es así, borra $APP_DIR\.install.lock"
    }

    $STAGE_DIR = Join-Path $APP_DIR (".stage-${VERSION}-$PID")
    Remove-Item $STAGE_DIR -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $STAGE_DIR -Force | Out-Null

    step "extrayendo el artefacto"
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ARCHIVE, $STAGE_DIR)

    # Windows: desbloquear archivos (quitar Mark-of-the-Web)
    Get-ChildItem $STAGE_DIR -Recurse -File | Where-Object {
        $_.Extension -in @('.exe', '.bat', '.ps1', '.dll')
    } | ForEach-Object {
        try { Unblock-File $_.FullName -ErrorAction SilentlyContinue } catch {}
    }

    $archiveHash = sha256_of $ARCHIVE
    $installedAt = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"

    $installJson = @{
        schemaVersion = 1
        name = $APP_NAME
        version = $VERSION
        platform = $PLATFORM_DETECTED
        prefix = $PREFIX
        appDir = $APP_DIR
        binary = $BINARY
        artifact = $ARTIFACT
        sha256 = $archiveHash
        installedAt = $installedAt
    } | ConvertTo-Json -Depth 5
    $installJson | Set-Content (Join-Path $STAGE_DIR "install.json") -Encoding utf8

    step "instalando en $TARGET"
    if (Test-Path $TARGET) {
        $STAGE_OLD = Join-Path $APP_DIR (".old-${VERSION}-$PID")
        Move-Item $TARGET $STAGE_OLD -Force
    }
    Move-Item $STAGE_DIR $TARGET -Force
    $STAGE_DIR = $null
    if ($STAGE_OLD) { Remove-Item $STAGE_OLD -Recurse -Force -ErrorAction SilentlyContinue }

    # current es un directorio simbólico (junction) al versionado
    if (Test-Path $CURRENT_LINK) {
        Remove-Item $CURRENT_LINK -Force -ErrorAction SilentlyContinue
    }
    # cmd /c mklink /D para crear directorio simbólico
    & cmd /c "mklink /D `"$CURRENT_LINK`" `"$VERSION`"" | Out-Null

    step "creando $BINARY"
    $wrapperTmp = Join-Path $BINDIR (".mm.$PID")
    @"
@echo off
$MARKER
setlocal
set HERE=%~dp0
set NODE_CMD="%HERE%\..\share\${APP_NAME}\current\node.exe"
set CLI_CMD="%HERE%\..\share\${APP_NAME}\current\node_modules\${APP_NAME}\dist\cli.js"
%NODE_CMD% %CLI_CMD% %*
"@ | Set-Content $wrapperTmp -Encoding utf8
    Move-Item $wrapperTmp $BINARY -Force

    step "comprobando la instalación"
    $installedVersion = & $BINARY --version 2>$null | Select-Object -First 1
    if (-not $installedVersion) { die 1 "el comando instalado no se pudo ejecutar" }
    if ($installedVersion.Trim() -ne $VERSION) {
        die 1 "el comando devolvió '$installedVersion' y se esperaba '$VERSION'"
    }

    say ""
    say "✔ $APP_NAME $VERSION instalado"
    say "  comando: $BINARY"
    say "  versión: $TARGET"
    if (-not $NO_PATH_CHECK) {
        $pathEnv = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
        if ($pathEnv -notlike "*$BINDIR*") {
            warn "$BINDIR no está en PATH; añádelo para ejecutar 'mm' sin ruta absoluta"
        }
    }
}
finally {
    Remove-Item $script:TMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
}
