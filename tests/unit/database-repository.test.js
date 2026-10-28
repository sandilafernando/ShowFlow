import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ShowFlowDatabase } from '../../electron/db/database.js';
import { runMigrations } from '../../electron/db/migrations.js';
import { Repository } from '../../electron/db/repository.js';
import {
  SQL_WASM_PATH,
  createTestContext,
  cueInput,
  eventInput,
  silentLogger,
} from './helpers.js';

const contexts = [];

async function context() {
  const value = await createTestContext();
  contexts.push(value);
  return value;
}

afterEach(async () => {
  while (contexts.length) await contexts.pop().cleanup();
});

describe('database migrations', () => {
  it('creates the full schema and records the user_version exactly once', async () => {
    const { db } = await context();
    expect(db.get('PRAGMA user_version;').user_version).toBe(1);
    const tables = db
      .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
      .map((row) => row.name);
    for (const table of [
      'activity',
      'assignments',
      'checklists',
      'cues',
      'displays',
      'events',
      'media_assets',
      'operators',
      'settings',
    ]) {
      expect(tables).toContain(table);
    }
    expect(runMigrations(db, silentLogger)).toEqual({ current: 1, applied: [] });
  });

  it('keeps data and migration version after a close and reopen', async () => {
    const first = await context();
    const event = first.repo.createEvent(eventInput({ title: 'Persistent event' }));
    first.repo.createCue(event.id, cueInput({ title: 'Persistent cue' }));
    first.db.close();

    const reopened = new ShowFlowDatabase({
      filePath: first.filePath,
      wasmPath: SQL_WASM_PATH,
      logger: silentLogger,
    });
    await reopened.init();
    const migration = runMigrations(reopened, silentLogger);
    const repo = new Repository(reopened, silentLogger);
    repo.ensureDefaults();
    const loaded = repo.getEvent(event.id);
    expect(migration).toEqual({ current: 1, applied: [] });
    expect(loaded.title).toBe('Persistent event');
    expect(loaded.cues).toHaveLength(1);
    reopened.close();
  });
});

describe('settings and activity', () => {
  it('stores normalised settings and the integration configuration independently', async () => {
    const { repo } = await context();
    expect(repo.getSettings()).toMatchObject({
      onboardingComplete: false,
      receiverPort: 41730,
      autoBackup: true,
      backupRetention: 8,
    });
    const updated = repo.updateSettings({ operatorName: '  Sandila ', receiverPort: 43000 });
    expect(updated.operatorName).toBe('Sandila');
    expect(updated.receiverPort).toBe(43000);
    expect(repo.getSettings().receiverPort).toBe(43000);

    const integration = repo.saveIntegration({ mode: 'resolume', host: '10.0.0.9', port: 7000, enabled: true });
    expect(integration).toMatchObject({ mode: 'resolume', host: '10.0.0.9', port: 7000, enabled: true });
    expect(repo.getIntegration().enabled).toBe(true);
  });

  it('filters activity by event, kind and search while keeping safe JSON details', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput({ title: 'Activity event' }));
    repo.logActivity({
      eventId: event.id,
      kind: 'cue',
      message: 'Cue started',
      detail: { cue: 'Opening' },
    });
    repo.logActivity({ kind: 'system', message: 'Unrelated system note' });

    const filtered = repo.listActivity({ eventId: event.id, kind: 'cue' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]).toMatchObject({
      eventId: event.id,
      eventTitle: 'Activity event',
      kind: 'cue',
      detail: { cue: 'Opening' },
    });
    expect(repo.listActivity({ search: 'Unrelated' }).total).toBe(1);
    expect(repo.listActivity({ limit: 1 }).items).toHaveLength(1);
  });
});

describe('event and cue lifecycle', () => {
  it('creates events, auto-arms the first cue and enforces a consistent running order', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput({ title: 'Prize Day' }));
    expect(event).toMatchObject({ title: 'Prize Day', status: 'draft', armedCueId: null });
    expect(event.cues).toEqual([]);

    const first = repo.createCue(event.id, cueInput({ title: 'Pre-roll' }));
    const second = repo.createCue(event.id, cueInput({ title: 'Walk-in' }));
    const third = repo.createCue(event.id, cueInput({ title: 'Welcome' }));
    expect(repo.getEvent(event.id).armedCueId).toBe(first.id);
    expect([first.sortIndex, second.sortIndex, third.sortIndex]).toEqual([0, 1, 2]);

    const reordered = repo.reorderCues(event.id, [third.id, first.id, second.id]);
    expect(reordered.map((cue) => cue.id)).toEqual([third.id, first.id, second.id]);
    expect(() => repo.reorderCues(event.id, [third.id, first.id])).toThrow(/running order changed/i);

    const updated = repo.updateCue(second.id, cueInput({ title: 'Walk-in revised', durationSeconds: 120 }));
    expect(updated.title).toBe('Walk-in revised');
    expect(updated.durationSeconds).toBe(120);

    repo.deleteCue(third.id);
    expect(repo.getEvent(event.id).cues).toHaveLength(2);
  });

  it('blocks cue edits and destructive event actions while an event is live', async () => {
    const { repo } = await context();
    const empty = repo.createEvent(eventInput({ title: 'Empty event' }));
    expect(() => repo.setEventRuntime(empty.id, { status: 'live' })).toThrow(/at least one cue/);

    const event = repo.createEvent(eventInput());
    const cue = repo.createCue(event.id, cueInput());
    repo.setEventRuntime(event.id, { status: 'live' });
    expect(repo.getEventSummary(event.id).status).toBe('live');

    expect(() => repo.createCue(event.id, cueInput({ title: 'Too late' }))).toThrow(/locked while the event is live/);
    expect(() => repo.updateCue(cue.id, cueInput({ title: 'Too late' }))).toThrow(/locked/);
    expect(() => repo.deleteCue(cue.id)).toThrow(/locked/);
    expect(() => repo.deleteEvent(event.id)).toThrow(/End the live session/);
    expect(() => repo.setEventArchived(event.id, true)).toThrow(/End the live session/);

    repo.setEventRuntime(event.id, { status: 'completed' });
    expect(repo.getEventSummary(event.id).liveCueId).toBeNull();
    expect(() => repo.updateCue(cue.id, cueInput({ title: 'After show' }))).not.toThrow();
  });

  it('rejects cues that belong to a different event or an invalid status', async () => {
    const { repo } = await context();
    const first = repo.createEvent(eventInput({ title: 'First' }));
    const second = repo.createEvent(eventInput({ title: 'Second' }));
    const firstCue = repo.createCue(first.id, cueInput());
    const secondCue = repo.createCue(second.id, cueInput());
    expect(() =>
      repo.setEventRuntime(first.id, { status: 'live', armedCueId: secondCue.id }),
    ).toThrow(/does not belong/);
    expect(() =>
      repo.setEventRuntime(first.id, { status: 'live', liveCueId: secondCue.id }),
    ).toThrow(/does not belong/);
    expect(() => repo.setEventRuntime(first.id, { status: 'nope' })).toThrow(/Invalid event status/);
    repo.setEventRuntime(first.id, { status: 'live', armedCueId: firstCue.id });
    expect(repo.getEventSummary(first.id).armedCueId).toBe(firstCue.id);
  });

  it('marks a live session interrupted on recovery without replaying commands', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput({ title: 'Interrupted show' }));
    const cue = repo.createCue(event.id, cueInput());
    repo.setEventRuntime(event.id, { status: 'live', liveCueId: cue.id });
    expect(repo.getEventSummary(event.id).liveCueId).toBe(cue.id);

    expect(repo.recoverInterruptedSessions()).toBe(1);
    const recovered = repo.getEventSummary(event.id);
    expect(recovered.status).toBe('interrupted');
    expect(recovered.liveCueId).toBeNull();
    const activity = repo.listActivity({ eventId: event.id, kind: 'system' });
    expect(activity.items.some((item) => /no production commands were replayed/i.test(item.message))).toBe(true);
    expect(() => repo.updateCue(cue.id, cueInput({ title: 'Editable again' }))).not.toThrow();
  });

  it('marks a rehearsal session interrupted on recovery without replaying commands', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput({ title: 'Interrupted rehearsal' }));
    const cue = repo.createCue(event.id, cueInput());
    repo.setEventRuntime(event.id, { status: 'rehearsal', liveCueId: cue.id });
    expect(repo.getEventSummary(event.id).liveCueId).toBe(cue.id);

    expect(repo.recoverInterruptedSessions()).toBe(1);
    const recovered = repo.getEventSummary(event.id);
    expect(recovered.status).toBe('interrupted');
    expect(recovered.liveCueId).toBeNull();
    const activity = repo.listActivity({ eventId: event.id, kind: 'system' });
    expect(activity.items.some((item) => /restarted during rehearsal/i.test(item.message))).toBe(true);
    expect(activity.items.some((item) => /no production commands were replayed/i.test(item.message))).toBe(true);
  });

  it('duplicates an event as a draft with fresh cue identifiers', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput({ title: 'Original' }));
    const cue = repo.createCue(event.id, cueInput({ title: 'Original cue' }));
    const copy = repo.duplicateEvent(event.id);
    expect(copy.title).toBe('Original (copy)');
    expect(copy.status).toBe('draft');
    expect(copy.cues).toHaveLength(1);
    expect(copy.cues[0].id).not.toBe(cue.id);
    expect(copy.cues[0].title).toBe('Original cue');
    expect(copy.armedCueId).toBe(copy.cues[0].id);
  });

  it('archives and restores events, but refuses to edit an archived event', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput({ title: 'Archive me' }));
    const cue = repo.createCue(event.id, cueInput());
    repo.setEventArchived(event.id, true);
    expect(repo.getEventSummary(event.id).archived).toBe(true);
    expect(repo.listEvents()).toHaveLength(0);
    expect(repo.listEvents({ includeArchived: true })).toHaveLength(1);
    expect(() => repo.updateCue(cue.id, cueInput())).toThrow(/archived/i);
    expect(() => repo.setEventRuntime(event.id, { status: 'rehearsal' })).toThrow(/Archived/);
    repo.setEventArchived(event.id, false);
    expect(repo.listEvents()).toHaveLength(1);
  });
});

describe('media, crew and displays', () => {
  it('tracks missing and recovered media without touching files', async () => {
    const { repo } = await context();
    const first = path.join('C:\\Media', 'opening.mp4');
    const second = path.join('C:\\Media', 'walk-in.mp4');
    const added = repo.addMediaRecords([
      { path: first, name: 'opening.mp4', kind: 'video', sizeBytes: 10, tags: ['open'] },
      { path: second, name: 'walk-in.mp4', kind: 'video', sizeBytes: 20 },
    ]);
    expect(added).toEqual({ added: 2, skipped: 0 });
    expect(repo.addMediaRecords([{ path: first, name: 'duplicate', kind: 'video' }])).toEqual({
      added: 0,
      skipped: 1,
    });

    const [asset] = repo.listMedia().items;
    expect(asset.available).toBe(true);
    const missing = repo.updateMediaAvailability([{ id: asset.id, available: false }]);
    expect(missing).toEqual({ newlyMissing: 1, recovered: 0, checked: 1 });
    expect(repo.getMedia(asset.id).missingSince).toBeTruthy();
    expect(repo.listMedia({ availability: 'missing' }).items).toHaveLength(1);

    const recovered = repo.updateMediaAvailability([{ id: asset.id, available: true }]);
    expect(recovered.recovered).toBe(1);
    expect(repo.getMedia(asset.id).missingSince).toBeNull();
    expect(repo.listMedia({ availability: 'missing' }).items).toHaveLength(0);
  });

  it('prevents relinking two library records to the same file', async () => {
    const { repo } = await context();
    const first = path.join('C:\\Media', 'a.mp4');
    const second = path.join('C:\\Media', 'b.mp4');
    repo.addMediaRecords([
      { path: first, name: 'a.mp4', kind: 'video' },
      { path: second, name: 'b.mp4', kind: 'video' },
    ]);
    const [a, b] = repo.listMedia().items;
    expect(() => repo.relinkMedia(a.id, b.path, { sizeBytes: 1 })).toThrow(/already points to that file/);
  });

  it('records operators, assignments and checklists against an event', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput());
    const operator = repo.saveOperator({ name: 'Nimal', role: 'audio', contact: 'ext 12', active: true });
    const assignment = repo.saveAssignment({
      eventId: event.id,
      operatorId: operator.id,
      role: 'audio',
      roleLabel: '',
      notes: '',
    });
    expect(assignment.operatorName).toBe('Nimal');
    expect(repo.deleteOperator(operator.id)).toEqual({ id: operator.id });
    expect(repo.getEvent(event.id).assignments[0].operatorId).toBeNull();

    const checklist = repo.saveChecklist({
      eventId: event.id,
      kind: 'setup',
      title: 'Test projector',
      owner: 'Display',
      done: false,
    });
    const done = repo.saveChecklist({ ...checklist, done: true });
    expect(done.done).toBe(true);
    expect(repo.getEvent(event.id).readiness).toMatchObject({ setupTotal: 1, setupDone: 1 });
  });

  it('generates and regenerates a six-digit pairing code', async () => {
    const { repo } = await context();
    const display = repo.saveDisplay({
      name: 'Stage left',
      purpose: 'preview',
      width: 1920,
      height: 1080,
      layout: 'minimal',
      notes: '',
      enabled: true,
    });
    expect(display.pairingCode).toMatch(/^\d{6}$/);
    const regenerated = repo.regenerateDisplayCode(display.id);
    expect(regenerated.pairingCode).toMatch(/^\d{6}$/);
    expect(repo.findByPairing(display.id, display.pairingCode)).toBeNull();
    expect(repo.findByPairing(display.id, regenerated.pairingCode).id).toBe(display.id);
    expect(repo.deleteDisplay(display.id)).toEqual({ id: display.id });
    expect(repo.listDisplays()).toEqual([]);
  });
});

describe('database file safety', () => {
  it('keeps a readable database file on disk after each mutation', async () => {
    const { repo, filePath } = await context();
    expect(fs.existsSync(filePath)).toBe(true);
    const before = fs.readFileSync(filePath);
    expect(before.subarray(0, 16).toString('utf8')).toBe('SQLite format 3\u0000');
    repo.createEvent(eventInput({ title: 'Persisted mutation' }));
    const after = fs.readFileSync(filePath);
    expect(after.length).toBeGreaterThan(0);
    expect(after.equals(before)).toBe(false);
  });
});
