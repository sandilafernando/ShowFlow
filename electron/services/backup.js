import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
} from '../../shared/defaults.js';
import { ValidationError } from '../../shared/validation.js';
import { AppError } from '../errors.js';

const MAX_BACKUP_BYTES = 60 * 1024 * 1024;
const AUTO_PREFIX = 'showflow-auto-';
const AUTO_SUFFIX = '.showflow-backup';

const TABLE_COLUMNS = Object.freeze({
  settings: ['key', 'value', 'updated_at'],
  events: [
    'id',
    'title',
    'description',
    'venue',
    'event_date',
    'start_time',
    'status',
    'notes',
    'technical_notes',
    'armed_cue_id',
    'live_cue_id',
    'archived',
    'created_at',
    'updated_at',
  ],
  media_assets: [
    'id',
    'name',
    'path',
    'kind',
    'extension',
    'size_bytes',
    'duration_seconds',
    'width',
    'height',
    'tags',
    'category',
    'event_id',
    'notes',
    'added_at',
    'last_checked_at',
    'available',
    'missing_since',
  ],
  operators: ['id', 'name', 'role', 'contact', 'active', 'created_at', 'updated_at'],
  cues: [
    'id',
    'event_id',
    'sort_index',
    'title',
    'type',
    'notes',
    'fallback',
    'operator_id',
    'duration_seconds',
    'asset_id',
    'resolume_action',
    'resolume_layer',
    'resolume_clip',
    'resolume_value',
    'created_at',
    'updated_at',
  ],
  assignments: ['id', 'event_id', 'operator_id', 'role', 'role_label', 'notes', 'created_at'],
  checklists: ['id', 'event_id', 'kind', 'title', 'owner', 'done', 'sort_index', 'created_at'],
  displays: [
    'id',
    'name',
    'purpose',
    'width',
    'height',
    'layout',
    'notes',
    'pairing_code',
    'enabled',
    'last_seen',
    'created_at',
    'updated_at',
  ],
  activity: ['id', 'event_id', 'kind', 'message', 'detail', 'mode', 'actor', 'created_at'],
});

const TABLE_ROW_LIMITS = Object.freeze({
  settings: 1000,
  events: 20000,
  media_assets: 50000,
  operators: 10000,
  cues: 200000,
  assignments: 100000,
  checklists: 200000,
  displays: 5000,
  activity: 50000,
});

function tableChecksum(tables) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(tables));
  return hash.digest('hex');
}

function ensureString(value, max = 100000) {
  return typeof value === 'string' && value.length <= max;
}

function assertBackupShape(data) {
  if (!data || typeof data !== 'object') throw new ValidationError('The backup file is not valid JSON.');
  if (data.format !== BACKUP_FORMAT) throw new ValidationError('This file is not a ShowFlow backup.');
  if (data.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new ValidationError(
      `This backup uses schema version ${data.schemaVersion}; this build supports version ${BACKUP_SCHEMA_VERSION}.`,
    );
  }
  if (!data.tables || typeof data.tables !== 'object') throw new ValidationError('The backup has no data tables.');
  if (data.checksum && data.checksum !== tableChecksum(data.tables)) {
    throw new ValidationError('The backup checksum does not match its contents. The file may be damaged.');
  }
  return data;
}

function sanitiseTables(rawTables) {
  const result = {};
  for (const [table, allowedColumns] of Object.entries(TABLE_COLUMNS)) {
    const rows = rawTables[table];
    if (!Array.isArray(rows)) throw new ValidationError(`Backup table "${table}" is missing or invalid.`);
    if (rows.length > TABLE_ROW_LIMITS[table]) throw new ValidationError(`Backup table "${table}" is too large.`);
    result[table] = rows.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new ValidationError(`Backup table "${table}" row ${index + 1} is invalid.`);
      }
      const clean = {};
      for (const column of allowedColumns) {
        const value = row[column];
        if (value === undefined) {
          throw new ValidationError(`Backup table "${table}" row ${index + 1} is missing "${column}".`);
        }
        if (value !== null && typeof value === 'object') {
          throw new ValidationError(`Backup table "${table}" row ${index + 1} has an invalid "${column}".`);
        }
        if (typeof value === 'string' && !ensureString(value)) {
          throw new ValidationError(`Backup table "${table}" row ${index + 1} has an oversized "${column}".`);
        }
        clean[column] = value;
      }
      return clean;
    });
  }
  return result;
}

export class BackupService {
  constructor({ db, repository, appVersion, userDataPath, logger }) {
    this.db = db;
    this.repo = repository;
    this.appVersion = appVersion;
    this.userDataPath = userDataPath;
    this.logger = logger;
    this.backupDirectory = path.join(userDataPath, 'backups');
    fs.mkdirSync(this.backupDirectory, { recursive: true });
  }

  buildSnapshot(reason = 'manual') {
    const tables = this.repo.exportTables();
    const counts = Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.length]),
    );
    return {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: this.appVersion,
      createdAt: new Date().toISOString(),
      reason,
      counts,
      checksum: tableChecksum(tables),
      tables,
    };
  }

  async writeBackup(destinationPath, { reason = 'manual' } = {}) {
    const snapshot = this.buildSnapshot(reason);
    const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
    const temporaryPath = `${destinationPath}.tmp-${process.pid}`;
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsp.writeFile(temporaryPath, payload, 'utf8');
    await fsp.rename(temporaryPath, destinationPath);
    const sizeBytes = Buffer.byteLength(payload, 'utf8');
    this.repo.logActivity({
      kind: 'backup',
      message: `Backup created (${reason === 'auto' ? 'automatic' : 'manual'})`,
      detail: { fileName: path.basename(destinationPath), sizeBytes },
    });
    return {
      path: destinationPath,
      sizeBytes,
      createdAt: snapshot.createdAt,
      counts: snapshot.counts,
    };
  }

  async createAutoBackup({ force = false } = {}) {
    const settings = this.repo.getSettings();
    if (!settings.autoBackup && !force) return { skipped: true, reason: 'disabled' };
    const now = Date.now();
    const recent = await this.listAutoBackups();
    if (!force && recent[0]) {
      const age = now - new Date(recent[0].modifiedAt).getTime();
      if (age < 20 * 60 * 60 * 1000) return { skipped: true, reason: 'recent' };
    }
    // Millisecond precision prevents rapid automatic or safety backups from
    // overwriting each other when they are created within the same second.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(this.backupDirectory, `${AUTO_PREFIX}${stamp}${AUTO_SUFFIX}`);
    const result = await this.writeBackup(destination, { reason: 'auto' });
    await this.pruneAutoBackups(settings.backupRetention);
    return { skipped: false, ...result };
  }

  async listAutoBackups() {
    try {
      const entries = await fsp.readdir(this.backupDirectory, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.startsWith(AUTO_PREFIX) || !entry.name.endsWith(AUTO_SUFFIX)) continue;
        const filePath = path.join(this.backupDirectory, entry.name);
        const stats = await fsp.stat(filePath);
        items.push({ path: filePath, name: entry.name, sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() });
      }
      return items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    } catch {
      return [];
    }
  }

  async pruneAutoBackups(retention = 8) {
    const items = await this.listAutoBackups();
    const extra = items.slice(Math.max(3, retention));
    for (const item of extra) {
      try {
        await fsp.unlink(item.path);
      } catch (error) {
        this.logger.warn(`Could not prune backup ${item.name}`, error);
      }
    }
    return { removed: extra.length };
  }

  async restore(filePath) {
    let stats;
    try {
      stats = await fsp.stat(filePath);
    } catch {
      throw new AppError('The selected backup file could not be opened.', 'BACKUP_UNREADABLE');
    }
    if (stats.size > MAX_BACKUP_BYTES) {
      throw new ValidationError('The selected backup is too large to restore safely.');
    }
    let parsed;
    try {
      parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch {
      throw new ValidationError('The selected backup is not valid JSON.');
    }
    assertBackupShape(parsed);
    const tables = sanitiseTables(parsed.tables);
    const safety = await this.createAutoBackup({ force: true });
    this.repo.restoreTables(tables);
    this.repo.ensureDefaults();
    this.repo.logActivity({
      kind: 'backup',
      message: 'Backup restored',
      detail: {
        restoredFrom: path.basename(filePath),
        safetyBackup: safety.path ? path.basename(safety.path) : null,
        counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
      },
    });
    return {
      restoredAt: new Date().toISOString(),
      safetyBackupPath: safety.path || null,
      counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
      sourceVersion: parsed.appVersion || 'unknown',
    };
  }

  async stats() {
    const database = this.db.stats();
    const autoBackups = await this.listAutoBackups();
    return {
      ...database,
      backupDirectory: this.backupDirectory,
      autoBackups: autoBackups.slice(0, 12),
      autoBackupCount: autoBackups.length,
      autoBackupBytes: autoBackups.reduce((total, backup) => total + backup.sizeBytes, 0),
    };
  }
}
