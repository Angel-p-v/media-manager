import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'library');
const CLI = path.join(ROOT, 'dist', 'cli.js');

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

describe('mm (e2e, binario compilado)', () => {
  let workDir: string;
  let configPath: string;

  beforeAll(async () => {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });

    workDir = await mkdtemp(path.join(tmpdir(), 'mm-e2e-'));
    configPath = path.join(workDir, 'config.yaml');
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
        '',
      ].join('\n'),
      'utf8',
    );

    const indexed = run(['index', '--json']);
    expect(indexed.status, indexed.stderr).toBe(0);
  }, 60_000);

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function run(args: string[]): RunResult {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, NO_COLOR: '1', MM_CONFIG: configPath },
    });

    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  it('muestra la versión y termina con código 0', () => {
    const result = run(['--version']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('la ayuda enumera todos los subcomandos', () => {
    const result = run(['--help']);

    expect(result.status).toBe(0);
    for (const command of ['index', 'list', 'search', 'show', 'db', 'config']) {
      expect(result.stdout).toContain(command);
    }
    expect(result.stdout).toContain('Códigos de salida');
  });

  it('el subcomando help también termina con código 0', () => {
    const result = run(['help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: mm');
  });

  it('devuelve 2 ante un comando desconocido', () => {
    const result = run(['no-existe']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command 'no-existe'");
  });

  it('devuelve 2 si falta un argumento obligatorio', () => {
    const result = run(['search']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required argument 'consulta'");
  });

  it('devuelve 2 si una opción tiene un valor inválido', () => {
    const result = run(['search', 'sever', '--type', 'libros']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Tipo no válido');
  });

  it('indexa el fixture y emite estadísticas JSON', () => {
    const result = run(['index', '--json']);

    expect(result.status).toBe(0);
    const stats = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(stats).toMatchObject({
      dryRun: false,
      filesSeen: 8,
      filesAdded: 0,
      filesUnchanged: 8,
      mediaAdded: 0,
    });
    expect(result.stdout).not.toContain('\u001b[');
  });

  it('lista y busca títulos contra el índice real', () => {
    const list = run(['list', '--json']);
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout)).toMatchObject({ total: 5, count: 5 });

    const search = run(['search', 'sever', '--json']);
    expect(search.status).toBe(0);
    expect(JSON.parse(search.stdout)).toMatchObject({
      query: 'sever',
      count: 1,
      results: [{ title: 'Severance', year: 2022 }],
    });
  });

  it('muestra el detalle de un título y de sus ficheros', () => {
    const result = run(['show', 'severance', '--json']);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      title: 'Severance',
      type: 'series',
      fileCount: 2,
      files: [
        { season: 1, episode: 1 },
        { season: 1, episode: 2 },
      ],
    });
  });

  it('resume el contenido del índice', () => {
    const result = run(['db', 'stats', '--json']);

    expect(result.status).toBe(0);
    const stats = JSON.parse(result.stdout) as {
      media: { total: number };
      files: number;
      lastRun: { status: string };
    };
    expect(stats).toMatchObject({
      media: { total: 5 },
      files: 8,
      lastRun: { status: 'completed' },
    });
  });

  it('devuelve 1 y un mensaje accionable si el título no existe', () => {
    const result = run(['show', 'no-existe']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No hay ningún título que coincida');
  });
});
