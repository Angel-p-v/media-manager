#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Crea una distribución portable con el runtime de Node incluido.
 *
 * No es un único ejecutable de Node SEA: `better-sqlite3` incluye un addon
 * nativo y necesita seguir en disco. El resultado es un directorio (y un
 * `.tar.gz`) que funciona en la misma plataforma/arquitectura sin Node instalado.
 */
async function main() {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const platform = `${process.platform}-${process.arch}`;
  const bundleName = `${packageJson.name}-${packageJson.version}-${platform}`;
  const outputDirectory = path.join(ROOT, 'build', 'standalone');
  const bundleDirectory = path.join(outputDirectory, bundleName);
  const workspace = await mkdtemp(path.join(tmpdir(), 'mm-standalone-'));

  try {
    await rm(bundleDirectory, { recursive: true, force: true });
    await mkdir(bundleDirectory, { recursive: true });
    await mkdir(path.join(workspace, 'pack'), { recursive: true });

    step('empaquetando la aplicación');
    run('npm', ['pack', '--pack-destination', path.join(workspace, 'pack'), '--silent'], ROOT);
    const tarballs = (await readdir(path.join(workspace, 'pack'))).filter((name) =>
      name.endsWith('.tgz'),
    );
    if (tarballs.length !== 1) {
      throw new Error(`Se esperaba un tarball y hay ${tarballs.length}`);
    }

    await writeFile(
      path.join(bundleDirectory, 'package.json'),
      `${JSON.stringify(
        {
          name: `${packageJson.name}-standalone`,
          private: true,
          allowScripts: { 'better-sqlite3': true },
        },
        null,
        2,
      )}\n`,
    );

    step('instalando dependencias de producción');
    run(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--omit=dev',
        path.join(workspace, 'pack', tarballs[0]),
      ],
      bundleDirectory,
    );

    step('copiando el runtime de Node');
    const runtimeName = process.platform === 'win32' ? 'node.exe' : 'node';
    await copyFile(process.execPath, path.join(bundleDirectory, runtimeName));
    await chmod(path.join(bundleDirectory, runtimeName), 0o755);

    const packagePath = packageJson.name.split('/').join(path.sep);
    const launcher =
      process.platform === 'win32'
        ? createWindowsLauncher(packagePath)
        : createPosixLauncher(packagePath);
    const launcherName = process.platform === 'win32' ? 'mm.cmd' : 'mm';
    const launcherPath = path.join(bundleDirectory, launcherName);
    await writeFile(launcherPath, launcher);
    if (process.platform !== 'win32') {
      await chmod(launcherPath, 0o755);
    }

    step('comprobando el lanzador');
    const version = run(launcherPath, ['--version'], bundleDirectory).stdout.trim();
    if (version !== packageJson.version) {
      throw new Error(`El lanzador devolvió ${version} y se esperaba ${packageJson.version}`);
    }

    step('creando el archivo portable');
    const archivePath = path.join(outputDirectory, `${bundleName}.tar.gz`);
    run('tar', ['-czf', archivePath, '-C', outputDirectory, path.basename(bundleDirectory)], ROOT);

    console.log(`\n✔ Distribución portable: ${bundleDirectory}`);
    console.log(`✔ Archivo: ${archivePath}`);
    console.log(
      '  Incluye Node y better-sqlite3 para esta plataforma; no requiere Node instalado.',
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function createPosixLauncher(packagePath) {
  return [
    '#!/bin/sh',
    'set -eu',
    'HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec "$HERE/node" "$HERE/node_modules/${packagePath}/dist/cli.js" "$@"`,
    '',
  ].join('\n');
}

function createWindowsLauncher(packagePath) {
  const cliPath = path.join('%HERE%', 'node_modules', packagePath, 'dist', 'cli.js');
  return ['@echo off', 'set "HERE=%~dp0"', `"%HERE%node.exe" "${cliPath}" %*`, ''].join('\r\n');
}

function step(message) {
  console.log(`· ${message}`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 300_000,
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Falló \`${command} ${args.join(' ')}\` (código ${result.status})\n${details}`);
  }

  return result;
}

await main();
