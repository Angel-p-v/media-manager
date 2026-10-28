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
    // Buffer PNG con magic bytes válidos (89 50 4e 47 0d 0a 1a 0a) + datos.
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('imagen-prueba'),
    ]);
    readFileMock.mockReturnValueOnce(pngBuffer);

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
    expect(seq).toContain('f=100'); // formato PNG detectado por magic bytes
    expect(seq).toContain('t=d'); // tipo: datos inline (no fichero)
    expect(seq).toContain('s=450'); // ancho en píxeles
    expect(seq).toContain('v=320'); // alto en píxeles
    expect(seq).toContain('c=45'); // columnas
    expect(seq).toContain('r=32'); // filas
    expect(seq).toContain('i=42'); // ID único
    expect(seq).toContain('z=1'); // Z-index por encima de Ink
    expect(seq).toContain('q=2'); // no esperar respuesta del terminal
    expect(seq).toContain('m=0'); // mensaje final (único fragmento)

    // No debe contener t=f (solo para lectura desde fichero).
    expect(seq).not.toContain('t=f');

    // No debe contener a=f en el único fragmento (es a=T).
    expect(seq).not.toContain('a=f');
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

    // m=1 en intermedios (más datos siguen), m=0 en el último.
    expect(frames[0]!.sequence).toContain('m=1');
    expect(frames[1]!.sequence).toContain('m=1');
    expect(frames[2]!.sequence).toContain('m=0');

    // q=2 en todos los fragmentos (no esperar respuesta).
    frames.forEach((frame) => {
      expect(frame.sequence).toContain('q=2');
    });

    // Solo el primer fragmento lleva parámetros completos (s, v, c, r, i, f, t, a).
    expect(frames[0]!.sequence).toContain('s=450');
    expect(frames[0]!.sequence).toContain('v=320');
    expect(frames[0]!.sequence).toContain('c=45');
    expect(frames[0]!.sequence).toContain('r=32');
    expect(frames[0]!.sequence).toContain('i=7');
    expect(frames[0]!.sequence).toContain('a=T');
    expect(frames[0]!.sequence).toContain('t=d');

    // Los fragmentos siguientes solo llevan m y q, sin repetir parámetros.
    expect(frames[1]!.sequence).not.toContain('s=');
    expect(frames[1]!.sequence).not.toContain('v=');
    expect(frames[1]!.sequence).not.toContain('c=');
    expect(frames[1]!.sequence).not.toContain('r=');
    expect(frames[1]!.sequence).not.toContain('i=');
    expect(frames[1]!.sequence).not.toContain('a=');
    expect(frames[1]!.sequence).not.toContain('t=');
    expect(frames[1]!.sequence).not.toContain('f=');

    expect(frames[2]!.sequence).not.toContain('s=');
    expect(frames[2]!.sequence).not.toContain('v=');
    expect(frames[2]!.sequence).not.toContain('c=');
    expect(frames[2]!.sequence).not.toContain('r=');
    expect(frames[2]!.sequence).not.toContain('i=');
    expect(frames[2]!.sequence).not.toContain('a=');
    expect(frames[2]!.sequence).not.toContain('t=');
    expect(frames[2]!.sequence).not.toContain('f=');

    // No debe contener t=f en ningún fragmento.
    frames.forEach((frame) => {
      expect(frame.sequence).not.toContain('t=f');
    });

    // Cada fragmento es una secuencia válida.
    frames.forEach((frame: KittyFrame) => {
      expect(frame.sequence.slice(0, 3)).toBe('\x1b_G');
      expect(frame.sequence.slice(-2)).toBe('\x1b\\');
    });
  });

  it('encodeKittyGraphic devuelve array vacío si el fichero no se puede leer', async () => {
    readFileMock.mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file');
    });

    const result = await encodeKittyGraphic({
      imagePath: '/fake/inexistente.png',
      widthPx: 450,
      heightPx: 320,
      columns: 45,
      rows: 32,
      imageId: 1,
    });

    expect(result).toEqual([]);
  });

  it('encodeKittyGraphic no trunca nunca: envía todos los chunks', async () => {
    // 20000 bytes → Base64 de ~26667 chars → 7 fragmentos de 4096.
    const bigBuffer = Buffer.alloc(20000, 0x42); // 'B' repetido
    readFileMock.mockReturnValueOnce(bigBuffer);

    const frames = await encodeKittyGraphic({
      imagePath: '/fake/huge.png',
      widthPx: 450,
      heightPx: 320,
      columns: 45,
      rows: 32,
      imageId: 99,
    });

    // Debe enviar todos los 7 fragmentos, no truncar a maxFrames.
    expect(frames.length).toBe(7);
    expect(frames[6]!.isLast).toBe(true);
    expect(frames[0]!.isLast).toBe(false);
  });

  it('deleteKittyImage genera la secuencia de borrado para un ID específico', () => {
    const seq = deleteKittyImage(42);
    expect(seq).toContain('i=42');
    expect(seq).toContain('a=d');
    expect(seq.slice(0, 3)).toBe('\x1b_G');
    expect(seq.slice(-2)).toBe('\x1b\\');
  });

  it('deleteAllKittyImages genera la secuencia de borrado de todas las imágenes', () => {
    const seq = deleteAllKittyImages();
    expect(seq).toContain('a=d');
    expect(seq.slice(0, 3)).toBe('\x1b_G');
    expect(seq.slice(-2)).toBe('\x1b\\');
  });
});
