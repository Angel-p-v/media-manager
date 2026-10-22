import type { MediaType } from '../../config/schema.js';
import type { Db } from '../connection.js';
import type { MediaInput, MediaRow } from '../types.js';

type MediaDbRow = {
  id: number;
  type: MediaType;
  title: string;
  sort_title: string;
  year: number | null;
  folder_path: string;
  created_at: string;
  updated_at: string;
};

export type ListMediaOptions = {
  type?: MediaType;
  limit?: number;
  offset?: number;
  orderBy?: 'title' | 'added' | 'recent';
};

export type MediaRepository = {
  upsert(input: MediaInput): MediaRow;
  findById(id: number): MediaRow | undefined;
  findByFolderPath(folderPath: string): MediaRow | undefined;
  list(options?: ListMediaOptions): MediaRow[];
  search(query: string, limit?: number): MediaRow[];
  remove(id: number): boolean;
  removeEmpty(): number;
  count(type?: MediaType): number;
  listFolders(): string[];
};

/** Crea el repositorio de títulos sobre una conexión SQLite dada. */
export function createMediaRepository(db: Db): MediaRepository {
  const upsertStatement = db.prepare(`
    INSERT INTO media (type, title, sort_title, year, folder_path)
    VALUES (@type, @title, @sort_title, @year, @folder_path)
    ON CONFLICT(folder_path) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      sort_title = excluded.sort_title,
      year = excluded.year,
      updated_at = datetime('now')
    RETURNING id
  `);

  const findByIdStatement = db.prepare('SELECT * FROM media WHERE id = ?');
  const findByFolderStatement = db.prepare('SELECT * FROM media WHERE folder_path = ?');
  const removeStatement = db.prepare('DELETE FROM media WHERE id = ?');
  const removeEmptyStatement = db.prepare(`
    DELETE FROM media
    WHERE NOT EXISTS (SELECT 1 FROM media_files WHERE media_files.media_id = media.id)
  `);
  const countStatement = db.prepare<[MediaType], { total: number }>(
    'SELECT COUNT(*) AS total FROM media WHERE type = ?',
  );
  const countAllStatement = db.prepare<[], { total: number }>(
    'SELECT COUNT(*) AS total FROM media',
  );
  const foldersStatement = db.prepare<[], { folder_path: string }>(
    'SELECT folder_path FROM media ORDER BY sort_title',
  );

  const listStatements = {
    title: db.prepare<{ type: MediaType | null; limit: number; offset: number }, MediaDbRow>(`
      SELECT * FROM media
      WHERE (@type IS NULL OR type = @type)
      ORDER BY sort_title ASC
      LIMIT @limit OFFSET @offset
    `),
    added: db.prepare<{ type: MediaType | null; limit: number; offset: number }, MediaDbRow>(`
      SELECT * FROM media
      WHERE (@type IS NULL OR type = @type)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    recent: db.prepare<{ type: MediaType | null; limit: number; offset: number }, MediaDbRow>(`
      SELECT * FROM media
      WHERE (@type IS NULL OR type = @type)
      ORDER BY updated_at DESC
      LIMIT @limit OFFSET @offset
    `),
  };

  const searchStatement = db.prepare<{ query: string; limit: number }, MediaDbRow>(`
    SELECT m.* FROM media m
    JOIN media_fts f ON f.rowid = m.id
    WHERE media_fts MATCH @query
    ORDER BY bm25(media_fts), m.sort_title
    LIMIT @limit
  `);

  return {
    upsert(input: MediaInput): MediaRow {
      const sortTitle = input.title.toLocaleLowerCase();
      const result = upsertStatement.get({
        type: input.type,
        title: input.title,
        sort_title: sortTitle,
        year: input.year ?? null,
        folder_path: input.folderPath,
      }) as { id: number } | undefined;

      if (!result) throw new Error('No se pudo guardar el título');
      const row = findByIdStatement.get(result.id) as MediaDbRow | undefined;
      if (!row) throw new Error('No se pudo leer el título guardado');
      return toMediaRow(row);
    },

    findById(id: number): MediaRow | undefined {
      const row = findByIdStatement.get(id) as MediaDbRow | undefined;
      return row ? toMediaRow(row) : undefined;
    },

    findByFolderPath(folderPath: string): MediaRow | undefined {
      const row = findByFolderStatement.get(folderPath) as MediaDbRow | undefined;
      return row ? toMediaRow(row) : undefined;
    },

    list(options: ListMediaOptions = {}): MediaRow[] {
      const statement = listStatements[options.orderBy ?? 'title'];
      const rows = statement.all({
        type: options.type ?? null,
        limit: options.limit ?? 500,
        offset: options.offset ?? 0,
      });
      return rows.map(toMediaRow);
    },

    search(query: string, limit = 20): MediaRow[] {
      const match = toFtsQuery(query);
      if (!match) return [];
      const rows = searchStatement.all({ query: match, limit });
      return rows.map(toMediaRow);
    },

    remove(id: number): boolean {
      return removeStatement.run(id).changes > 0;
    },

    /** Elimina los títulos que se han quedado sin ficheros. */
    removeEmpty(): number {
      return removeEmptyStatement.run().changes;
    },

    count(type?: MediaType): number {
      if (type) return countStatement.get(type)?.total ?? 0;
      return countAllStatement.get()?.total ?? 0;
    },

    listFolders(): string[] {
      return foldersStatement.all().map((row) => row.folder_path);
    },
  };
}

/** Convierte una fila de SQLite al tipo del dominio. */
function toMediaRow(row: MediaDbRow): MediaRow {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    sortTitle: row.sort_title,
    year: row.year,
    folderPath: row.folder_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convierte la consulta del usuario en una expresión FTS5 segura.
 * Se escapan las comillas y se añade el comodín de prefijo al último término.
 */
export function toFtsQuery(query: string): string {
  const terms = query
    .replace(/["*]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (terms.length === 0) return '';
  return terms.map((term) => `"${term}"*`).join(' AND ');
}
