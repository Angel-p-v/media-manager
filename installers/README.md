# Instaladores de media-manager

Este directorio contiene los instaladores y desinstaladores de `media-manager-cli` (`mm`), organizados por sistema operativo.

## Estructura

```
installers/
├── linux/          # Instalador POSIX para Linux (x64, arm64)
│   ├── install.sh
│   └── uninstall.sh
├── windows/        # Instalador PowerShell para Windows (x64)
│   ├── install.ps1
│   └── uninstall.ps1
└── macos/          # macOS no tiene assets oficiales en v2.1
    └── README.md
```

## Uso rápido

### Linux

```bash
# Descargar y ejecutar
curl -fsSL https://raw.githubusercontent.com/Angel-p-v/media-manager/main/installers/linux/install.sh -o /tmp/mm-install.sh
sh /tmp/mm-install.sh
```

### Windows

```powershell
# Descargar y ejecutar
curl -fsSL https://raw.githubusercontent.com/Angel-p-v/media-manager/main/installers/windows/install.ps1 -o /tmp/mm-install.ps1
.\install.ps1
```

### macOS

**No hay assets oficiales de macOS en v2.1.** Consulta [`installers/macos/README.md`](./macos/README.md) para más información.

## Notas

- Los instaladores no requieren `sudo` ni `npm` instalado.
- Verifican checksums SHA-256 antes de instalar.
- La desinstalación conserva configuración y base de datos salvo que se use `--purge`.
