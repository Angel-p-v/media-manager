import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_NAME, INSTALL_SCRIPT, baseEnv, runScript } from './helpers.js';

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

describeLinux('install.sh (integración)', () => {
  let workDir: string;
  let home: string;
  let prefix: string;
  let remoteRepoUrl: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'mm-installer-'));
    home = path.join(workDir, 'home');
    prefix = path.join(workDir, 'prefix');
    const remoteRepoPath = path.join(workDir, 'remote-repo.git');
    remoteRepoUrl = `file://${remoteRepoPath}`;
    mkdirSync(home, { recursive: true });

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
    mkdirSync(path.join(cloneDir, 'node_modules', APP_NAME, 'dist'), {
      recursive: true,
    });
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
    writeFileSync(
      path.join(cloneDir, 'node_modules', APP_NAME, 'dist', 'cli.js'),
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
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('clona el repositorio, compila y crea el wrapper', () => {
    const result = runScript(INSTALL_SCRIPT, ['--prefix', prefix, '--no-path-check'], {
      ...baseEnv(home),
      MM_REPOSITORY: remoteRepoUrl,
      MM_SKIP_BUILD: '1',
    });

    expect(result.status).toBe(0);

    const wrapper = path.join(prefix, 'bin', 'mm');
    expect(existsSync(wrapper)).toBe(true);

    const version = spawnSync(wrapper, ['--version'], { encoding: 'utf8' });
    expect(version.stdout.trim()).toBe('1.0.0');

    // El archivo de configuración debe existir
    const configFile = path.join(home, '.config', 'media-manager', 'config.yaml');
    expect(existsSync(configFile)).toBe(true);

    const configContent = readFileSync(configFile, 'utf8');
    expect(configContent).toContain('version: 1');
    expect(configContent).toContain('library:');
  });

  it('se niega a reinstalar sin --force', () => {
    const env = { ...baseEnv(home), MM_REPOSITORY: remoteRepoUrl, MM_SKIP_BUILD: '1' };
    const first = runScript(INSTALL_SCRIPT, ['--prefix', prefix, '--no-path-check'], env);
    expect(first.status).toBe(0);

    const repeated = runScript(INSTALL_SCRIPT, ['--prefix', prefix, '--no-path-check'], env);
    expect(repeated.status).toBe(4);
    expect(repeated.stderr).toContain('--force');
  });

  it('acepta --force para reinstalar', () => {
    const env = { ...baseEnv(home), MM_REPOSITORY: remoteRepoUrl, MM_SKIP_BUILD: '1' };
    runScript(INSTALL_SCRIPT, ['--prefix', prefix, '--no-path-check'], env);

    const forced = runScript(
      INSTALL_SCRIPT,
      ['--prefix', prefix, '--force', '--no-path-check'],
      env,
    );
    expect(forced.status).toBe(0);
  });

  it('--dry-run no modifica el sistema de archivos', () => {
    const result = runScript(INSTALL_SCRIPT, ['--prefix', prefix, '--dry-run', '--no-path-check'], {
      ...baseEnv(home),
      MM_REPOSITORY: remoteRepoUrl,
      MM_SKIP_BUILD: '1',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Simulación');
    expect(existsSync(prefix)).toBe(false);
  });

  it('respecta --bindir personalizado', () => {
    const bindir = path.join(workDir, 'bin-custom');
    const result = runScript(
      INSTALL_SCRIPT,
      ['--prefix', prefix, '--bindir', bindir, '--no-path-check'],
      { ...baseEnv(home), MM_REPOSITORY: remoteRepoUrl, MM_SKIP_BUILD: '1' },
    );
    expect(result.status).toBe(0);
    expect(existsSync(path.join(bindir, 'mm'))).toBe(true);
  });

  it('no corrompe al usar --prefix /', () => {
    const result = runScript(INSTALL_SCRIPT, ['--prefix', '/'], baseEnv(home));
    expect(result.status).toBe(2);
  });
});
