/** Píxeles que ocupa una celda de terminal (ancho x alto). */
export const CELL_PIXELS: { readonly width: number; readonly height: number } = {
  width: 16,
  height: 32,
} as const;

/** Dimensiones de una imagen en píxeles. */
export type ImageDimensions = {
  readonly widthPx: number;
  readonly heightPx: number;
};

/**
 * Calcula las dimensiones en píxeles a partir de celdas de terminal.
 *
 * Cada celda de la terminal se mapea a 16x32 píxeles, la relación
 * típica de un carácter (ancho x alto en píxeles) para renderizar
 * imágenes nativas con el protocolo Kitty.
 *
 * @param cols - Número de columnas (celdas) de ancho.
 * @param rows - Número de filas (celdas) de alto.
 * @returns Dimensiones en píxeles.
 */
export function computePixelDimensions(cols: number, rows: number): ImageDimensions {
  // El póster ocupa al menos una celda (16x32 px) aunque el terminal reporte
  // cero o valores negativos.
  return {
    widthPx: Math.max(CELL_PIXELS.width, Math.trunc(cols * CELL_PIXELS.width)),
    heightPx: Math.max(CELL_PIXELS.height, Math.trunc(rows * CELL_PIXELS.height)),
  };
}

/**
 * Procesa una imagen con Sharp: la redimensiona, la convierte a PNG y
 * devuelve el resultado como `Buffer`.
 *
 * Sharp se importa de forma perezosa dentro de esta función para que la
 * CLI headless (que nunca renderiza un póster) no cargue la librería nativa
 * ni emita advertencias de libvips en `stderr`.
 *
 * Se usa `fit: 'fill'` para que la imagen ocupe exactamente el área
 * indicada (estirada si es necesario) y `kernel: lanczos3` para máxima
 * nitidez al escalar, clave para que los pósters se vean bien en Ghostty.
 *
 * @param imagePath - Ruta local al fichero de imagen.
 * @param dimensions - Dimensiones objetivo en píxeles.
 * @returns Buffer con la imagen procesada en formato PNG.
 */
export async function processImage(
  imagePath: string,
  dimensions: ImageDimensions,
): Promise<Buffer> {
  const sharpModule = await import('sharp');
  const sharpFn = sharpModule.default;
  return sharpFn(imagePath)
    .resize(dimensions.widthPx, dimensions.heightPx, {
      fit: 'fill',
      kernel: sharpFn.kernel.lanczos3,
    })
    .toFormat('png')
    .toBuffer();
}
