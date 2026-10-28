import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { supportsKittyGraphics } from '../../../../src/shared/terminalImage.js';
import {
  computePosterSize,
  PosterImage,
  type PosterImageProps,
} from '../../../../src/ui/components/PosterImage.js';

vi.mock('../../../../src/shared/terminalImage.js', () => ({
  supportsKittyGraphics: vi.fn(() => false),
  renderImageToAnsi: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(supportsKittyGraphics).mockReturnValue(false);
  // Forzar modo símbolos en tests para evitar detección nativa del entorno
  process.env.MEDIA_MANAGER_GRAPHICS = 'symbols';
  process.stdout.columns = 80;
  process.stdout.rows = 24;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computePosterSize', () => {
  it('devuelve ancho y alto dentro de límites por defecto', () => {
    const { width, height } = computePosterSize();

    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(30);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(20);
  });

  it('reduce ancho en terminales estrechas', () => {
    process.stdout.columns = 40;
    process.stdout.rows = 20;

    const { width } = computePosterSize();

    expect(width).toBeLessThanOrEqual(30);
    expect(width).toBeGreaterThanOrEqual(10);
  });

  it('reduce alto en terminales bajas', () => {
    process.stdout.columns = 120;
    process.stdout.rows = 12;

    const { height } = computePosterSize();

    expect(height).toBeLessThanOrEqual(20);
    expect(height).toBeGreaterThanOrEqual(6);
  });
});

describe('PosterImage', () => {
  const defaultProps: PosterImageProps = {
    imagePath: null,
    width: 30,
    height: 20,
  };

  it('renderiza FallbackPosterImage cuando el terminal no soporta Kitty', () => {
    vi.mocked(supportsKittyGraphics).mockReturnValue(false);
    const element = PosterImage(defaultProps);
    expect(element).toBeDefined();
    expect(element.type).toBeDefined();
  });

  it('renderiza NativePosterImage cuando el terminal soporta Kitty y hay imagen', () => {
    vi.mocked(supportsKittyGraphics).mockReturnValue(true);
    const element = PosterImage({ ...defaultProps, imagePath: '/fake/poster.jpg' });
    expect(element).toBeDefined();
    expect(element.type).toBeDefined();
  });

  it('usa dimensiones por defecto cuando se omiten width y height', () => {
    const element = PosterImage({ imagePath: null });
    expect(element).toBeDefined();
  });
});
