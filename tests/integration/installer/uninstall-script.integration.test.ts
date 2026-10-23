import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_NAME,
  INSTALL_SCRIPT,
  UNINSTALL_SCRIPT,
  baseEnv,
  createArtifact,
  installArgs,
  runScript,
} from './helpers.js';

const describeLinux = process.platform === 'linux' ? describe : describe.skip;

describeLinux('uninstall.sh (integración)', () => {
  let workDir: string;
  let home: string;
  let prefix: string;
  let appDir: string;
  let wrapper: string;
  let configDir: string;
  let dataDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'mm-uninstaller-'));
    home = path.join(workDir, 'home');
    prefix = path.join(workDir, 'prefix con espacios');
    appDir = path.join(prefix, 'share', APP_NAME);
    wrapper = path.join(prefix, 'bin', 'mm');
    configDir = path.join(home, '.config', 'media-manager');
    dataDir = path.join(home, '.local', 'share', 'media-manager');
    mkdirSync(configDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.yaml'), 'version: 1\n');
    writeFileSync(path.join(dataDir, 'library.db'), 'datos\n');

    const bundle = createArtifact({ root: workDir });
    const result = runScript(INSTALL_SCRIPT, installArgs(bundle, prefix), baseEnv(home));
    if (result.status !== 0) {
      throw new Error(`No se pudo preparar la instalación: ${result.stderr}`);
    }
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function uninstall(args: string[] = []) {
    return runScript(UNINSTALL_SCRIPT, ['--prefix', prefix, ...args], baseEnv(home));
  }

  it('elimina la aplicación y el wrapper, pero conserva los datos', () => {
    const result = uninstall(['--yes']);

    expect(result.status).toBe(0);
    expect(existsSync(appDir)).toBe(false);
    expect(existsSync(wrapper)).toBe(false);
    expect(existsSync(path.join(configDir, 'config.yaml'))).toBe(true);
    expect(existsSync(path.join(dataDir, 'library.db'))).toBe(true);
  });

  it('--purge elimina también la configuración y la base de datos', () => {
    const result = uninstall(['--purge', '--yes']);

    expect(result.status).toBe(0);
    expect(existsSync(appDir)).toBe(false);
    expect(existsSync(configDir)).toBe(false);
    expect(existsSync(dataDir)).toBe(false);
  });

  it('--purge --dry-run no borra nada', () => {
    const result = uninstall(['--purge', '--dry-run', '--yes']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Simulación');
    expect(existsSync(appDir)).toBe(true);
    expect(existsSync(wrapper)).toBe(true);
    expect(existsSync(configDir)).toBe(true);
    expect(existsSync(dataDir)).toBe(true);
  });

  it('rechaza --prefix con HOME y con la raíz del sistema', () => {
    expect(runScript(UNINSTALL_SCRIPT, ['--prefix', home, '--yes'], baseEnv(home)).status).toBe(2);
    expect(runScript(UNINSTALL_SCRIPT, ['--prefix', '/', '--yes'], baseEnv(home)).status).toBe(2);
  });

  it('no elimina un wrapper ajeno sin la marca del instalador', () => {
    writeFileSync(wrapper, '#!/bin/sh\necho ajeno\n');

    const result = uninstall(['--yes']);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('no lo gestiona');
    expect(existsSync(wrapper)).toBe(true);
    expect(existsSync(appDir)).toBe(false);
  });

  it('ignora un appDir manipulado en install.json', () => {
    const victim = path.join(workDir, 'victima');
    mkdirSync(victim, { recursive: true });
    writeFileSync(path.join(victim, 'importante.txt'), 'no borrar\n');
    const manifest = path.join(appDir, '1.0.0', 'install.json');
    // El manifiesto lo escribe el instalador; se manipula a propósito.
    const raw = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, string>;
    writeFileSync(manifest, `${JSON.stringify({ ...raw, appDir: victim }, null, 2)}\n`);

    const result = uninstall(['--yes']);

    expect(result.status).toBe(0);
    expect(existsSync(path.join(victim, 'importante.txt'))).toBe(true);
    expect(existsSync(appDir)).toBe(false);
  });

  it('se niega a desinstalar si current apunta fuera de la instalación', () => {
    const victim = path.join(workDir, 'victima');
    mkdirSync(victim, { recursive: true });
    rmSync(path.join(appDir, 'current'));
    symlinkSync(victim, path.join(appDir, 'current'));

    const result = uninstall(['--yes']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fuera de');
    expect(existsSync(appDir)).toBe(true);
  });

  it('desinstala ~/.local por defecto sin corromper el prefijo', () => {
    const bundle = createArtifact({ root: path.join(workDir, 'default-home') });
    const defaultPrefix = path.join(home, '.local');
    const installed = runScript(
      INSTALL_SCRIPT,
      [
        '--file',
        bundle.archive,
        '--sha256',
        bundle.checksum,
        '--prefix',
        '~/.local',
        '--no-path-check',
      ],
      baseEnv(home),
    );
    expect(installed.status).toBe(0);

    const result = runScript(UNINSTALL_SCRIPT, ['--yes'], baseEnv(home));

    expect(result.status).toBe(0);
    expect(existsSync(path.join(defaultPrefix, 'bin', 'mm'))).toBe(false);
    expect(existsSync(path.join(defaultPrefix, 'share', APP_NAME))).toBe(false);
    expect(existsSync(`${home}${home.slice(2)}`)).toBe(false);
  });

  it('expande un --prefix literal ~/ dentro de HOME', () => {
    const bundle = createArtifact({ root: path.join(workDir, 'tilde-home') });
    const target = path.join(home, 'instalacion');
    const installed = runScript(
      INSTALL_SCRIPT,
      installArgs(bundle, '~/instalacion'),
      baseEnv(home),
    );
    expect(installed.status).toBe(0);

    const result = runScript(
      UNINSTALL_SCRIPT,
      ['--prefix', '~/instalacion', '--yes'],
      baseEnv(home),
    );

    expect(result.status).toBe(0);
    expect(existsSync(path.join(target, 'share', APP_NAME))).toBe(false);
    expect(existsSync(path.join(target, 'bin', 'mm'))).toBe(false);
  });

  it('informa y sale con 0 si no hay instalación', () => {
    const otherPrefix = path.join(workDir, 'otro-prefix');

    const result = runScript(UNINSTALL_SCRIPT, ['--prefix', otherPrefix, '--yes'], baseEnv(home));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No hay ninguna instalación');
  });
});
