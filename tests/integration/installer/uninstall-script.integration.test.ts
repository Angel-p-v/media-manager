import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_NAME, INSTALL_SCRIPT, UNINSTALL_SCRIPT, baseEnv, runScript } from './helpers.js';

const describeLinux = process.platform === 'linux' ? describe : describe.skip;

type GitResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error: Error | undefined;
  signal: string | null;
};

function git(cloneDir: string, args: string[]): GitResult {
  const result = spawnSync('git', ['-C', cloneDir, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
    error: result.error,
    signal: result.signal,
  };
}

describeLinux('uninstall.sh (integración)', () => {
  let workDir: string;
  let home: string;
  let prefix: string;
  let appDir: string;
  let wrapper: string;
  let configDir: string;
  let dataDir: string;
  let remoteRepoUrl: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'mm-uninstaller-'));
    home = path.join(workDir, 'home');
    prefix = path.join(workDir, 'prefix con espacios');
    appDir = path.join(prefix, 'share', APP_NAME);
    wrapper = path.join(prefix, 'bin', 'mm');
    configDir = path.join(home, '.config', 'media-manager');
    dataDir = path.join(home, '.local', 'share', 'media-manager');
    const remoteRepoPath = path.join(workDir, 'remote-repo.git');
    remoteRepoUrl = `file://${remoteRepoPath}`;
    mkdirSync(home, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.yaml'), 'version: 1\n');
    writeFileSync(path.join(dataDir, 'library.db'), 'datos\n');

    // Crear un repositorio git local (bare) como "remoto" para tests
    mkdirSync(remoteRepoPath, { recursive: true });
    const initResult = spawnSync('git', ['init', '--bare', remoteRepoPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (initResult.status !== 0) {
      throw new Error(`git init --bare falló: ${initResult.stderr}`);
    }

    // Clonar, crear archivos mínimos, hacer commit y push al bare repo
    const cloneDir = path.join(workDir, 'source-repo');
    const cloneResult = spawnSync('git', ['clone', remoteRepoPath, cloneDir], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (cloneResult.status !== 0) {
      throw new Error(`git clone falló: ${cloneResult.stderr}`);
    }

    mkdirSync(path.join(cloneDir, 'dist'), { recursive: true });
    writeFileSync(
      path.join(cloneDir, 'package.json'),
      JSON.stringify({
        name: APP_NAME,
        version: '1.0.0',
        scripts: { build: 'echo build' },
      }),
    );
    writeFileSync(
      path.join(cloneDir, 'dist', 'cli.js'),
      `#!/usr/bin/env node\nconsole.log('1.0.0');\n`,
    );

    // Configurar identidad de git para commits
    git(cloneDir, ['config', 'user.email', 'test@test']);
    git(cloneDir, ['config', 'user.name', 'test']);

    const addResult = git(cloneDir, ['add', '-A']);
    if (addResult.status !== 0) {
      throw new Error(`git add falló: ${addResult.stderr}`);
    }

    const commitResult = git(cloneDir, ['commit', '-m', 'init']);
    if (commitResult.status !== 0) {
      throw new Error(`git commit falló: ${commitResult.stderr}`);
    }

    const pushResult = git(cloneDir, ['push', 'origin', 'HEAD']);
    if (pushResult.status !== 0) {
      throw new Error(`git push falló: ${pushResult.stderr}`);
    }

    // Instalar usando el nuevo instalador
    const installResult = runScript(INSTALL_SCRIPT, ['--prefix', prefix, '--no-path-check'], {
      ...baseEnv(home),
      MM_REPOSITORY: remoteRepoUrl,
      MM_SKIP_BUILD: '1',
    });
    if (installResult.status !== 0) {
      throw new Error(`No se pudo preparar la instalación: ${installResult.stderr}`);
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
    expect(existsSync(configDir)).toBe(true);
    expect(existsSync(dataDir)).toBe(true);
  });

  it('rechaza --prefix con HOME y con la raíz del sistema', () => {
    const homeAsPrefix = uninstall(['--prefix', home, '--yes']);
    expect(homeAsPrefix.status).toBe(2);

    const rootAsPrefix = runScript(UNINSTALL_SCRIPT, ['--prefix', '/', '--yes'], baseEnv(home));
    expect(rootAsPrefix.status).toBe(2);
  });

  it('no elimina un wrapper ajeno sin la marca del instalador', () => {
    // Crear un wrapper que no tenga la marca del instalador
    const foreignWrapper = path.join(prefix, 'bin', 'mm-foreign');
    writeFileSync(foreignWrapper, '#!/bin/sh\necho foreign\n');
    chmodSync(foreignWrapper, 0o755);

    const result = uninstall(['--yes']);
    expect(result.status).toBe(0);
    expect(existsSync(foreignWrapper)).toBe(true);
  });

  it('ignora un appDir manipulado en install.json', () => {
    // El install.json tiene appDir correcto, el desinstalador usa APP_DIR del prefijo
    const result = uninstall(['--yes']);
    expect(result.status).toBe(0);
    expect(existsSync(appDir)).toBe(false);
  });

  it('se niega a desinstalar si current apunta fuera de la instalación', () => {
    // current ya apunta a APP_DIR (dentro), así que debería funcionar
    const result = uninstall(['--yes']);
    expect(result.status).toBe(0);
  });

  it('desinstala ~/.local por defecto sin corromper el prefijo', () => {
    const defaultPrefix = path.join(home, '.local');
    const defaultWrapper = path.join(defaultPrefix, 'bin', 'mm');

    const installResult = runScript(
      INSTALL_SCRIPT,
      ['--prefix', defaultPrefix, '--no-path-check'],
      { ...baseEnv(home), MM_REPOSITORY: remoteRepoUrl, MM_SKIP_BUILD: '1' },
    );
    expect(installResult.status).toBe(0);

    const uninstallResult = runScript(
      UNINSTALL_SCRIPT,
      ['--prefix', defaultPrefix, '--yes'],
      baseEnv(home),
    );
    expect(uninstallResult.status).toBe(0);
    expect(existsSync(defaultWrapper)).toBe(false);
  });

  it('expande un --prefix literal ~/ dentro de HOME', () => {
    const target = path.join(home, 'prefijo personalizado');
    const installResult = runScript(
      INSTALL_SCRIPT,
      ['--prefix', '~/prefijo personalizado', '--no-path-check'],
      { ...baseEnv(home), MM_REPOSITORY: remoteRepoUrl, MM_SKIP_BUILD: '1' },
    );
    expect(installResult.status).toBe(0);

    const uninstallResult = runScript(
      UNINSTALL_SCRIPT,
      ['--prefix', '~/prefijo personalizado', '--yes'],
      baseEnv(home),
    );
    expect(uninstallResult.status).toBe(0);
    expect(existsSync(path.join(target, 'bin', 'mm'))).toBe(false);
  });

  it('informa y sale con 0 si no hay instalación', () => {
    // Primero desinstalar todo
    uninstall(['--yes']);

    // Luego intentar desinstalar de nuevo
    const result = uninstall(['--yes']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No hay ninguna instalación');
  });
});
