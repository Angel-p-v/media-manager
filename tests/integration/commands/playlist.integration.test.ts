import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { runIndexCommand } from '../../../src/commands/index.js';
import { runPlaylistCommand } from '../../../src/commands/playlist.js';

const FIXTURES = fileURLToPath(new URL('../../fixtures/library', import.meta.url));

describe('comando mm playlist (integración)', () => {
  let workDir: string;
  let configPath: string;
  let outputPath: string;
  let spy: MockInstance<typeof console.log>;
  let output: string[];

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'mm-playlist-'));
    configPath = path.join(workDir, 'config.yaml');
    outputPath = path.join(workDir, 'player-args.txt');

    const scriptPath = path.join(workDir, 'fake player.sh');
    await writeFile(scriptPath, '#!/bin/sh\nprintf "%s\\n" "$@" >> "$MM_FAKE_OUTPUT"\n', 'utf8');
    await chmod(scriptPath, 0o755);

    const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
    await writeFile(
      configPath,
      [
        'library:',
        '  roots:',
        `    - path: ${quote(path.join(FIXTURES, 'series'))}`,
        '      type: series',
        `    - path: ${quote(path.join(FIXTURES, 'anime'))}`,
        '      type: anime',
        `    - path: ${quote(path.join(FIXTURES, 'movies'))}`,
        '      type: movie',
        'database:',
        `  path: ${quote(path.join(workDir, 'library.db'))}`,
        'player:',
        '  default: fake',
        '  onLaunch: foreground',
        '  players:',
        '    fake:',
        `      command: ${quote(scriptPath)}`,
        "      args: ['--flag', '{file}']",
        '      env:',
        `        MM_FAKE_OUTPUT: ${quote(outputPath)}`,
        '',
      ].join('\n'),
      'utf8',
    );

    output = [];
    spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map((arg) => String(arg)).join(' '));
    });

    await runIndexCommand({ config: configPath, json: true });
    output.length = 0;
  });

  afterEach(async () => {
    spy.mockRestore();
    await rm(workDir, { recursive: true, force: true });
  });

  async function readExecutedFiles(): Promise<string[]> {
    const content = await readFile(outputPath, 'utf8');
    return content.trimEnd().split('\n').filter(Boolean);
  }

  it('reproduce varios títulos en secuencia (modo foreground)', async () => {
    await runPlaylistCommand(['severance', 'frieren'], {
      config: configPath,
      json: true,
    });

    const args = await readExecutedFiles();
    // Debe haberse ejecutado Severance S01E01 y luego Frieren S01E01
    expect(args.length).toBe(4);
    expect(args[0]).toBe('--flag');
    expect(args[1]).toContain('Severance.S01E01');
    expect(args[2]).toBe('--flag');
    expect(args[3]).toContain('Frieren');
  });

  it('con --dry-run no lanza ningún proceso', async () => {
    await runPlaylistCommand(['severance', 'frieren'], {
      config: configPath,
      dryRun: true,
      json: true,
    });

    const payload = JSON.parse(output.join('\n')) as {
      total: number;
      items: { media: { title: string }; file: { filePath: string } }[];
    };
    expect(payload.total).toBe(2);
    expect(existsSync(outputPath)).toBe(false);
  });

  it('reporta completados y fallidos cuando uno no existe', async () => {
    await runPlaylistCommand(['severance', 'no-existe-esto'], {
      config: configPath,
      json: true,
    });

    const payload = JSON.parse(output.join('\n')) as {
      total: number;
      completed: number;
      failed: number;
      executed: { media: { title: string }; error: string | null }[];
    };
    expect(payload.total).toBe(2);
    expect(payload.completed).toBe(1);
    expect(payload.failed).toBe(1);
    expect(payload.executed[0]!.error).toBeNull();
    expect(payload.executed[1]!.error).toBeTruthy();
  });

  it('sin argumentos sale con código 2', async () => {
    const originalExit = process.exitCode;
    process.exitCode = undefined;
    await runPlaylistCommand([], { config: configPath });
    expect(process.exitCode).toBe(2);
    process.exitCode = originalExit;
  });
});
