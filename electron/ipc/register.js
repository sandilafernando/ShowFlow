import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { dialog, ipcMain, shell } from 'electron';
import IPC from '../../shared/ipc.cjs';
import {
  MEDIA_LIBRARY_FORMAT,
  MEDIA_LIBRARY_SCHEMA_VERSION,
} from '../../shared/defaults.js';
import { CUE_TYPE_MAP, EVENT_STATUS } from '../../shared/enums.js';
import { ALL_MEDIA_EXTENSIONS, isSupportedMediaPath, mediaKindForPath } from '../../shared/media-types.js';
import {
  ValidationError,
  assertObject,
  boolean,
  id,
  idList,
  integer,
  optionalId,
  text,
  validateActivityEntry,
  validateAssignmentInput,
  validateChecklistInput,
  validateCueInput,
  validateDisplayInput,
  validateEventInput,
  validateIntegrationConfig,
  validateMediaImportRecord,
  validateMediaUpdate,
  validateOperatorInput,
  validateProbeResult,
  validateSettingsPatch,
} from '../../shared/validation.js';
import { AppError } from '../errors.js';
import {
  buildMediaRecords,
  checkMediaAvailability,
  findRelinkMatches,
  statSingleFile,
} from '../services/media.js';
import {
  buildEventPlan,
  importEventPlan,
  parseEventPlanJson,
  serialiseEventPlan,
} from '../services/event-plan.js';
import {
  buildRunSheetHtml,
  buildRunSheetText,
  writeRunSheetFile,
} from '../services/runsheet.js';

const SAVE_FILTER_MEDIA = [
  { name: 'Supported media', extensions: ALL_MEDIA_EXTENSIONS.map((extension) => extension.slice(1)) },
  { name: 'All files', extensions: ['*'] },
];

const TEST_PATTERNS = ['bars', 'grid', 'white', 'black', 'label'];

const EXTERNAL_HOSTS = new Set([
  'resolume.com',
  'github.com',
  'electronjs.org',
  'react.dev',
  'tailwindcss.com',
  'lucide.dev',
  'motion.dev',
  'vite.dev',
  'sql.js.org',
]);

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function safeFilename(value) {
  return String(value || 'ShowFlow')
    // Control characters are stripped deliberately from user-supplied filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'ShowFlow';
}

function validateTarget(raw) {
  if (raw === undefined || raw === null) return { purpose: 'live' };
  const input = assertObject(raw, 'Display target');
  if (input.all === true) return {};
  if (input.displayId) return { displayId: id(input.displayId, 'Display') };
  if (input.purpose) {
    if (!['live', 'preview'].includes(input.purpose)) throw new ValidationError('Display purpose is invalid.');
    return { purpose: input.purpose };
  }
  return { purpose: 'live' };
}

function cueForScreen(event, cue) {
  if (!cue) return null;
  const index = event.cues.findIndex((item) => item.id === cue.id);
  return {
    number: index + 1,
    title: cue.title,
    typeLabel: CUE_TYPE_MAP[cue.type]?.label || cue.type,
    durationSeconds: cue.durationSeconds,
  };
}

function buildScreenContent(event) {
  const live = event.liveCueId ? event.cues.find((cue) => cue.id === event.liveCueId) : null;
  const armed = event.armedCueId ? event.cues.find((cue) => cue.id === event.armedCueId) : null;
  const current = live;
  const next = current ? (armed && armed.id !== current.id ? armed : null) : armed;
  return {
    eventId: event.id,
    eventTitle: event.title,
    venue: event.venue,
    currentCue: cueForScreen(event, current),
    nextCue: cueForScreen(event, next),
    rehearsal: event.status === EVENT_STATUS.REHEARSAL,
    mode: event.status,
    totalCues: event.cues.length,
  };
}

function validateDisplaySave(raw) {
  const input = assertObject(raw, 'Display');
  const displayId = input.id ? id(input.id, 'Display') : null;
  return { displayId, input: validateDisplayInput(input) };
}

function requireDisplayId(raw, field = 'Display') {
  return id(raw, field);
}

export function registerIpcHandlers({
  getMainWindow,
  repository,
  backupService,
  receiver,
  integrationService,
  appVersion,
  userDataPath,
  documentsPath,
  isPackaged,
  logger,
}) {
  const activeHandlers = new Set();

  function assertTrustedSender(event) {
    const window = getMainWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents) {
      throw new AppError('The request did not come from the ShowFlow window.', 'UNTRUSTED_SENDER');
    }
    if (event.senderFrame?.parent) {
      throw new AppError('Requests from embedded frames are not allowed.', 'UNTRUSTED_FRAME');
    }
  }

  function handle(channel, handler) {
    if (!Object.values(IPC).includes(channel)) {
      throw new Error(`Attempted to register an unknown IPC channel: ${channel}`);
    }
    activeHandlers.add(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        assertTrustedSender(event);
        const data = await handler(...args);
        return { ok: true, data };
      } catch (error) {
        if (error instanceof ValidationError) {
          return {
            ok: false,
            error: { code: error.code || 'VALIDATION', message: error.message, details: error.details || null },
          };
        }
        if (error instanceof AppError) {
          return {
            ok: false,
            error: { code: error.code, message: error.message, details: error.details || null },
          };
        }
        logger.error(`Unhandled IPC error on ${channel}`, error);
        return {
          ok: false,
          error: {
            code: 'INTERNAL',
            message:
              'ShowFlow could not complete that action. Your saved data is intact. Check the log in Settings → Data if this repeats.',
            details: null,
          },
        };
      }
    });
  }

  async function chooseSavePath({ title, defaultName, filters }) {
    const window = getMainWindow();
    const result = await dialog.showSaveDialog(window || undefined, {
      title,
      defaultPath: path.join(documentsPath, defaultName),
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  }

  async function chooseOpenPath({ title, filters, properties = ['openFile'] }) {
    const window = getMainWindow();
    const result = await dialog.showOpenDialog(window || undefined, {
      title,
      filters,
      properties,
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  }

  // --------------------------------------------------------------------- app
  handle(IPC.APP_INFO, async () => ({
    name: 'ShowFlow',
    version: appVersion,
    platform: process.platform,
    arch: process.arch,
    userDataPath,
    isPackaged: Boolean(isPackaged),
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    repositoryUrl: '',
    license: 'MIT',
    helpUrl: 'https://resolume.com/support/en/osc',
  }));

  handle(IPC.APP_OPEN_EXTERNAL, async (rawUrl) => {
    const clean = text(rawUrl, 'URL', { required: true, max: 2000 });
    let parsed;
    try {
      parsed = new URL(clean);
    } catch {
      throw new ValidationError('That link is not valid.');
    }
    if (parsed.protocol !== 'https:') throw new ValidationError('Only HTTPS links can be opened.');
    if (parsed.username || parsed.password) throw new ValidationError('Links containing credentials are not allowed.');
    if (!EXTERNAL_HOSTS.has(parsed.hostname)) {
      throw new ValidationError('That external site is not on the ShowFlow documentation allowlist.');
    }
    await shell.openExternal(parsed.href);
    return { opened: true, url: parsed.href };
  });

  handle(IPC.APP_OPEN_DATA_FOLDER, async () => {
    const errorMessage = await shell.openPath(userDataPath);
    if (errorMessage) throw new AppError(`Could not open the data folder: ${errorMessage}`, 'OPEN_FAILED');
    return { opened: true, path: userDataPath };
  });

  // ------------------------------------------------------------------ setup
  handle(IPC.SETUP_COMPLETE, async (raw) => {
    const input = assertObject(raw, 'Setup');
    const patch = validateSettingsPatch(input);
    const settings = repository.updateSettings({ ...patch, onboardingComplete: true });
    repository.logActivity({ kind: 'system', message: 'Initial ShowFlow setup completed' });
    return settings;
  });

  handle(IPC.SETTINGS_GET, async () => repository.getSettings());

  handle(IPC.SETTINGS_UPDATE, async (raw) => {
    const patch = validateSettingsPatch(raw);
    const before = repository.getSettings();
    const wasRunning = receiver.getStatus().running;
    const settings = repository.updateSettings(patch);
    let warning = null;
    if (before.receiverPort !== settings.receiverPort && wasRunning) {
      try {
        await receiver.start(settings.receiverPort);
      } catch (error) {
        warning = `Settings were saved, but the receiver server could not restart on port ${settings.receiverPort}: ${error.message}`;
        logger.warn(warning);
      }
    }
    return { settings, warning };
  });

  handle(IPC.DASHBOARD_SUMMARY, async () => {
    const summary = repository.dashboard();
    return {
      ...summary,
      displays: {
        total: repository.listDisplays().filter((display) => display.enabled).length,
        connected: receiver.getStatus().connections.length,
      },
      receiver: receiver.getStatus(),
      appVersion,
    };
  });

  // ----------------------------------------------------------------- events
  handle(IPC.EVENTS_LIST, async (raw) => {
    const input = raw ? assertObject(raw, 'Event filters') : {};
    return repository.listEvents({
      includeArchived: input.includeArchived === true,
      search: text(input.search, 'Search', { max: 120 }),
      status: input.status ? Object.values(EVENT_STATUS).includes(input.status) ? input.status : null : null,
      limit: input.limit ? integer(input.limit, 'Limit', { min: 1, max: 1000 }) : 300,
    });
  });

  handle(IPC.EVENTS_GET, async (rawId) => repository.getEvent(id(rawId, 'Event')));

  handle(IPC.EVENTS_CREATE, async (raw) => {
    const input = validateEventInput(raw);
    return repository.createEvent(input);
  });

  handle(IPC.EVENTS_UPDATE, async (rawId, raw) => {
    const eventId = id(rawId, 'Event');
    const input = validateEventInput(raw);
    const existing = repository.getEventSummary(eventId);
    if (!existing) throw new AppError('That event could not be found.', 'NOT_FOUND');
    if (existing.archived) throw new AppError('Restore the archived event before editing it.', 'ARCHIVED');
    return repository.updateEvent(eventId, input);
  });

  handle(IPC.EVENTS_DUPLICATE, async (rawId) => repository.duplicateEvent(id(rawId, 'Event')));

  handle(IPC.EVENTS_ARCHIVE, async (raw) => {
    const input = assertObject(raw, 'Archive request');
    return repository.setEventArchived(id(input.eventId, 'Event'), boolean(input.archived, 'Archived'));
  });

  handle(IPC.EVENTS_DELETE, async (rawId) => repository.deleteEvent(id(rawId, 'Event')));

  handle(IPC.EVENTS_RUNTIME, async (raw) => {
    const input = assertObject(raw, 'Runtime state');
    return repository.setEventRuntime(id(input.eventId, 'Event'), {
      status: input.status,
      armedCueId: input.armedCueId ? optionalId(input.armedCueId, 'Armed cue') : undefined,
      liveCueId: input.liveCueId ? optionalId(input.liveCueId, 'Live cue') : input.liveCueId === null ? null : undefined,
    });
  });

  handle(IPC.EVENTS_EXPORT_SHEET, async (raw) => {
    const input = assertObject(raw, 'Run sheet export');
    const eventId = id(input.eventId, 'Event');
    const format = input.format === 'txt' ? 'txt' : input.format === 'html' ? 'html' : null;
    if (!format) throw new ValidationError('Run sheet format must be HTML or text.');
    const event = repository.getEvent(eventId);
    const extension = format === 'html' ? 'html' : 'txt';
    const destination = await chooseSavePath({
      title: 'Export ShowFlow run sheet',
      defaultName: `${safeFilename(event.title)}-${formatDateForFile()}.${extension}`,
      filters: format === 'html' ? [{ name: 'HTML run sheet', extensions: ['html'] }] : [{ name: 'Text run sheet', extensions: ['txt'] }],
    });
    if (!destination) return { canceled: true };
    const finalPath = destination.toLowerCase().endsWith(`.${extension}`) ? destination : `${destination}.${extension}`;
    const content =
      format === 'html'
        ? buildRunSheetHtml(event, { appVersion })
        : buildRunSheetText(event, { appVersion });
    writeRunSheetFile(finalPath, content);
    repository.logActivity({
      eventId,
      kind: 'event',
      message: `Run sheet exported as ${format.toUpperCase()}`,
      detail: { fileName: path.basename(finalPath) },
    });
    return { canceled: false, path: finalPath, format };
  });

  handle(IPC.EVENTS_EXPORT_PLAN, async (rawId) => {
    const eventId = id(rawId, 'Event');
    const event = repository.getEvent(eventId);
    const plan = buildEventPlan(event, { appVersion });
    const destination = await chooseSavePath({
      title: 'Export ShowFlow event plan',
      defaultName: `${safeFilename(event.title)}-${formatDateForFile()}.showflow-plan.json`,
      filters: [{ name: 'ShowFlow event plan', extensions: ['json'] }],
    });
    if (!destination) return { canceled: true };
    const finalPath = destination.toLowerCase().endsWith('.json') ? destination : `${destination}.json`;
    await fsp.writeFile(finalPath, serialiseEventPlan(plan), 'utf8');
    repository.logActivity({
      eventId,
      kind: 'event',
      message: 'Event plan exported',
      detail: { fileName: path.basename(finalPath), warnings: plan.warnings.length },
    });
    return { canceled: false, path: finalPath, warnings: plan.warnings };
  });

  handle(IPC.EVENTS_IMPORT_PLAN, async () => {
    const source = await chooseOpenPath({
      title: 'Import ShowFlow event plan',
      filters: [{ name: 'ShowFlow event plan', extensions: ['json'] }],
    });
    if (!source) return { canceled: true };
    const raw = await fsp.readFile(source, 'utf8');
    const plan = parseEventPlanJson(raw);
    const result = importEventPlan(plan, repository);
    return { canceled: false, event: result.event, warnings: result.warnings, source: path.basename(source) };
  });

  // -------------------------------------------------------------------- cues
  handle(IPC.CUES_CREATE, async (raw) => {
    const input = assertObject(raw, 'Cue request');
    const eventId = id(input.eventId, 'Event');
    return repository.createCue(eventId, validateCueInput(input.cue));
  });

  handle(IPC.CUES_UPDATE, async (raw) => {
    const input = assertObject(raw, 'Cue request');
    return repository.updateCue(id(input.id, 'Cue'), validateCueInput(input.cue));
  });

  handle(IPC.CUES_DELETE, async (rawId) => repository.deleteCue(id(rawId, 'Cue')));

  handle(IPC.CUES_REORDER, async (raw) => {
    const input = assertObject(raw, 'Running order');
    return repository.reorderCues(id(input.eventId, 'Event'), idList(input.orderedIds, 'Cue order'));
  });

  // ------------------------------------------------------------------- media
  handle(IPC.MEDIA_LIST, async (raw) => {
    const input = raw ? assertObject(raw, 'Media filters') : {};
    const kinds = ['video', 'audio', 'image', 'presentation', 'document', 'other'];
    return repository.listMedia({
      search: text(input.search, 'Search', { max: 200 }),
      kind: kinds.includes(input.kind) ? input.kind : null,
      eventId: input.eventId === 'unassigned' ? 'unassigned' : input.eventId ? id(input.eventId, 'Event') : null,
      tag: input.tag ? text(input.tag, 'Tag', { max: 32 }) : null,
      availability: ['missing', 'available', 'unlinked'].includes(input.availability) ? input.availability : null,
      sort: ['name', 'recent', 'size', 'missing'].includes(input.sort) ? input.sort : 'name',
      limit: input.limit ? integer(input.limit, 'Limit', { min: 1, max: 5000 }) : 3000,
    });
  });

  handle(IPC.MEDIA_ADD_FILES, async (raw) => {
    const input = raw ? assertObject(raw, 'Media import') : {};
    const eventId = input.eventId ? id(input.eventId, 'Event') : null;
    const window = getMainWindow();
    const result = await dialog.showOpenDialog(window || undefined, {
      title: 'Add media files to MediaVault',
      filters: SAVE_FILTER_MEDIA,
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const collected = await buildMediaRecords(result.filePaths, { recursive: false });
    const addResult = repository.addMediaRecords(collected.records, { eventId });
    return { canceled: false, ...addResult, filesFound: collected.records.length, errors: collected.errors };
  });

  handle(IPC.MEDIA_ADD_FOLDER, async (raw) => {
    const input = raw ? assertObject(raw, 'Media import') : {};
    const eventId = input.eventId ? id(input.eventId, 'Event') : null;
    const window = getMainWindow();
    const result = await dialog.showOpenDialog(window || undefined, {
      title: 'Index a media folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const collected = await buildMediaRecords(result.filePaths, { recursive: true });
    const addResult = repository.addMediaRecords(collected.records, { eventId });
    return {
      canceled: false,
      ...addResult,
      filesFound: collected.records.length,
      errors: collected.errors,
      truncated: collected.truncated,
    };
  });

  handle(IPC.MEDIA_CHECK_ALL, async () => {
    const assets = repository.listMedia({ limit: 5000 }).items;
    const results = await checkMediaAvailability(assets);
    const summary = repository.updateMediaAvailability(results);
    return { ...summary, total: assets.length };
  });

  handle(IPC.MEDIA_RELINK, async (rawId) => {
    const assetId = id(rawId, 'Media asset');
    const asset = repository.getMedia(assetId);
    if (!asset) throw new AppError('That media item could not be found.', 'NOT_FOUND');
    const selected = await chooseOpenPath({
      title: `Relink “${asset.name}”`,
      filters: SAVE_FILTER_MEDIA,
    });
    if (!selected) return { canceled: true };
    if (!isSupportedMediaPath(selected)) throw new ValidationError('That file type is not supported by MediaVault.');
    const info = await statSingleFile(selected).catch(() => {
      throw new ValidationError('The selected file could not be read.');
    });
    const updated = repository.relinkMedia(assetId, path.resolve(selected), info);
    return { canceled: false, asset: updated };
  });

  handle(IPC.MEDIA_RELINK_FOLDER, async () => {
    const missing = repository.listMedia({ availability: 'missing', limit: 5000 }).items;
    if (!missing.length) return { relinked: 0, scanned: 0, ambiguous: [], unresolved: [], message: 'No missing files to relink.' };
    const folder = await chooseOpenPath({
      title: 'Search a folder for missing media',
      properties: ['openDirectory'],
    });
    if (!folder) return { canceled: true };
    const result = await findRelinkMatches(folder, missing);
    const relinked = repository.relinkMediaBatch(result.matches);
    return {
      canceled: false,
      ...relinked,
      scanned: result.scanned,
      truncated: result.truncated,
      ambiguous: result.ambiguous,
      unresolved: result.unresolved,
      note: 'ShowFlow only updates library paths. Original files are never moved, renamed, or deleted.',
    };
  });

  handle(IPC.MEDIA_REMOVE, async (rawId) => repository.removeMedia(id(rawId, 'Media asset')));

  handle(IPC.MEDIA_UPDATE, async (raw) => {
    const input = assertObject(raw, 'Media update');
    return repository.updateMedia(id(input.id, 'Media asset'), validateMediaUpdate(input.patch));
  });

  handle(IPC.MEDIA_PROBE, async (raw) => {
    const input = assertObject(raw, 'Media metadata');
    return repository.updateMediaProbe(id(input.id, 'Media asset'), validateProbeResult(input.probe));
  });

  handle(IPC.MEDIA_EXPORT, async () => {
    const data = repository.listMedia({ limit: 5000 });
    const destination = await chooseSavePath({
      title: 'Export MediaVault metadata',
      defaultName: `ShowFlow-Media-Library-${timestampForFile()}.json`,
      filters: [{ name: 'JSON metadata', extensions: ['json'] }],
    });
    if (!destination) return { canceled: true };
    const finalPath = destination.toLowerCase().endsWith('.json') ? destination : `${destination}.json`;
    const payload = {
      format: MEDIA_LIBRARY_FORMAT,
      schemaVersion: MEDIA_LIBRARY_SCHEMA_VERSION,
      appVersion,
      exportedAt: new Date().toISOString(),
      assets: data.items.map((asset) => ({
        path: asset.path,
        name: asset.name,
        kind: asset.kind,
        tags: asset.tags,
        category: asset.category,
        notes: asset.notes,
      })),
    };
    await fsp.writeFile(finalPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    repository.logActivity({
      kind: 'media',
      message: `MediaVault metadata exported (${payload.assets.length} items)`,
      detail: { fileName: path.basename(finalPath) },
    });
    return { canceled: false, path: finalPath, count: payload.assets.length };
  });

  handle(IPC.MEDIA_IMPORT, async () => {
    const source = await chooseOpenPath({
      title: 'Import MediaVault metadata',
      filters: [{ name: 'JSON metadata', extensions: ['json'] }],
    });
    if (!source) return { canceled: true };
    const stats = await fsp.stat(source);
    if (stats.size > 10 * 1024 * 1024) throw new ValidationError('That metadata file is too large to import.');
    let parsed;
    try {
      parsed = JSON.parse(await fsp.readFile(source, 'utf8'));
    } catch {
      throw new ValidationError('The metadata file is not valid JSON.');
    }
    if (parsed?.format !== MEDIA_LIBRARY_FORMAT) throw new ValidationError('This is not a ShowFlow MediaVault metadata file.');
    if (parsed.schemaVersion !== MEDIA_LIBRARY_SCHEMA_VERSION) {
      throw new ValidationError('This metadata file uses an unsupported schema version.');
    }
    if (!Array.isArray(parsed.assets)) throw new ValidationError('The metadata file has no asset list.');
    if (parsed.assets.length > 5000) throw new ValidationError('The metadata file contains too many assets.');
    const newRecords = [];
    let updated = 0;
    let missing = 0;
    let unsupported = 0;
    let invalid = 0;
    const warnings = [];
    for (const rawRecord of parsed.assets) {
      let record;
      try {
        record = validateMediaImportRecord(rawRecord);
      } catch (error) {
        invalid += 1;
        if (warnings.length < 20) warnings.push(error.message);
        continue;
      }
      if (!isSupportedMediaPath(record.path)) {
        unsupported += 1;
        continue;
      }
      let fileStats;
      try {
        fileStats = await fsp.stat(record.path);
        if (!fileStats.isFile()) throw new Error('not a file');
      } catch {
        missing += 1;
        continue;
      }
      const existing = repository.getMediaByPath(record.path);
      if (existing) {
        repository.updateMedia(existing.id, {
          name: record.name,
          tags: record.tags,
          category: record.category,
          notes: record.notes,
        });
        updated += 1;
      } else {
        newRecords.push({
          ...record,
          kind: mediaKindForPath(record.path),
          sizeBytes: fileStats.size,
        });
      }
    }
    const added = repository.addMediaRecords(newRecords);
    repository.logActivity({
      kind: 'media',
      message: `MediaVault metadata imported: ${added.added} added, ${updated} updated, ${missing} files unavailable`,
      detail: { added: added.added, updated, missing, unsupported, invalid },
    });
    return {
      canceled: false,
      added: added.added,
      skippedExisting: added.skipped,
      updated,
      missing,
      unsupported,
      invalid,
      warnings,
    };
  });

  handle(IPC.MEDIA_OPEN, async (rawId) => {
    const asset = repository.getMedia(id(rawId, 'Media asset'));
    if (!asset) throw new AppError('That media item could not be found.', 'NOT_FOUND');
    try {
      const stats = await fsp.stat(asset.path);
      if (!stats.isFile()) throw new Error('not a file');
    } catch {
      throw new AppError('The media file is unavailable at its indexed path.', 'MEDIA_MISSING');
    }
    const errorMessage = await shell.openPath(asset.path);
    if (errorMessage) throw new AppError(`Could not open the media file: ${errorMessage}`, 'OPEN_FAILED');
    return { opened: true };
  });

  handle(IPC.MEDIA_REVEAL, async (rawId) => {
    const asset = repository.getMedia(id(rawId, 'Media asset'));
    if (!asset) throw new AppError('That media item could not be found.', 'NOT_FOUND');
    if (!fs.existsSync(asset.path)) throw new AppError('The media file is unavailable at its indexed path.', 'MEDIA_MISSING');
    shell.showItemInFolder(asset.path);
    return { revealed: true };
  });

  // -------------------------------------------------------------------- crew
  handle(IPC.OPERATORS_LIST, async () => repository.listOperators());

  handle(IPC.OPERATORS_SAVE, async (raw) => {
    const input = assertObject(raw, 'Crew member');
    const operatorId = input.id ? id(input.id, 'Crew member') : null;
    return repository.saveOperator(validateOperatorInput(input), operatorId);
  });

  handle(IPC.OPERATORS_DELETE, async (rawId) => repository.deleteOperator(id(rawId, 'Crew member')));

  handle(IPC.ASSIGNMENTS_SAVE, async (raw) => repository.saveAssignment(validateAssignmentInput(raw)));

  handle(IPC.ASSIGNMENTS_DELETE, async (rawId) => repository.deleteAssignment(id(rawId, 'Assignment')));

  handle(IPC.CHECKLISTS_SAVE, async (raw) => repository.saveChecklist(validateChecklistInput(raw)));

  handle(IPC.CHECKLISTS_DELETE, async (rawId) => repository.deleteChecklist(id(rawId, 'Checklist item')));

  // ---------------------------------------------------------------- activity
  handle(IPC.ACTIVITY_LIST, async (raw) => {
    const input = raw ? assertObject(raw, 'Activity filters') : {};
    const allowedKinds = ['event', 'cue', 'media', 'display', 'integration', 'crew', 'backup', 'system'];
    return repository.listActivity({
      eventId: input.eventId ? id(input.eventId, 'Event') : null,
      kind: allowedKinds.includes(input.kind) ? input.kind : null,
      search: text(input.search, 'Search', { max: 200 }),
      limit: input.limit ? integer(input.limit, 'Limit', { min: 1, max: 500 }) : 100,
      offset: input.offset ? integer(input.offset, 'Offset', { min: 0, max: 1000000 }) : 0,
    });
  });

  handle(IPC.ACTIVITY_LOG, async (raw) => {
    const entry = validateActivityEntry(raw);
    repository.logActivity(entry);
    return { logged: true };
  });

  // -------------------------------------------------------------- screenpilot
  handle(IPC.DISPLAYS_LIST, async () => {
    const status = receiver.getStatus();
    const connections = new Map(status.connections.map((connection) => [connection.displayId, connection]));
    const items = repository.listDisplays().map((display) => {
      const connection = connections.get(display.id) || null;
      return {
        ...display,
        connected: Boolean(connection),
        lastSeen: connection?.lastSeen || display.lastSeen,
        connection,
      };
    });
    return { items, server: status };
  });

  handle(IPC.DISPLAYS_SAVE, async (raw) => {
    const { displayId, input } = validateDisplaySave(raw);
    const display = repository.saveDisplay(input, displayId);
    return display;
  });

  handle(IPC.DISPLAYS_DELETE, async (rawId) => {
    const displayId = id(rawId, 'Display');
    receiver.disconnectDisplay(displayId, 'Display removed from ShowFlow');
    return repository.deleteDisplay(displayId);
  });

  handle(IPC.DISPLAYS_REGENERATE_CODE, async (rawId) => {
    const displayId = id(rawId, 'Display');
    receiver.disconnectDisplay(displayId, 'Pairing code regenerated');
    return repository.regenerateDisplayCode(displayId);
  });

  handle(IPC.DISPLAYS_SERVER_STATUS, async () => receiver.getStatus());

  handle(IPC.DISPLAYS_SERVER_START, async () => {
    const settings = repository.getSettings();
    return receiver.start(settings.receiverPort);
  });

  handle(IPC.DISPLAYS_SERVER_STOP, async () => {
    await receiver.stop();
    return receiver.getStatus();
  });

  handle(IPC.DISPLAYS_LINKS, async (raw) => {
    const displayId = raw?.displayId ? requireDisplayId(raw.displayId) : null;
    return receiver.getLinks(displayId);
  });

  handle(IPC.DISPLAYS_OPEN_RECEIVER, async (rawId) => {
    const displayId = id(rawId, 'Display');
    const links = receiver.getLinks(displayId);
    const local = links.links.find((link) => link.label === 'This computer' && link.receiverUrl);
    if (!local) throw new AppError('The receiver server is not running. Start it in ScreenPilot first.', 'SERVER_STOPPED');
    await shell.openExternal(local.receiverUrl);
    return { opened: true, url: local.receiverUrl };
  });

  handle(IPC.DISPLAYS_PUSH, async (raw) => {
    const input = assertObject(raw, 'Screen content');
    const eventId = id(input.eventId, 'Event');
    const event = repository.getEvent(eventId);
    if (![EVENT_STATUS.LIVE, EVENT_STATUS.REHEARSAL].includes(event.status)) {
      throw new AppError(
        'Screen content can only be pushed from a LIVE or REHEARSAL event. Start the session in the Control Room first.',
        'EVENT_NOT_ACTIVE',
      );
    }
    const target = validateTarget(input.target);
    return receiver.push(target, buildScreenContent(event));
  });

  handle(IPC.DISPLAYS_TEST, async (raw) => {
    const input = raw ? assertObject(raw, 'Test pattern') : {};
    const pattern = TEST_PATTERNS.includes(input.pattern) ? input.pattern : 'bars';
    const target = input.displayId ? { displayId: requireDisplayId(input.displayId) } : {};
    return receiver.sendTest(target, pattern);
  });

  handle(IPC.DISPLAYS_BLACKOUT, async (raw) => {
    const input = raw ? assertObject(raw, 'Blackout') : {};
    const target = input.displayId ? { displayId: requireDisplayId(input.displayId) } : {};
    return receiver.blackout(target);
  });

  // --------------------------------------------------------------- integrations
  handle(IPC.INTEGRATIONS_GET, async () => integrationService.getStatus());

  handle(IPC.INTEGRATIONS_SAVE, async (raw) => {
    const config = validateIntegrationConfig(raw);
    repository.saveIntegration(config);
    repository.logActivity({
      kind: 'integration',
      message: `Integration settings updated (${config.mode === 'mock' ? 'mock — simulated' : 'Resolume OSC'})`,
      detail: { mode: config.mode, enabled: config.enabled, target: config.mode === 'resolume' ? `${config.host}:${config.port}` : 'mock' },
    });
    return integrationService.getStatus();
  });

  handle(IPC.INTEGRATIONS_TEST, async () => integrationService.test());

  handle(IPC.INTEGRATIONS_SEND, async (raw) => {
    const input = assertObject(raw, 'Integration send');
    return integrationService.sendCue({
      eventId: id(input.eventId, 'Event'),
      cueId: id(input.cueId, 'Cue'),
    });
  });

  // ------------------------------------------------------------------ backups
  handle(IPC.BACKUP_CREATE, async () => {
    const destination = await chooseSavePath({
      title: 'Create ShowFlow backup',
      defaultName: `ShowFlow-Backup-${timestampForFile()}.showflow-backup`,
      filters: [{ name: 'ShowFlow backup', extensions: ['showflow-backup', 'json'] }],
    });
    if (!destination) return { canceled: true };
    const finalPath = destination.toLowerCase().endsWith('.showflow-backup') ? destination : `${destination}.showflow-backup`;
    const result = await backupService.writeBackup(finalPath, { reason: 'manual' });
    return { canceled: false, ...result };
  });

  handle(IPC.BACKUP_RESTORE, async () => {
    const source = await chooseOpenPath({
      title: 'Restore a ShowFlow backup',
      filters: [{ name: 'ShowFlow backup', extensions: ['showflow-backup', 'json'] }],
    });
    if (!source) return { canceled: true };
    const window = getMainWindow();
    const confirmation = await dialog.showMessageBox(window || undefined, {
      type: 'warning',
      title: 'Restore ShowFlow backup',
      message: 'Replace all current ShowFlow data with this backup?',
      detail:
        'This replaces events, cues, MediaVault metadata, crew, displays, settings, and logs. A safety backup of the current data is created first. Original media files are not touched.',
      buttons: ['Restore backup', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (confirmation.response !== 0) return { canceled: true };
    const wasRunning = receiver.getStatus().running;
    const result = await backupService.restore(source);
    let receiverWarning = null;
    if (wasRunning) {
      try {
        await receiver.start(repository.getSettings().receiverPort);
      } catch (error) {
        receiverWarning = `Restore succeeded, but ScreenPilot could not restart: ${error.message}`;
        logger.warn(receiverWarning);
      }
    }
    return { canceled: false, ...result, receiverWarning, reloadRequired: true };
  });

  handle(IPC.BACKUP_INTEGRITY, async () => {
    const stats = await backupService.stats();
    return {
      integrity: stats.integrity,
      filePath: stats.filePath,
      fileSize: stats.fileSize,
      lastSaveAt: stats.lastSaveAt,
      counts: stats.counts,
    };
  });

  handle(IPC.BACKUP_STATS, async () => backupService.stats());

  return {
    dispose() {
      for (const channel of activeHandlers) ipcMain.removeHandler(channel);
      activeHandlers.clear();
    },
  };
}

function formatDateForFile() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}
