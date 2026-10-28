import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  encodeKittyGraphic,
  deleteKittyImage,
  deleteAllKittyImages,
  type KittyFrame,
} from '../../../src/shared/kittyProtocol.js';

const readFileMock = vi.fn();

beforeEach(() => {
  readFileMock.mockReset();
  readFileMock.mockReturnValue(Buffer.from('imagen-prueba'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Mock de node:fs para que createReadStream emita un Buffer conocido.
// Se usa un stream minimalista con on/emit para activar los listeners
// de readFileBuffer (data, end, error).
vi.mock('node:fs', () => ({
  createReadStream: () => {
    const listeners: Record<string, ((data: unknown) => void)[]> = {};
    const stream = {
      on: (event: string, listener: (data: unknown) => void) => {
        listeners[event] ??= [];
        listeners[event].push(listener);
        return stream;
      },
      emit: (event: string, data?: unknown) => {
        const ls = listeners[event] ?? [];
        ls.forEach((l) => l(data));
      },
    };
    setImmediate(() => {
      try {
        stream.emit('data', readFileMock());
        stream.emit('end');
      } catch (err) {
        stream.emit('error', err);
      }
    });
    return stream;
  },
}));

describe('kittyProtocol', () => {
  it('encodeKittyGraphic genera una secuencia válida para una imagen pequeña', async () => {
    // 10 bytes → Base64 de ~14 chars, cabe en un solo fragmento (< 4096).
    readFileMock.mockReturnValueOnce(Buffer.from('imagen-prueba'));

    const frames = await encodeKittyGraphic({
      imagePath: '/fake/poster.png',
      widthPx: 450,
      heightPx: 320,
      columns: 45,
      rows: 32,
      imageId: 42,
    });

    expect(frames.length).toBe(1);
    const frame = frames[0]!;
    expect(frame.isLast).toBe(true);

    const seq = frame.sequence;
    expect(seq.slice(0, 3)).toBe('\x1b_G');
    expect(seq.slice(-2)).toBe('\x1b\\');

    // Parámetros obligatorios del protocolo Kitty.
    expect(seq).toContain('a=T'); // última transmisión
    expect(seq).toContain('f=100'); // formato de imagen
    expect(seq).toContain('t=f'); // tipo: frame
    expect(seq).toContain('s=450'); // ancho en píxeles
    expect(seq).toContain('v=320'); // alto en píxeles
    expect(seq).toContain('c=45'); // columnas
    expect(seq).toContain('r=32'); // filas
    expect(seq).toContain('i=42'); // ID único
    expect(seq).toContain('z=1'); // Z-index por encima de Ink
    expect(seq).toContain('m=1'); // mensaje final
  });

  it('encodeKittyGraphic fragmenta en bloques de 4096 bytes para imágenes grandes', async () => {
    // 9000 bytes → Base64 de 12000 chars → 3 fragmentos de 4096.
    const bigBuffer = Buffer.alloc(9000, 0x41); // 'A' repetido
    readFileMock.mockReturnValueOnce(bigBuffer);

    const frames = await encodeKittyGraphic({
      imagePath: '/fake/big.png',
      widthPx: 450,
      heightPx: 320,
      columns: 45,
      rows: 32,
      imageId: 7,
    });

    expect(frames.length).toBe(3);

    // Los dos primeros no son el último.
    expect(frames[0]!.isLast).toBe(false);
    expect(frames[1]!.isLast).toBe(false);
    // El último sí.
    expect(frames[2]!.isLast).toBe(true);

    // t=f en fragmentos intermedios, t=T en el último.
    expect(frames[0]!.sequence).toContain('a=f');
    expect(frames[1]!.sequence).toContain('a=f');
    expect(frames[2]!.sequence).toContain('a=T');

    // m=0 en intermedios, m=1 en el último.
    expect(frames[0]!.sequence).toContain('m=0');
    expect(frames[1]!.sequence).toContain('m=0');
    expect(frames[2]!.sequence).toContain('m=1');

    // Cada fragmento es una secuencia válida.
    frames.forEach((frame: KittyFrame) => {
      expect(frame.sequence.slice(0, 3)).toBe('\x1b_G');
      expect(frame.sequence.slice(-2)).toBe('\x1b\\');
    });
  });

  it('encodeKittyGraphic rechaza si el fichero no se puede leer', async () => {
    readFileMock.mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file');
    });

    await expect(
      encodeKittyGraphic({
        imagePath: '/fake/inexistente.png',
        widthPx: 450,
        heightPx: 320,
        columns: 45,
        rows: 32,
        imageId: 1,
      }),
    ).rejects.toThrow('ENOENT');
  });

  it('deleteKittyImage genera la secuencia de borrado para un ID específico', () => {
    const seq = deleteKittyImage(42);
    expect(seq).toBe('\x1b_Ga=d,d=i,i=42\x1b\\');
    expect(seq.slice(0, 3)).toBe('\x1b_G');
    expect(seq.slice(-2)).toBe('\x1b\\');
  });

  it('deleteAllKittyImages genera la secuencia de borrado de todas las imágenes', () => {
    const seq = deleteAllKittyImages();
    expect(seq).toBe('\x1b_Ga=d;\x1b\\');
    expect(seq.slice(0, 3)).toBe('\x1b_G');
    expect(seq.slice(-2)).toBe('\x1b\\');
  });
});
