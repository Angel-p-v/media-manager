# Política de seguridad

`media-manager-cli` es una aplicación local: no expone un servidor ni envía la
biblioteca a Internet. Aun así, procesa rutas y nombres de ficheros del sistema y lanza
procesos externos, así que los fallos de seguridad se tratan con seriedad.

## Versiones soportadas

| Versión | Soporte de seguridad |
| ------- | -------------------- |
| 1.x     | Sí                   |
| < 1.0   | No                   |

## Cómo reportar una vulnerabilidad

**No abras una issue pública** para un problema de seguridad. Usa el canal privado de
GitHub Security Advisories:

1. Abre <https://github.com/Angel-p-v/media-manager/security/advisories/new>.
2. Describe el impacto, la versión afectada y los pasos mínimos para reproducirlo.
3. Incluye, si puedes, una propuesta de solución o un parche.

También puedes contactar con el mantenedor a través de su perfil de GitHub si el canal
privado no está disponible. No publiques detalles explotables hasta que exista una
versión corregida.

## Qué incluir

- Versión de `media-manager-cli` (`mm --version`) y sistema operativo.
- Configuración relevante, ocultando rutas o datos personales.
- Un caso de reproducción pequeño y determinista.
- Impacto esperado: lectura/escritura de ficheros fuera de la biblioteca, ejecución de
  comandos, denegación de servicio, fuga de información, etc.

## Alcance

Se consideran vulnerabilidades, entre otras:

- Inyección de comandos o argumentos al lanzar `mpv`/`vlc`.
- Escritura o lectura de ficheros fuera de las rutas configuradas.
- Ejecución de código a través de la configuración o del índice.
- Problemas de permisos en la base SQLite o en los ficheros temporales.
- Vulnerabilidades explotables en dependencias directas.

Quedan fuera del alcance los fallos que requieran acceso físico o privilegios de
administrador, y los ataques contra una biblioteca que el usuario ya haya marcado como
de confianza.

## Respuesta

El mantenedor acusará recibo y evaluará el impacto lo antes posible. Si el reporte es
válido, se preparará un parche, se publicará una versión corregida y se coordinará la
divulgación en un GitHub Security Advisory. Las versiones anteriores a la corregida no
recibirán parches salvo que el impacto lo justifique.
