import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShowFlowDatabase } from '../../electron/db/database.js';
import { runMigrations } from '../../electron/db/migrations.js';
import { Repository } from '../../electron/db/repository.js';
import { validateEventInput, validateCueInput } from '../../shared/validation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SQL_WASM_PATH = path.join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

export const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

export function makeTempDir(prefix = 'showflow-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function eventInput(overrides = {}) {
  return validateEventInput({
    title: 'Test production',
    eventDate: today(),
    startTime: '18:30',
    venue: 'Main Hall',
    description: 'Unit test event',
    ...overrides,
  });
}

export function cueInput(overrides = {}) {
  return validateCueInput({
    title: 'Opening titles',
    type: 'video',
    durationSeconds: 90,
    ...overrides,
  });
}

export async function createTestContext() {
  const dir = makeTempDir();
  const db = new ShowFlowDatabase({
    filePath: path.join(dir, 'showflow.db'),
    wasmPath: SQL_WASM_PATH,
    logger: silentLogger,
  });
  await db.init();
  runMigrations(db, silentLogger);
  const repo = new Repository(db, silentLogger);
  repo.ensureDefaults();

  return {
    dir,
    db,
    repo,
    filePath: path.join(dir, 'showflow.db'),
    async cleanup() {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function makeEventWithCues(repo, cueOverrides = [{}, {}]) {
  const event = repo.createEvent(eventInput());
  const cues = cueOverrides.map((override) => repo.createCue(event.id, cueInput(override)));
  return { event: repo.getEvent(event.id), cues };
}
