# Publicación y release

Este documento describe cómo se publica `media-manager-cli` y qué queda pendiente
cuando no hay credenciales de npm. La publicación **no** se hace desde una rama de
desarrollo ni desde un portátil sin revisar la CI.

## Requisitos

- Cuenta de npm con permiso de publicación sobre `media-manager-cli`.
- Secreto `NPM_TOKEN` en el repositorio de GitHub: un _automation token_ de npm con
  permiso de publicación. No se guarda en el repositorio ni en `~/.npmrc` del proyecto.
- `id-token: write` en el workflow para generar la atestación de procedencia.
- CI verde en Node 22, 24 y 26.

El nombre `media-manager` ya estaba ocupado en npm, por eso el paquete se llama
`media-manager-cli`; el binario instalado sigue siendo `mm`. La decisión completa está en
el [ADR 0008](../adr/0008-publicacion-y-distribucion.md).

```bash
gh secret set NPM_TOKEN
# pega el token cuando se solicite
```

## Preparar y verificar el tarball

```bash
npm ci
npm run verify
npm run build
npm run smoke     # npm pack → instalación limpia → --version/config/index --dry-run
```

`npm run smoke` usa el tarball real, no el `dist/` del repositorio. Si falta un fichero
en `files` o una dependencia de producción, el smoke falla.

También se puede inspeccionar el contenido antes de publicar:

```bash
npm pack --dry-run
```

## Primera release (`v1.0.0`)

El repositorio parte de `1.0.0` en `package.json`, `package-lock.json`,
`CHANGELOG.md`, `release-please-config.json` y `.release-please-manifest.json`.

1. Añade el secreto `NPM_TOKEN` como se indica arriba.
2. Comprueba que `main` está limpio y con la CI verde.
3. Crea el tag anotado y súbelo:

   ```bash
   git tag -a v1.0.0 -m "media-manager-cli v1.0.0"
   git push origin v1.0.0
   ```

4. Publica un GitHub Release asociado al tag. El evento `release: published` dispara
   `.github/workflows/release.yml`, que delega en `publish.yml`: ejecuta `verify`, el smoke
   del tarball y `npm publish --provenance --access public`.

   ```bash
   gh release create v1.0.0 --title "v1.0.0" --notes-file CHANGELOG.md
   ```

5. Verifica la publicación:

   ```bash
   npm view media-manager-cli version
   npm install --global media-manager-cli
   mm --version
   ```

   La ficha de npm debe mostrar la procedencia (provenance) y el repositorio correcto.

Si el workflow falla por falta de token, no crees otro tag: corrige el secreto y vuelve
a ejecutar el workflow desde la release. Un tag ya publicado no debe moverse.

## Releases siguientes con release-please

`release-please` observa los pushes a `main` y abre una PR de release con el siguiente
`CHANGELOG.md` y el bump de versión. Al mergear esa PR, release-please crea el tag y el
GitHub Release. Ese mismo workflow invoca `publish.yml` como workflow reutilizable cuando
`release_created` es verdadero; no depende de que el evento `release` dispare otro
workflow, porque los eventos creados con `GITHUB_TOKEN` no lo hacen.

- Configuración:
  [`release-please-config.json`](https://github.com/Angel-p-v/media-manager/blob/main/release-please-config.json).
- Versión de referencia:
  [`.release-please-manifest.json`](https://github.com/Angel-p-v/media-manager/blob/main/.release-please-manifest.json).
- Los commits deben ser convencionales (`feat`, `fix`, `perf`, `deps`, …). Un `chore` no
  genera release.
- No edites a mano el `CHANGELOG.md` salvo para la release inicial o una corrección
  editorial; release-please lo reescribe.

La release inicial se prepara a mano para fijar `1.0.0`; después release-please toma el
relevo.

## Distribución standalone opcional

Para generar una carpeta portable con Node incluido (misma plataforma y arquitectura):

```bash
npm run standalone
```

El resultado queda en `build/standalone/media-manager-cli-<versión>-<plataforma>/` y en
un `.tar.gz` hermano. Incluye el runtime de Node y `better-sqlite3`, por lo que no es un
único binario: el addon nativo debe seguir en disco. No se publica en npm; se adjunta a
la GitHub Release si se necesita una alternativa sin Node instalado.

## Si algo sale mal

- **Falta el token o no tiene permisos:** el workflow falla antes de publicar. Corrige el
  secreto y relanza el workflow.
- **El tarball no contiene `dist/`:** ejecuta `npm run build` o revisa `prepack`.
- **La versión ya existe en npm:** npm no permite republicar una versión. Prepara un
  patch (`fix: …`) con release-please; no reutilices el tag.
- **Un tag apunta a un commit incorrecto:** no lo muevas si ya hay una release publicada.
  Crea una versión nueva.
- **Hay que retirar una versión:** usa `npm deprecate media-manager-cli@<versión> "…"`
  y publica una corrección. El borrado solo es posible durante las primeras 72 horas y
  rompe instalaciones existentes.
