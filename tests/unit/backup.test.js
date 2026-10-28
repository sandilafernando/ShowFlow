import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupService } from '../../electron/services/backup.js';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION } from '../../shared/defaults.js';
import { createTestContext, cueInput, eventInput } from './helpers.js';

const contexts = [];

async function context() {
  const value = await createTestContext();
  contexts.push(value);
  return value;
}

afterEach(async () => {
  while (contexts.length) await contexts.pop().cleanup();
});

function serviceFor(ctx) {
  return new BackupService({
    db: ctx.db,
    repository: ctx.repo,
    appVersion: '1.0.0-test',
    userDataPath: ctx.dir,
    logger: { info() {}, warn() {}, error() {} },
  });
}

describe('backup snapshots', () => {
  it('includes a checksum over every exported table', async () => {
    const ctx = await context();
    const event = ctx.repo.createEvent(eventInput({ title: 'Backed up event' }));
    ctx.repo.createCue(event.id, cueInput());
    const service = serviceFor(ctx);
    const snapshot = service.buildSnapshot('manual');

    expect(snapshot.format).toBe(BACKUP_FORMAT);
    expect(snapshot.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(snapshot.appVersion).toBe('1.0.0-test');
    expect(snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.counts.events).toBe(1);
    expect(snapshot.counts.cues).toBe(1);
    expect(snapshot.tables.events[0].title).toBe('Backed up event');
    expect(snapshot.tables.activity.some((row) => row.message.includes('Event created'))).toBe(true);

    const recomputed = crypto
      .createHash('sha256')
      .update(JSON.stringify(snapshot.tables))
      .digest('hex');
    expect(snapshot.checksum).toBe(recomputed);
  });

  it('writes a human-readable atomic backup file and logs the action', async () => {
    const ctx = await context();
    ctx.repo.createEvent(eventInput({ title: 'Atomic event' }));
    const service = serviceFor(ctx);
    const destination = path.join(ctx.dir, 'exports', 'manual.showflow-backup');
    const result = await service.writeBackup(destination, { reason: 'manual' });

    expect(result.path).toBe(destination);
    expect(result.sizeBytes).toBeGreaterThan(0);
    const raw = await fsp.readFile(destination, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(raw);
    expect(parsed.tables.events[0].title).toBe('Atomic event');
    expect(fs.existsSync(`${destination}.tmp-${process.pid}`)).toBe(false);
    expect(ctx.repo.listActivity({ kind: 'backup' }).items[0].message).toMatch(/Backup created/);
  });
});

describe('backup restore', () => {
  it('restores a full snapshot and creates a safety backup first', async () => {
    const ctx = await context();
    const original = ctx.repo.createEvent(eventInput({ title: 'Original event' }));
    ctx.repo.createCue(original.id, cueInput({ title: 'Original cue' }));
    ctx.repo.updateSettings({ operatorName: 'Original operator' });
    const service = serviceFor(ctx);
    const file = path.join(ctx.dir, 'roundtrip.showflow-backup');
    await service.writeBackup(file);

    const extra = ctx.repo.createEvent(eventInput({ title: 'Should disappear' }));
    ctx.repo.createCue(extra.id, cueInput({ title: 'Should disappear too' }));
    ctx.repo.updateSettings({ operatorName: 'Changed operator' });
    expect(ctx.repo.listEvents()).toHaveLength(2);

    const result = await service.restore(file);
    expect(result.counts.events).toBe(1);
    expect(result.counts.cues).toBe(1);
    expect(result.safetyBackupPath).toBeTruthy();
    expect(fs.existsSync(result.safetyBackupPath)).toBe(true);

    const safety = JSON.parse(await fsp.readFile(result.safetyBackupPath, 'utf8'));
    expect(safety.tables.events.some((row) => row.title === 'Should disappear')).toBe(true);

    const events = ctx.repo.listEvents();
    expect(events.map((event) => event.title)).toEqual(['Original event']);
    expect(ctx.repo.getEvent(original.id).cues[0].title).toBe('Original cue');
    expect(ctx.repo.getSettings().operatorName).toBe('Original operator');

    const restoredLog = ctx.repo.listActivity({ kind: 'backup' }).items[0];
    expect(restoredLog.message).toBe('Backup restored');
  });

  it('rejects a tampered backup before touching live data', async () => {
    const ctx = await context();
    ctx.repo.createEvent(eventInput({ title: 'Protected event' }));
    const service = serviceFor(ctx);
    const file = path.join(ctx.dir, 'tampered.showflow-backup');
    await service.writeBackup(file);

    const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
    parsed.tables.events[0].title = 'Tampered event';
    await fsp.writeFile(file, JSON.stringify(parsed), 'utf8');

    await expect(service.restore(file)).rejects.toThrow(/checksum does not match/i);
    expect(ctx.repo.listEvents().map((event) => event.title)).toEqual(['Protected event']);
    expect(fs.existsSync(path.join(ctx.dir, 'backups'))).toBe(true);
    expect(await service.listAutoBackups()).toHaveLength(0);
  });

  it('rejects malformed JSON, wrong formats, wrong versions and missing tables', async () => {
    const ctx = await context();
    const service = serviceFor(ctx);

    const invalidJson = path.join(ctx.dir, 'invalid-json.showflow-backup');
    await fsp.writeFile(invalidJson, '{not json', 'utf8');
    await expect(service.restore(invalidJson)).rejects.toThrow(/not valid JSON/);

    const wrongFormat = path.join(ctx.dir, 'wrong-format.showflow-backup');
    await fsp.writeFile(
      wrongFormat,
      JSON.stringify({ format: 'something-else', schemaVersion: BACKUP_SCHEMA_VERSION, tables: {} }),
      'utf8',
    );
    await expect(service.restore(wrongFormat)).rejects.toThrow(/not a ShowFlow backup/);

    const wrongVersion = path.join(ctx.dir, 'wrong-version.showflow-backup');
    await fsp.writeFile(
      wrongVersion,
      JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 99, tables: {} }),
      'utf8',
    );
    await expect(service.restore(wrongVersion)).rejects.toThrow(/schema version 99/);

    const missingTables = path.join(ctx.dir, 'missing-tables.showflow-backup');
    await fsp.writeFile(
      missingTables,
      JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION }),
      'utf8',
    );
    await expect(service.restore(missingTables)).rejects.toThrow(/no data tables/);

    await expect(service.restore(path.join(ctx.dir, 'does-not-exist.showflow-backup'))).rejects.toMatchObject({
      code: 'BACKUP_UNREADABLE',
    });
  });

  it('creates and prunes automatic backups without altering manual backups', async () => {
    const ctx = await context();
    ctx.repo.createEvent(eventInput({ title: 'Auto backup event' }));
    ctx.repo.updateSettings({ autoBackup: true, backupRetention: 3 });
    const service = serviceFor(ctx);

    for (let index = 0; index < 5; index += 1) {
      const result = await service.createAutoBackup({ force: true });
      expect(result.skipped).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    const autoBackups = await service.listAutoBackups();
    expect(autoBackups).toHaveLength(3);
    const stats = await service.stats();
    expect(stats.autoBackupCount).toBe(3);
    expect(stats.integrity).toBe('ok');
    expect(stats.counts.events).toBe(1);
  });
});
