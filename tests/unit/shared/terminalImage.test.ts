import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { renderImageToAnsi, isChafaAvailable } from '../../../src/shared/terminalImage.js';

const execFileMock =
  vi.fn<
    (
      file: string,
      args: string[],
      options: { encoding: string },
    ) => { stdout: string; stderr: string }
  >();
const accessMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  execFileMock.mockReset();
  accessMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Mock de node:child_process - execFile llama al callback con el resultado de execFileMock
vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    _args: unknown[],
    _options: unknown,
    callback: (err: unknown, stdout: string, stderr: string) => void,
  ): void => {
    const result = execFileMock(_file, _args as string[], _options as { encoding: string });
    callback(null, result?.stdout ?? 'chafa output here', result?.stderr ?? '');
  },
}));

// Mock de node:fs/promises para que access siempre tenga éxito
vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => {
    accessMock(...args);
    return Promise.resolve();
  },
}));

describe('terminalImage', () => {
  it('isChafaAvailable devuelve true cuando execFile tiene éxito', async () => {
    execFileMock.mockReturnValueOnce({ stdout: '1.2.0', stderr: '' });
    const result = await isChafaAvailable();
    expect(result).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith('chafa', ['--version'], { encoding: 'utf-8' });
  });

  it('isChafaAvailable devuelve false cuando execFile falla', async () => {
    execFileMock.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    const result = await isChafaAvailable();
    expect(result).toBe(false);
  });

  it('renderImageToAnsi devuelve la salida de chafa', async () => {
    execFileMock.mockReturnValueOnce({ stdout: 'line1\nline2', stderr: '' });
    const result = await renderImageToAnsi('/fake/path/poster.png');
    expect(result).toBe('line1\nline2');
    const [file, cmdArgs] = execFileMock.mock.calls[execFileMock.mock.calls.length - 1]!;
    expect(file).toBe('chafa');
    expect(cmdArgs).toContain('/fake/path/poster.png');
  });

  it('renderImageToAnsi devuelve cadena vacía si chafa falla', async () => {
    execFileMock.mockImplementationOnce(() => {
      throw new Error('error');
    });
    const result = await renderImageToAnsi('/fake/path/poster.png');
    expect(result).toBe('');
  });

  it('renderImageToAnsi solo pasa la ruta de la imagen a chafa', async () => {
    execFileMock.mockReturnValueOnce({ stdout: 'arte', stderr: '' });
    await renderImageToAnsi('/fake/path/poster.png', { width: 40, height: 20 });
    const [, cmdArgs] = execFileMock.mock.calls[execFileMock.mock.calls.length - 1]!;
    expect(cmdArgs).toEqual(['/fake/path/poster.png']);
  });
});
