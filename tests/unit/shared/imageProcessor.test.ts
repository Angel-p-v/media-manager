import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, it, expect, afterEach } from 'vitest';

import {
  processImage,
  computePixelDimensions,
  CELL_PIXELS,
} from '../../../src/shared/imageProcessor.js';

const dir = mkdtempSync(join(tmpdir(), 'mm-imageproc-'));
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Crea un fichero PNG válido pequeño en `dir` y devuelve su ruta. */
async function writePng(name: string): Promise<string> {
  // Garantizar que el directorio exista (vitest puede reusar workers).
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  // Imagen PNG sólida de 8x8 px (rojo).
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toFile(path);
  return path;
}

describe('imageProcessor', () => {
  it('CELL_PIXELS es 16x32', () => {
    expect(CELL_PIXELS.width).toBe(16);
    expect(CELL_PIXELS.height).toBe(32);
  });

  it('computePixelDimensions convierte celdas a píxeles (16x32 por celda)', () => {
    expect(computePixelDimensions(1, 1)).toEqual({ widthPx: 16, heightPx: 32 });
    expect(computePixelDimensions(45, 32)).toEqual({ widthPx: 720, heightPx: 1024 });
    // Nunca devuelve cero ni negativos (mínimo una celda: 16x32 px).
    expect(computePixelDimensions(0, 0)).toEqual({ widthPx: 16, heightPx: 32 });
    expect(computePixelDimensions(-3, 5)).toEqual({ widthPx: 16, heightPx: 160 });
    expect(computePixelDimensions(-3, 5)).toEqual({ widthPx: 16, heightPx: 160 });
  });

  it('processImage redimensiona y convierte a PNG con las dimensiones pedidas', async () => {
    const pngPath = await writePng('fixture.png');
    const dimensions = { widthPx: 16, heightPx: 32 };

    const buffer = await processImage(pngPath, dimensions);

    expect(buffer).toBeInstanceOf(Buffer);
    // PNG magic bytes.
    expect(buffer.slice(0, 4).toString('hex')).toBe('89504e47');
    // Las dimensiones de salida coinciden con las solicitadas.
    const metadata = await sharp(buffer).metadata();
    expect(metadata.width).toBe(16);
    expect(metadata.height).toBe(32);
  });

  it('processImage respeta fit fill y kernel lanczos3', async () => {
    const pngPath = await writePng('fixture2.png');
    // Solicitar dimensiones muy distintas al original (8x8 -> 32x64) para forzar escalado.
    const buffer = await processImage(pngPath, { widthPx: 32, heightPx: 64 });

    const metadata = await sharp(buffer).metadata();
    expect(metadata.width).toBe(32);
    expect(metadata.height).toBe(64);
  });
});
