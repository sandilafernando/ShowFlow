export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial production schema',
    run(db) {
      db.executeScript(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS operators (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          contact TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          venue TEXT NOT NULL DEFAULT '',
          event_date TEXT NOT NULL,
          start_time TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          notes TEXT NOT NULL DEFAULT '',
          technical_notes TEXT NOT NULL DEFAULT '',
          armed_cue_id TEXT,
          live_cue_id TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL COLLATE NOCASE UNIQUE,
          kind TEXT NOT NULL,
          extension TEXT NOT NULL DEFAULT '',
          size_bytes INTEGER NOT NULL DEFAULT 0,
          duration_seconds REAL,
          width INTEGER,
          height INTEGER,
          tags TEXT NOT NULL DEFAULT '[]',
          category TEXT NOT NULL DEFAULT '',
          event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
          notes TEXT NOT NULL DEFAULT '',
          added_at TEXT NOT NULL,
          last_checked_at TEXT,
          available INTEGER NOT NULL DEFAULT 1,
          missing_since TEXT
        );

        CREATE TABLE IF NOT EXISTS cues (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          sort_index INTEGER NOT NULL DEFAULT 0,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          fallback TEXT NOT NULL DEFAULT '',
          operator_id TEXT REFERENCES operators(id) ON DELETE SET NULL,
          duration_seconds INTEGER NOT NULL DEFAULT 0,
          asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
          resolume_action TEXT NOT NULL DEFAULT 'none',
          resolume_layer INTEGER,
          resolume_clip INTEGER,
          resolume_value REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assignments (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          operator_id TEXT REFERENCES operators(id) ON DELETE SET NULL,
          role TEXT NOT NULL,
          role_label TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS checklists (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          owner TEXT NOT NULL DEFAULT '',
          done INTEGER NOT NULL DEFAULT 0,
          sort_index INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS displays (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          purpose TEXT NOT NULL DEFAULT 'live',
          width INTEGER NOT NULL DEFAULT 1920,
          height INTEGER NOT NULL DEFAULT 1080,
          layout TEXT NOT NULL DEFAULT 'full',
          notes TEXT NOT NULL DEFAULT '',
          pairing_code TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_seen TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity (
          id TEXT PRIMARY KEY,
          event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
          kind TEXT NOT NULL,
          message TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT 'null',
          mode TEXT NOT NULL DEFAULT 'system',
          actor TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date, start_time);
        CREATE INDEX IF NOT EXISTS idx_events_archived ON events(archived, status);
        CREATE INDEX IF NOT EXISTS idx_cues_event ON cues(event_id, sort_index);
        CREATE INDEX IF NOT EXISTS idx_cues_asset ON cues(asset_id);
        CREATE INDEX IF NOT EXISTS idx_media_kind ON media_assets(kind, available);
        CREATE INDEX IF NOT EXISTS idx_media_event ON media_assets(event_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_event ON assignments(event_id);
        CREATE INDEX IF NOT EXISTS idx_checklists_event ON checklists(event_id, kind, sort_index);
        CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_event ON activity(event_id, created_at DESC);
      `);
    },
  },
];

export function runMigrations(db, logger = console) {
  const result = db.get('PRAGMA user_version;');
  const current = Number(result?.user_version ?? 0);
  const pending = MIGRATIONS.filter((migration) => migration.version > current).sort(
    (a, b) => a.version - b.version,
  );
  if (!pending.length) return { current, applied: [] };

  const applied = [];
  for (const migration of pending) {
    logger.info?.(`Applying database migration ${migration.version}: ${migration.name}`);
    db.transaction(() => {
      migration.run(db);
      db.execute(`PRAGMA user_version = ${migration.version};`);
    });
    applied.push(migration.version);
  }
  return { current: pending[pending.length - 1].version, applied };
}
