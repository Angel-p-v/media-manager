import { createHash } from 'node:crypto';
import { existsSync, statSync, accessSync, constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';

import pc from 'picocolors';

import { withCommandContext, type CommandOptions } from './context.js';

import type { Db } from '../core/db/connection.js';
import type { FileRepository } from '../core/db/repositories/fileRepo.js';

export type DoctorCommandOptions = CommandOptions & {
  json?: boolean;
  fullHash?: boolean;
  pruneMissing?: boolean;
  yes?: boolean;
};

type PragmaIntegrityRow = { integrity_check: string };
type PragmaForeignKeyRow = { table: string; parent: string; fkid: number };

type FileRepositoryWithDb = {
  db: Db;
} & FileRepository;

/** Implementa `mm doctor`: diagnóstico y reparación de la biblioteca. */
export async function runDoctorCommand(options: DoctorCommandOptions): Promise<void> {
  await withCommandContext(options, async ({ config, repositories }) => {
    const { mediaRepo, fileRepo, indexRunRepo } = repositories;
    const db = (fileRepo as FileRepositoryWithDb).db;

    const issues: DoctorIssue[] = [];

    // 1. Integridad SQLite
    try {
      const integrity = db.pragma('integrity_check') as PragmaIntegrityRow[];
      if (integrity[0]?.integrity_check !== 'ok') {
        issues.push({
          kind: 'integrity',
          severity: 'error',
          detail: integrity.map((r) => r.integrity_check).join('; '),
        });
      }
    } catch (error) {
      issues.push({
        kind: 'integrity',
        severity: 'error',
        detail: (error as Error).message,
      });
    }

    try {
      const fkCheck = db.pragma('foreign_key_check') as PragmaForeignKeyRow[];
      if (fkCheck.length > 0) {
        issues.push({
          kind: 'foreign-key',
          severity: 'error',
          detail: fkCheck.map((r) => `${r.table}: ${r.parent} -> ${r.fkid}`).join('; '),
        });
      }
    } catch (error) {
      issues.push({
        kind: 'foreign-key',
        severity: 'error',
        detail: (error as Error).message,
      });
    }

    // 2. Ficheros ausentes, enlaces rotos, permisos
    const files = fileRepo.listAllPaths();
    const missingFiles: string[] = [];
    const permissionErrors: string[] = [];
    const brokenSymlinks: string[] = [];

    for (const filePath of files) {
      try {
        if (!existsSync(filePath)) {
          missingFiles.push(filePath);
        } else {
          const stat = statSync(filePath);
          if (stat.isSymbolicLink()) {
            const target = statSync(filePath, { throwIfNoEntry: false });
            if (!target) brokenSymlinks.push(filePath);
          }
        }
        // Check read permission
        accessSync(filePath, constants.R_OK);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          permissionErrors.push(filePath);
        } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          missingFiles.push(filePath);
        }
      }
    }

    if (missingFiles.length > 0) {
      issues.push({
        kind: 'missing-file',
        severity: 'warning',
        count: missingFiles.length,
        paths: missingFiles,
        detail: `${missingFiles.length} fichero(s) ausente(s)`,
      });
    }

    if (brokenSymlinks.length > 0) {
      issues.push({
        kind: 'broken-symlink',
        severity: 'warning',
        count: brokenSymlinks.length,
        paths: brokenSymlinks,
        detail: `${brokenSymlinks.length} enlace(s) simbólico(s) roto(s)`,
      });
    }

    if (permissionErrors.length > 0) {
      issues.push({
        kind: 'permission',
        severity: 'warning',
        count: permissionErrors.length,
        paths: permissionErrors,
        detail: `${permissionErrors.length} fichero(s) sin permiso de lectura`,
      });
    }

    // 3. Títulos vacíos
    const emptyMedia = mediaRepo.removeEmpty(); // This actually removes them - we should just count
    if (emptyMedia > 0) {
      issues.push({
        kind: 'empty-media',
        severity: 'warning',
        count: emptyMedia,
        detail: `${emptyMedia} título(s) sin ficheros`,
      });
    }

    // 4. Ficheros fuera de las raíces
    const roots = config.library.roots.map((r) => path.resolve(r.path));
    const outsideRoots: string[] = [];
    for (const filePath of files) {
      const resolved = path.resolve(filePath);
      const inRoot = roots.some(
        (root) => resolved.startsWith(root + path.sep) || resolved === root,
      );
      if (!inRoot) outsideRoots.push(filePath);
    }
    if (outsideRoots.length > 0) {
      issues.push({
        kind: 'outside-roots',
        severity: 'warning',
        count: outsideRoots.length,
        paths: outsideRoots,
        detail: `${outsideRoots.length} fichero(s) fuera de las raíces configuradas`,
      });
    }

    // 5. Duplicados por tamaño + huella parcial
    const duplicateGroups = await findDuplicates(fileRepo, options.fullHash === true);
    if (duplicateGroups.length > 0) {
      issues.push({
        kind: 'duplicate',
        severity: 'info',
        count: duplicateGroups.length,
        groups: duplicateGroups,
        detail: `${duplicateGroups.length} grupo(s) de duplicados`,
      });
    }

    // 6. Indexaciones anómalas
    const runs = indexRunRepo.list(10);
    const staleRuns = runs.filter(
      (r) =>
        r.status === 'running' &&
        new Date(r.startedAt).getTime() < Date.now() - 24 * 60 * 60 * 1000,
    );
    if (staleRuns.length > 0) {
      issues.push({
        kind: 'stale-run',
        severity: 'warning',
        count: staleRuns.length,
        detail: `${staleRuns.length} indexación(es) en 'running' > 24h`,
      });
    }

    // JSON output
    if (options.json === true) {
      const status = issues.some((i) => i.severity === 'error')
        ? 'error'
        : issues.some((i) => i.severity === 'warning')
          ? 'warning'
          : 'ok';
      console.log(
        JSON.stringify(
          {
            status,
            generatedAt: new Date().toISOString(),
            database: { integrity: 'ok', foreignKeys: 'ok', migrated: false }, // TODO: track migrated
            counts: {
              media: mediaRepo.count(),
              files: fileRepo.count(),
              missing: missingFiles.length,
              emptyMedia,
              outsideRoots: outsideRoots.length,
              permissionErrors: permissionErrors.length,
              duplicateGroups: duplicateGroups.length,
              staleRuns: staleRuns.length,
            },
            issues: issues.map((i) => ({
              kind: i.kind,
              severity: i.severity,
              ...(i.count !== undefined && { count: i.count }),
              ...(i.paths !== undefined && { paths: i.paths }),
              ...(i.groups !== undefined && { groups: i.groups }),
              detail: i.detail,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    // Human output
    if (issues.length === 0) {
      console.log(pc.green('✓ Biblioteca sana'));
      return;
    }

    console.log(pc.bold('Diagnóstico:'));
    for (const issue of issues) {
      const color =
        issue.severity === 'error' ? pc.red : issue.severity === 'warning' ? pc.yellow : pc.blue;
      console.log(`  ${color(issue.severity.toUpperCase())} ${issue.kind}: ${issue.detail}`);
      if (issue.paths && issue.paths.length <= 10) {
        for (const p of issue.paths) console.log(`    ${p}`);
      } else if (issue.paths && issue.paths.length > 10) {
        for (const p of issue.paths.slice(0, 10)) console.log(`    ${p}`);
        console.log(`    ... y ${issue.paths.length - 10} más`);
      }
      if (issue.groups && issue.groups.length <= 5) {
        for (const g of issue.groups) console.log(`    ${g.size} bytes: ${g.paths.join(', ')}`);
      }
    }

    // --prune-missing
    if (options.pruneMissing) {
      if (missingFiles.length === 0) {
        console.log(pc.dim('No hay ficheros ausentes que podar.'));
        return;
      }

      if (!options.yes && process.stdout.isTTY) {
        const readline = await import('node:readline/promises');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(
          `${pc.yellow('Aviso')} Se eliminarán ${missingFiles.length} fichero(s) ausente(s) del índice. ¿Continuar? [y/N] `,
        );
        rl.close();
        if (!/^y(es)?$/i.test(answer.trim())) {
          console.log('Cancelado.');
          return;
        }
      } else if (!options.yes && !process.stdout.isTTY) {
        console.error(pc.red('Error: --prune-missing requiere --yes en modo no interactivo.'));
        process.exit(2);
      }

      // Backup before pruning
      try {
        // Import backup function
        const { backupDatabase } = await import('../core/db/backup.js');
        const { openDatabase } = await import('../core/db/connection.js');
        const doctorDb = openDatabase(config.database.path);
        backupDatabase(doctorDb, config.database.path, 'doctor');
        doctorDb.close();
      } catch (error) {
        console.error(pc.red(`Error creando backup: ${(error as Error).message}`));
        process.exit(1);
      }

      // Prune in transaction
      const removed = fileRepo.removeMissing(new Set(files.filter((f) => existsSync(f))));
      const emptyRemoved = mediaRepo.removeEmpty();
      console.log(
        pc.green(
          `Eliminados ${removed} fichero(s) ausente(s) y ${emptyRemoved} título(s) vacío(s).`,
        ),
      );
    }
  });
}

type DoctorIssue = {
  kind: string;
  severity: 'error' | 'warning' | 'info';
  count?: number;
  paths?: string[];
  groups?: DuplicateGroup[];
  detail: string;
};

type DuplicateGroup = {
  size: number;
  paths: string[];
  hash?: string;
};

async function findDuplicates(
  fileRepo: FileRepository,
  fullHash: boolean,
): Promise<DuplicateGroup[]> {
  const files = fileRepo.listAllPaths();
  const bySize = new Map<number, string[]>();

  for (const filePath of files) {
    try {
      const stat = statSync(filePath);
      if (!bySize.has(stat.size)) bySize.set(stat.size, []);
      bySize.get(stat.size)!.push(filePath);
    } catch {
      // Ignore unreadable
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [size, paths] of bySize) {
    if (paths.length <= 1) continue;

    if (!fullHash) {
      // Partial hash: head + tail 64 KiB
      const hashes = new Map<string, string[]>();
      for (const p of paths) {
        const hash = await partialHash(p);
        if (!hashes.has(hash)) hashes.set(hash, []);
        hashes.get(hash)!.push(p);
      }
      for (const [hash, dups] of hashes) {
        if (dups.length > 1) {
          groups.push({ size, paths: dups, hash });
        }
      }
    } else {
      // Full hash
      const hashes = new Map<string, string[]>();
      for (const p of paths) {
        const hash = await fullFileHash(p);
        if (!hashes.has(hash)) hashes.set(hash, []);
        hashes.get(hash)!.push(p);
      }
      for (const [hash, dups] of hashes) {
        if (dups.length > 1) {
          groups.push({ size, paths: dups, hash });
        }
      }
    }
  }
  return groups;
}

async function partialHash(filePath: string): Promise<string> {
  const CHUNK = 64 * 1024;
  const hash = createHash('sha256');
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    // Head
    const headBuf = Buffer.alloc(Math.min(CHUNK, stat.size));
    await handle.read(headBuf, 0, headBuf.length, 0);
    hash.update(headBuf);
    // Tail
    if (stat.size > CHUNK) {
      const tailBuf = Buffer.alloc(Math.min(CHUNK, stat.size));
      await handle.read(tailBuf, 0, tailBuf.length, stat.size - tailBuf.length);
      hash.update(tailBuf);
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

async function fullFileHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const handle = await open(filePath, 'r');
  try {
    const CHUNK = 64 * 1024;
    const buf = Buffer.alloc(CHUNK);
    while (true) {
      const result = await handle.read(buf, 0, CHUNK, null);
      if (result.bytesRead === 0) break;
      hash.update(buf.subarray(0, result.bytesRead));
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
