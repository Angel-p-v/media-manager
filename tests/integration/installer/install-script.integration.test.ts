import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_NAME,
  INSTALL_SCRIPT,
  baseEnv,
  createArtifact,
  createArtifactWithTraversal,
  installArgs,
  runScript,
  writeFakeUname,
} from './helpers.js';

import type { Artifact } from './helpers.js';

const describeLinux = process.platform === 'linux' ? describe : describe.skip;

describeLinux('install.sh (integración)', () => {
  let workDir: string;
  let home: string;
  let prefix: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'mm-installer-'));
    home = path.join(workDir, 'home');
    prefix = path.join(workDir, 'prefix con espacios');
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function artifact(options: { platform?: string; version?: string } = {}): Artifact {
    return createArtifact({ root: workDir, ...options });
  }

  it('instala un artefacto local, crea el wrapper y resuelve current', () => {
    const bundle = artifact();

    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const wrapper = path.join(prefix, 'bin', 'mm');
    const version = spawnSync(wrapper, ['--version'], { encoding: 'utf8' });
    expect(version.stdout.trim()).toBe(bundle.version);
    expect(readlinkSync(path.join(prefix, 'share', APP_NAME, 'current'))).toBe(bundle.version);

    const manifest = JSON.parse(
      readFileSync(path.join(prefix, 'share', APP_NAME, bundle.version, 'install.json'), 'utf8'),
    ) as Record<string, string>;
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      name: APP_NAME,
      version: bundle.version,
      platform: bundle.platform,
      prefix,
      binary: wrapper,
      artifact: `${bundle.name}.tar.gz`,
    });
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(path.join(prefix, 'share', APP_NAME, '.install.lock'))).toBe(false);
  });

  it('instala sin --sha256 si existe el checksum hermano', () => {
    const bundle = artifact();
    const args = ['--file', bundle.archive, '--prefix', prefix, '--no-path-check'];

    const result = runScript(INSTALL_SCRIPT, args, baseEnv(home));

    expect(result.status).toBe(0);
  });

  it('se niega a reinstalar sin --force y acepta --force', () => {
    const bundle = artifact();
    expect(runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home)).status).toBe(0);

    const repeated = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));
    expect(repeated.status).toBe(4);
    expect(repeated.stderr).toContain('--force');

    const forced = runScript(
      INSTALL_SCRIPT,
      installArgs(bundle, prefix, ['--force']),
      baseEnv(home),
    );
    expect(forced.status).toBe(0);
  });

  it('aborta si el checksum no coincide y no deja instalación', () => {
    const bundle = artifact();
    writeFileSync(bundle.checksum, `${'0'.repeat(64)}  ${bundle.name}.tar.gz\n`);

    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('checksum');
    expect(existsSync(path.join(prefix, 'share', APP_NAME))).toBe(false);
  });

  it('rechaza un checksum que pertenece a otro archivo', () => {
    const bundle = artifact();
    writeFileSync(bundle.checksum, `${'a'.repeat(64)}  otro.tar.gz\n`);

    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('otro.tar.gz');
  });

  it('rechaza un artefacto con rutas ../ antes de extraerlo', () => {
    const bundle = createArtifactWithTraversal(workDir);

    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'..'");
    expect(existsSync(prefix)).toBe(false);
  });

  it('aborta si el artefacto es de otra plataforma', () => {
    const otherPlatform = process.arch === 'arm64' ? 'linux-x64' : 'linux-arm64';
    const bundle = artifact({ platform: otherPlatform });

    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));

    expect(result.status).toBe(3);
    expect(result.stderr).toContain(otherPlatform);
  });

  it('aborta con código 3 en un sistema no soportado', () => {
    const bundle = artifact();
    const binDir = writeFakeUname(workDir, 'SunOS');
    const env = baseEnv(home);
    env.PATH = `${binDir}${path.delimiter}${env.PATH ?? ''}`;

    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), env);

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('SunOS');
  });

  it('rechaza una versión distinta a la del artefacto', () => {
    const bundle = artifact();

    const result = runScript(
      INSTALL_SCRIPT,
      installArgs(bundle, prefix, ['--version', 'v9.9.9']),
      baseEnv(home),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('9.9.9');
  });

  it('--dry-run no modifica el sistema de archivos', () => {
    const bundle = artifact();

    const result = runScript(
      INSTALL_SCRIPT,
      installArgs(bundle, prefix, ['--dry-run']),
      baseEnv(home),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Simulación');
    expect(existsSync(prefix)).toBe(false);
  });

  it('respeta --bindir y el wrapper funciona desde otro directorio', () => {
    const bundle = artifact();
    const bindir = path.join(workDir, 'bin personalizado');
    const args = installArgs(bundle, prefix, ['--bindir', bindir]);

    expect(runScript(INSTALL_SCRIPT, args, baseEnv(home)).status).toBe(0);
    const version = spawnSync(path.join(bindir, 'mm'), ['--version'], {
      cwd: tmpdir(),
      encoding: 'utf8',
    });
    expect(version.stdout.trim()).toBe(bundle.version);
  });

  it('instala en ~/.local por defecto sin corromper el prefijo', () => {
    const bundle = artifact();
    const args = ['--file', bundle.archive, '--sha256', bundle.checksum, '--no-path-check'];

    const result = runScript(INSTALL_SCRIPT, args, baseEnv(home));

    expect(result.status).toBe(0);
    const wrapper = path.join(home, '.local', 'bin', 'mm');
    expect(spawnSync(wrapper, ['--version'], { encoding: 'utf8' }).stdout.trim()).toBe(
      bundle.version,
    );
    // Un `~` sin escapar en el patrón de `case` expandía el prefijo a `<home>home/...`.
    expect(existsSync(`${home}${home.slice(2)}`)).toBe(false);
  });

  it('expande un --prefix literal ~/ dentro de HOME', () => {
    const bundle = artifact();
    const target = path.join(home, 'prefijo personalizado');
    const args = installArgs(bundle, '~/prefijo personalizado');

    const result = runScript(INSTALL_SCRIPT, args, baseEnv(home));

    expect(result.status).toBe(0);
    expect(existsSync(path.join(target, 'bin', 'mm'))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(path.join(target, 'share', APP_NAME, bundle.version, 'install.json'), 'utf8'),
    ) as Record<string, string>;
    expect(manifest.prefix).toBe(target);
    expect(existsSync(`${home}${home.slice(2)}`)).toBe(false);
  });

  it('expande un --bindir literal ~/ dentro de HOME', () => {
    const bundle = artifact();
    const args = installArgs(bundle, prefix, ['--bindir', '~/bin personalizado']);

    const result = runScript(INSTALL_SCRIPT, args, baseEnv(home));

    expect(result.status).toBe(0);
    expect(existsSync(path.join(home, 'bin personalizado', 'mm'))).toBe(true);
  });

  it('falla si la atestación de procedencia no es válida', () => {
    const bundle = artifact();
    const fakeBin = path.join(workDir, 'gh-fallido');
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(path.join(fakeBin, 'gh'), '#!/bin/sh\nexit 1\n');
    chmodSync(path.join(fakeBin, 'gh'), 0o755);
    const env = baseEnv(home);
    env.PATH = `${fakeBin}${path.delimiter}${env.PATH ?? ''}`;

    const result = runScript(
      INSTALL_SCRIPT,
      installArgs(bundle, prefix, ['--verify-attestation']),
      env,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('atestación');
    expect(existsSync(prefix)).toBe(false);
  });

  it('rechaza --prefix / y un checksum ausente', () => {
    const bundle = artifact();
    const root = runScript(INSTALL_SCRIPT, installArgs(bundle, '/'), baseEnv(home));
    expect(root.status).toBe(2);

    const missing = runScript(
      INSTALL_SCRIPT,
      installArgs(bundle, prefix).map((value) =>
        value === bundle.checksum ? path.join(workDir, 'no-existe.sha256') : value,
      ),
      baseEnv(home),
    );
    expect(missing.status).toBe(2);
  });
});
