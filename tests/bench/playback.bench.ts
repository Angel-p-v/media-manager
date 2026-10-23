import { afterAll, beforeAll, test } from 'vitest';

import { closeDatabase, openDatabase, type Db } from '../../src/core/db/connection.js';
import {
  createMediaRepository,
  type MediaRepository,
} from '../../src/core/db/repositories/mediaRepo.js';
import {
  createPlaybackRepository,
  type PlaybackRepository,
} from '../../src/core/db/repositories/playbackRepo.js';
import {
  createPreferenceRepository,
  type PreferenceRepository,
} from '../../src/core/db/repositories/preferencesRepo.js';

const STRESS_ENTRIES = 100_000;
const PLAYBACK_ENTRIES = 10_000;
const FAVORITE_ENTRIES = 5_000;

let db: Db;
let mediaRepo: MediaRepository;
let playbackRepo: PlaybackRepository;
let preferenceRepo: PreferenceRepository;

beforeAll(() => {
  // Usar una base de datos en memoria separada para este benchmark
  db = openDatabase(':memory:');
  // Habilitar WAL y claves foráneas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_title TEXT NOT NULL,
      year INTEGER,
      folder_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media_files (
      id INTEGER PRIMARY KEY,
      media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      season INTEGER,
      episode INTEGER,
      title TEXT,
      size_bytes INTEGER,
      mtime_ms INTEGER,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS playback_state (
      media_file_id INTEGER PRIMARY KEY REFERENCES media_files(id) ON DELETE CASCADE,
      position_seconds REAL NOT NULL DEFAULT 0,
      duration_seconds REAL,
      completed_at TEXT,
      last_played_at TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_preferences (
      media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
      favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
    CREATE INDEX IF NOT EXISTS idx_media_sort_title ON media(sort_title);
    CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
    CREATE INDEX IF NOT EXISTS idx_media_updated_at ON media(updated_at);
    CREATE INDEX IF NOT EXISTS idx_media_files_media_id ON media_files(media_id);
    CREATE INDEX IF NOT EXISTS idx_playback_state_last_played_at ON playback_state(last_played_at);
    CREATE INDEX IF NOT EXISTS idx_playback_state_completed_at ON playback_state(completed_at);
    CREATE INDEX IF NOT EXISTS idx_media_preferences_favorite ON media_preferences(favorite);
    CREATE VIRTUAL TABLE IF NOT EXISTS media_fts USING fts5(title, content='media', content_rowid='id');
    CREATE TRIGGER IF NOT EXISTS media_fts_ai AFTER INSERT ON media BEGIN
      INSERT INTO media_fts(rowid, title) VALUES (new.id, new.title);
    END;
    CREATE TRIGGER IF NOT EXISTS media_fts_ad AFTER DELETE ON media BEGIN
      INSERT INTO media_fts(media_fts, rowid, title) VALUES ('delete', old.id, old.title);
    END;
    CREATE TRIGGER IF NOT EXISTS media_fts_au AFTER UPDATE ON media BEGIN
      INSERT INTO media_fts(media_fts, rowid, title) VALUES ('delete', old.id, old.title);
      INSERT INTO media_fts(rowid, title) VALUES (new.id, new.title);
    END;
  `);

  const insertMedia = db.prepare(`
    INSERT INTO media (type, title, sort_title, year, folder_path)
    VALUES (@type, @title, @sort_title, @year, @folder_path)
  `);

  const insertFile = db.prepare(`
    INSERT INTO media_files (media_id, file_path, season, episode)
    VALUES (@media_id, @file_path, @season, @episode)
  `);

  const insertPlayback = db.prepare(`
    INSERT INTO playback_state (media_file_id, position_seconds, duration_seconds, completed_at, last_played_at, play_count, updated_at)
    VALUES (@media_file_id, @position_seconds, @duration_seconds, @completed_at, @last_played_at, @play_count, @updated_at)
  `);

  const insertPreference = db.prepare(`
    INSERT INTO media_preferences (media_id, favorite, created_at, updated_at)
    VALUES (@media_id, @favorite, @created_at, @updated_at)
  `);

  const now = new Date().toISOString();

  // Insert media and files
  db.transaction(() => {
    for (let index = 0; index < STRESS_ENTRIES; index += 1) {
      const title = `Bench Show ${index}`;
      const folderPath = `/library/bench-${index}`;
      const type = index % 3 === 0 ? 'series' : index % 3 === 1 ? 'anime' : 'movie';

      const mediaResult = insertMedia.run({
        type,
        title,
        sort_title: title.toLocaleLowerCase(),
        year: 2020,
        folder_path: folderPath,
      });
      const mediaId = mediaResult.lastInsertRowid as number;

      // Add 1-3 files per media
      const fileCount = (index % 3) + 1;
      for (let f = 0; f < fileCount; f += 1) {
        insertFile.run({
          media_id: mediaId,
          file_path: `${folderPath}/episode_${f}.mkv`,
          season: 1,
          episode: f + 1,
        });
      }
    }
  })();

  // Insert playback state for some entries (simulate 10% with playback)
  const fileIds: number[] = [];
  const fileIdStmt = db.prepare('SELECT id FROM media_files ORDER BY id');
  const rows = fileIdStmt.all() as { id: number }[];
  rows.forEach((row) => fileIds.push(row.id));

  db.transaction(() => {
    for (let index = 0; index < PLAYBACK_ENTRIES && index < fileIds.length; index += 1) {
      const fileId = fileIds[index];
      const position = index % 10 === 0 ? 0 : Math.floor(Math.random() * 3600); // Some at 0, some in progress
      const duration = 3600;
      const completedAt = position > duration * 0.9 ? now : null;
      const playCount = Math.floor(Math.random() * 5) + 1;

      insertPlayback.run({
        media_file_id: fileId,
        position_seconds: position,
        duration_seconds: duration,
        completed_at: completedAt,
        last_played_at: now,
        play_count: playCount,
        updated_at: now,
      });
    }
  })();

  // Insert favorites for some entries (simulate 5% favorites)
  const mediaIds: number[] = [];
  const mediaIdStmt = db.prepare('SELECT id FROM media ORDER BY id');
  const mediaRows = mediaIdStmt.all() as { id: number }[];
  mediaRows.forEach((row) => mediaIds.push(row.id));

  db.transaction(() => {
    for (let index = 0; index < FAVORITE_ENTRIES && index < mediaIds.length; index += 1) {
      insertPreference.run({
        media_id: mediaIds[index],
        favorite: 1,
        created_at: now,
        updated_at: now,
      });
    }
  })();

  db.pragma('optimize');

  mediaRepo = createMediaRepository(db, {
    preferenceRepo: createPreferenceRepository(db),
    playbackRepo: createPlaybackRepository(db),
  });
  playbackRepo = createPlaybackRepository(db);
  preferenceRepo = createPreferenceRepository(db);
}, 180_000);

afterAll(() => {
  closeDatabase(db);
});

test('listados con filtros de estado de reproducción sobre 100 000 títulos', async ({ bench }) => {
  // Listar favoritos
  const favList = bench('list · favoritos (5 000 de 100 000)', () => {
    const results = mediaRepo.list({ favorites: true, limit: 50, orderBy: 'title' });
    if (results.length === 0) throw new Error('Se esperaban favoritos');
  });
  await favList.run({ iterations: 20, time: 2_000, warmupIterations: 3, warmupTime: 500 });

  // Listar en curso
  const inProgressList = bench('list · en curso (10 000 de 100 000)', () => {
    const results = mediaRepo.list({ inProgress: true, limit: 50, orderBy: 'title' });
    if (results.length === 0) throw new Error('Se esperaban títulos en curso');
  });
  await inProgressList.run({ iterations: 20, time: 2_000, warmupIterations: 3, warmupTime: 500 });

  // Listar no vistos
  const unwatchedList = bench('list · no vistos', () => {
    const results = mediaRepo.list({ unwatched: true, limit: 50, orderBy: 'title' });
    if (results.length === 0) throw new Error('Se esperaban títulos no vistos');
  });
  await unwatchedList.run({ iterations: 20, time: 2_000, warmupIterations: 3, warmupTime: 500 });

  // Listar vistos
  const watchedList = bench('list · vistos', () => {
    const results = mediaRepo.list({ watched: true, limit: 50, orderBy: 'title' });
    if (results.length === 0) throw new Error('Se esperaban títulos vistos');
  });
  await watchedList.run({ iterations: 20, time: 2_000, warmupIterations: 3, warmupTime: 500 });

  // Listar con tipo + favoritos
  const typedFavList = bench('list · series + favoritos', () => {
    const results = mediaRepo.list({
      type: 'series',
      favorites: true,
      limit: 50,
      orderBy: 'title',
    });
    if (results.length === 0) throw new Error('Se esperaban series favoritas');
  });
  await typedFavList.run({ iterations: 20, time: 2_000, warmupIterations: 3, warmupTime: 500 });
});

test('consultas de continuación e historial', async ({ bench }) => {
  // listInProgress (para sección Continuar)
  const continueList = bench('playbackRepo.listInProgress · 50 títulos', () => {
    const results = playbackRepo.listInProgress(50);
    if (results.length === 0) throw new Error('Se esperaban títulos en curso');
  });
  await continueList.run({ iterations: 50, time: 2_000, warmupIterations: 5, warmupTime: 500 });

  // listRecent (para historial)
  const historyList = bench('playbackRepo.listRecent · 50 títulos', () => {
    const results = playbackRepo.listRecent(50);
    if (results.length === 0) throw new Error('Se esperaban títulos en historial');
  });
  await historyList.run({ iterations: 50, time: 2_000, warmupIterations: 5, warmupTime: 500 });

  // preferenceRepo.listFavorites
  const favListRepo = bench('preferenceRepo.listFavorites · 50 títulos', () => {
    const results = preferenceRepo.listFavorites(50);
    if (results.length === 0) throw new Error('Se esperaban favoritos');
  });
  await favListRepo.run({ iterations: 50, time: 2_000, warmupIterations: 5, warmupTime: 500 });
});
