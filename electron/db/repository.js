import crypto from 'node:crypto';
import path from 'node:path';
import { DEFAULT_INTEGRATION, DEFAULT_SETTINGS } from '../../shared/defaults.js';
import { EVENT_STATUS } from '../../shared/enums.js';
import { todayIso } from '../../shared/format.js';
import { AppError, ConflictError, NotFoundError } from '../errors.js';

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const toBool = (value) => Boolean(Number(value));

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normaliseSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    onboardingComplete:
      typeof source.onboardingComplete === 'boolean'
        ? source.onboardingComplete
        : DEFAULT_SETTINGS.onboardingComplete,
    operatorName:
      typeof source.operatorName === 'string' ? source.operatorName.slice(0, 80).trim() : '',
    defaultVenue:
      typeof source.defaultVenue === 'string' ? source.defaultVenue.slice(0, 160).trim() : '',
    receiverPort:
      Number.isInteger(source.receiverPort) && source.receiverPort >= 1024 && source.receiverPort <= 65535
        ? source.receiverPort
        : DEFAULT_SETTINGS.receiverPort,
    autoBackup:
      typeof source.autoBackup === 'boolean' ? source.autoBackup : DEFAULT_SETTINGS.autoBackup,
    backupRetention:
      Number.isInteger(source.backupRetention) &&
      source.backupRetention >= 3 &&
      source.backupRetention <= 30
        ? source.backupRetention
        : DEFAULT_SETTINGS.backupRetention,
  };
}

function normaliseIntegration(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: source.mode === 'resolume' ? 'resolume' : 'mock',
    host: typeof source.host === 'string' && source.host ? source.host : DEFAULT_INTEGRATION.host,
    port:
      Number.isInteger(source.port) && source.port >= 1 && source.port <= 65535
        ? source.port
        : DEFAULT_INTEGRATION.port,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
    lastTest: source.lastTest && typeof source.lastTest === 'object' ? source.lastTest : null,
  };
}

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    venue: row.venue,
    eventDate: row.event_date,
    startTime: row.start_time,
    status: row.status,
    notes: row.notes,
    technicalNotes: row.technical_notes,
    armedCueId: row.armed_cue_id || null,
    liveCueId: row.live_cue_id || null,
    archived: toBool(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stats: {
      cueCount: Number(row.cue_count ?? 0),
      assignmentCount: Number(row.assignment_count ?? 0),
      missingMediaCount: Number(row.missing_media_count ?? 0),
    },
  };
}

function mapAssetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    kind: row.kind,
    extension: row.extension,
    sizeBytes: Number(row.size_bytes || 0),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    tags: safeJsonParse(row.tags, []),
    category: row.category,
    eventId: row.event_id || null,
    eventTitle: row.event_title || null,
    notes: row.notes,
    addedAt: row.added_at,
    lastCheckedAt: row.last_checked_at,
    available: toBool(row.available),
    missingSince: row.missing_since,
    usedByCueCount: Number(row.used_by_cue_count ?? 0),
  };
}

function mapCueRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    sortIndex: Number(row.sort_index),
    title: row.title,
    type: row.type,
    notes: row.notes,
    fallback: row.fallback,
    operatorId: row.operator_id || null,
    operatorName: row.operator_name || null,
    durationSeconds: Number(row.duration_seconds || 0),
    assetId: row.asset_id || null,
    asset: row.asset_id
      ? {
          id: row.asset_id,
          name: row.asset_name || 'Unknown asset',
          kind: row.asset_kind || 'other',
          path: row.asset_path || '',
          available: toBool(row.asset_available),
          durationSeconds:
            row.asset_duration_seconds === null || row.asset_duration_seconds === undefined
              ? null
              : Number(row.asset_duration_seconds),
          width: row.asset_width === null || row.asset_width === undefined ? null : Number(row.asset_width),
          height:
            row.asset_height === null || row.asset_height === undefined ? null : Number(row.asset_height),
        }
      : null,
    resolumeAction: row.resolume_action || 'none',
    resolumeLayer: row.resolume_layer === null ? null : Number(row.resolume_layer),
    resolumeClip: row.resolume_clip === null ? null : Number(row.resolume_clip),
    resolumeValue: row.resolume_value === null ? null : Number(row.resolume_value),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOperator(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    contact: row.contact,
    active: toBool(row.active),
    assignmentCount: Number(row.assignment_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    operatorId: row.operator_id || null,
    role: row.role,
    roleLabel: row.role_label || '',
    notes: row.notes,
    operatorName: row.operator_name || '',
    operatorContact: row.operator_contact || '',
    createdAt: row.created_at,
  };
}

function mapChecklist(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    kind: row.kind,
    title: row.title,
    owner: row.owner,
    done: toBool(row.done),
    sortIndex: Number(row.sort_index),
    createdAt: row.created_at,
  };
}

function mapDisplay(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    width: Number(row.width),
    height: Number(row.height),
    layout: row.layout,
    notes: row.notes,
    pairingCode: row.pairing_code,
    enabled: toBool(row.enabled),
    lastSeen: row.last_seen || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EVENT_SELECT = `
  SELECT e.*,
    (SELECT COUNT(*) FROM cues c WHERE c.event_id = e.id) AS cue_count,
    (SELECT COUNT(*) FROM assignments a WHERE a.event_id = e.id) AS assignment_count,
    (SELECT COUNT(*) FROM cues c
       JOIN media_assets m ON m.id = c.asset_id
      WHERE c.event_id = e.id AND m.available = 0) AS missing_media_count
  FROM events e
`;

const CUE_SELECT = `
  SELECT c.*, o.name AS operator_name,
    m.name AS asset_name, m.kind AS asset_kind, m.path AS asset_path,
    m.available AS asset_available, m.duration_seconds AS asset_duration_seconds,
    m.width AS asset_width, m.height AS asset_height
  FROM cues c
  LEFT JOIN operators o ON o.id = c.operator_id
  LEFT JOIN media_assets m ON m.id = c.asset_id
`;

const ASSIGNMENT_SELECT = `
  SELECT a.*, o.name AS operator_name, o.contact AS operator_contact
  FROM assignments a
  LEFT JOIN operators o ON o.id = a.operator_id
`;

const MEDIA_SELECT = `
  SELECT m.*, e.title AS event_title,
    (SELECT COUNT(*) FROM cues c WHERE c.asset_id = m.id) AS used_by_cue_count
  FROM media_assets m
  LEFT JOIN events e ON e.id = m.event_id
`;

export class Repository {
  constructor(db, logger = console) {
    this.db = db;
    this.logger = logger;
  }

  ensureDefaults() {
    if (!this.db.get("SELECT key FROM settings WHERE key = 'app.settings';")) {
      this.db.execute(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?);`,
        ['app.settings', JSON.stringify(DEFAULT_SETTINGS), nowIso()],
      );
      this.db.saveNow();
    }
  }

  getSettings() {
    const row = this.db.get("SELECT value FROM settings WHERE key = 'app.settings';");
    return normaliseSettings(row ? safeJsonParse(row.value, {}) : {});
  }

  updateSettings(patch) {
    const current = this.getSettings();
    const next = normaliseSettings({ ...current, ...patch });
    this.db.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      ['app.settings', JSON.stringify(next), nowIso()],
    );
    this.db.saveNow();
    return next;
  }

  getIntegration() {
    const row = this.db.get("SELECT value FROM settings WHERE key = 'integrations.resolume';");
    return normaliseIntegration(row ? safeJsonParse(row.value, {}) : {});
  }

  saveIntegration(config) {
    const current = this.getIntegration();
    const next = normaliseIntegration({ ...current, ...config, lastTest: current.lastTest });
    this.db.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      ['integrations.resolume', JSON.stringify(next), nowIso()],
    );
    this.db.saveNow();
    return next;
  }

  setIntegrationLastTest(lastTest) {
    const current = this.getIntegration();
    const next = { ...current, lastTest };
    this.db.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      ['integrations.resolume', JSON.stringify(next), nowIso()],
    );
    this.db.saveNow();
    return next;
  }

  getActor() {
    return this.getSettings().operatorName?.trim() || 'Operator';
  }

  // ---------------------------------------------------------------- activity
  logActivity(entry, { save = true } = {}) {
    let eventId = entry.eventId || null;
    if (eventId && !this.db.get('SELECT id FROM events WHERE id = ?;', [eventId])) eventId = null;
    const detail = entry.detail ? JSON.stringify(entry.detail).slice(0, 4000) : 'null';
    this.db.execute(
      `INSERT INTO activity (id, event_id, kind, message, detail, mode, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        newId(),
        eventId,
        entry.kind || 'system',
        String(entry.message || '').slice(0, 600),
        detail,
        entry.mode || 'system',
        entry.actor || this.getActor(),
        nowIso(),
      ],
    );
    const count = Number(this.db.get('SELECT COUNT(*) AS count FROM activity;')?.count || 0);
    if (count > 12000) {
      this.db.execute(
        `DELETE FROM activity WHERE id IN (
           SELECT id FROM activity ORDER BY created_at ASC LIMIT 2000
         );`,
      );
    }
    if (save) this.db.saveNow();
  }

  listActivity({ eventId = null, kind = null, search = '', limit = 100, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    if (eventId) {
      clauses.push('a.event_id = ?');
      params.push(eventId);
    }
    if (kind) {
      clauses.push('a.kind = ?');
      params.push(kind);
    }
    if (search) {
      clauses.push('(a.message LIKE ? OR a.actor LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = Number(
      this.db.get(`SELECT COUNT(*) AS count FROM activity a ${where};`, params)?.count || 0,
    );
    const rows = this.db.all(
      `SELECT a.*, e.title AS event_title FROM activity a
       LEFT JOIN events e ON e.id = a.event_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?;`,
      [...params, Math.min(Math.max(Number(limit) || 100, 1), 500), Math.max(Number(offset) || 0, 0)],
    );
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        eventId: row.event_id || null,
        eventTitle: row.event_title || null,
        kind: row.kind,
        message: row.message,
        detail: safeJsonParse(row.detail, null),
        mode: row.mode,
        actor: row.actor,
        createdAt: row.created_at,
      })),
    };
  }

  // ------------------------------------------------------------------ events
  listEvents({ includeArchived = false, search = '', status = null, limit = 300 } = {}) {
    const clauses = [];
    const params = [];
    if (!includeArchived) clauses.push('e.archived = 0');
    if (status) {
      clauses.push('e.status = ?');
      params.push(status);
    }
    if (search) {
      clauses.push('(e.title LIKE ? OR e.venue LIKE ? OR e.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.all(
      `${EVENT_SELECT} ${where}
       ORDER BY e.archived ASC, e.event_date DESC, e.start_time DESC
       LIMIT ?;`,
      [...params, Math.min(Math.max(Number(limit) || 300, 1), 1000)],
    );
    return rows.map(mapEventRow);
  }

  getEventSummary(id) {
    return mapEventRow(this.db.get(`${EVENT_SELECT} WHERE e.id = ?;`, [id]));
  }

  getCueById(id) {
    return mapCueRow(
      this.db.get(
        `${CUE_SELECT}
         WHERE c.id = ?;`,
        [id],
      ),
    );
  }

  getEvent(id) {
    const event = this.getEventSummary(id);
    if (!event) throw new NotFoundError('That event could not be found.');
    const cues = this.db
      .all(`${CUE_SELECT} WHERE c.event_id = ? ORDER BY c.sort_index ASC;`, [id])
      .map(mapCueRow);
    const assignments = this.db
      .all(`${ASSIGNMENT_SELECT} WHERE a.event_id = ? ORDER BY a.created_at ASC;`, [id])
      .map(mapAssignment);
    const checklists = this.db
      .all(
        `SELECT * FROM checklists WHERE event_id = ? ORDER BY kind ASC, sort_index ASC;`,
        [id],
      )
      .map(mapChecklist);
    const media = this.db
      .all(
        `${MEDIA_SELECT}
         WHERE m.event_id = ? OR m.id IN (SELECT asset_id FROM cues WHERE event_id = ? AND asset_id IS NOT NULL)
         ORDER BY m.name COLLATE NOCASE ASC;`,
        [id, id],
      )
      .map(mapAssetRow);
    const missingCueAssets = cues
      .filter((cue) => cue.asset && !cue.asset.available)
      .map((cue) => ({
        cueId: cue.id,
        cueTitle: cue.title,
        assetId: cue.asset.id,
        assetName: cue.asset.name,
      }));
    const setup = checklists.filter((item) => item.kind === 'setup');
    const shutdown = checklists.filter((item) => item.kind === 'shutdown');
    return {
      ...event,
      cues,
      assignments,
      checklists,
      media,
      readiness: {
        missingCueAssets,
        linkedAssets: cues.filter((cue) => cue.assetId).length,
        missingAssets: missingCueAssets.length,
        setupTotal: setup.length,
        setupDone: setup.filter((item) => item.done).length,
        shutdownTotal: shutdown.length,
        shutdownDone: shutdown.filter((item) => item.done).length,
      },
    };
  }

  createEvent(input) {
    const id = newId();
    const now = nowIso();
    this.db.execute(
      `INSERT INTO events
       (id, title, description, venue, event_date, start_time, status, notes, technical_notes, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 0, ?, ?);`,
      [
        id,
        input.title,
        input.description || '',
        input.venue || '',
        input.eventDate,
        input.startTime || '',
        input.notes || '',
        input.technicalNotes || '',
        now,
        now,
      ],
    );
    this.db.saveNow();
    this.logActivity({
      eventId: id,
      kind: 'event',
      message: `Event created: ${input.title}`,
      detail: { eventDate: input.eventDate, venue: input.venue || '' },
    });
    return this.getEvent(id);
  }

  updateEvent(id, input) {
    const existing = this.getEventSummary(id);
    if (!existing) throw new NotFoundError('That event could not be found.');
    this.db.execute(
      `UPDATE events SET title = ?, description = ?, venue = ?, event_date = ?, start_time = ?,
        notes = ?, technical_notes = ?, updated_at = ? WHERE id = ?;`,
      [
        input.title,
        input.description || '',
        input.venue || '',
        input.eventDate,
        input.startTime || '',
        input.notes || '',
        input.technicalNotes || '',
        nowIso(),
        id,
      ],
    );
    this.db.saveNow();
    return this.getEvent(id);
  }

  duplicateEvent(id) {
    const original = this.getEvent(id);
    if (!original) throw new NotFoundError('That event could not be found.');
    const copyId = newId();
    const now = nowIso();
    const title = `${original.title} (copy)`.slice(0, 160);
    this.db.transaction(() => {
      this.db.execute(
        `INSERT INTO events
         (id, title, description, venue, event_date, start_time, status, notes, technical_notes, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 0, ?, ?);`,
        [
          copyId,
          title,
          original.description,
          original.venue,
          original.eventDate,
          original.startTime,
          original.notes,
          original.technicalNotes,
          now,
          now,
        ],
      );
      let firstCueId = null;
      for (const cue of original.cues) {
        const cueId = newId();
        if (!firstCueId) firstCueId = cueId;
        this.db.execute(
          `INSERT INTO cues
           (id, event_id, sort_index, title, type, notes, fallback, operator_id, duration_seconds, asset_id,
            resolume_action, resolume_layer, resolume_clip, resolume_value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            cueId,
            copyId,
            cue.sortIndex,
            cue.title,
            cue.type,
            cue.notes,
            cue.fallback,
            cue.operatorId,
            cue.durationSeconds,
            cue.assetId,
            cue.resolumeAction,
            cue.resolumeLayer,
            cue.resolumeClip,
            cue.resolumeValue,
            now,
            now,
          ],
        );
      }
      for (const assignment of original.assignments) {
        this.db.execute(
          `INSERT INTO assignments (id, event_id, operator_id, role, role_label, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [newId(), copyId, assignment.operatorId, assignment.role, assignment.roleLabel, assignment.notes, now],
        );
      }
      for (const item of original.checklists) {
        this.db.execute(
          `INSERT INTO checklists (id, event_id, kind, title, owner, done, sort_index, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
          [newId(), copyId, item.kind, item.title, item.owner, item.sortIndex, now],
        );
      }
      if (firstCueId) {
        this.db.execute('UPDATE events SET armed_cue_id = ? WHERE id = ?;', [firstCueId, copyId]);
      }
    });
    this.logActivity({
      eventId: copyId,
      kind: 'event',
      message: `Event duplicated from "${original.title}"`,
    });
    return this.getEvent(copyId);
  }

  setEventArchived(id, archived) {
    const event = this.getEventSummary(id);
    if (!event) throw new NotFoundError('That event could not be found.');
    if (event.status === EVENT_STATUS.LIVE) {
      throw new ConflictError('End the live session before archiving this event.');
    }
    this.db.execute('UPDATE events SET archived = ?, updated_at = ? WHERE id = ?;', [
      archived ? 1 : 0,
      nowIso(),
      id,
    ]);
    this.db.saveNow();
    this.logActivity({
      eventId: id,
      kind: 'event',
      message: archived ? `Event archived: ${event.title}` : `Event restored: ${event.title}`,
    });
    return this.getEvent(id);
  }

  deleteEvent(id) {
    const event = this.getEventSummary(id);
    if (!event) throw new NotFoundError('That event could not be found.');
    if (event.status === EVENT_STATUS.LIVE) {
      throw new ConflictError('End the live session before deleting this event.');
    }
    this.db.execute('DELETE FROM events WHERE id = ?;', [id]);
    this.db.saveNow();
    this.logActivity({
      eventId: null,
      kind: 'event',
      message: `Event deleted: ${event.title}`,
      detail: { eventDate: event.eventDate, venue: event.venue },
    });
    return { id };
  }

  setEventRuntime(id, { status, armedCueId = undefined, liveCueId = undefined }) {
    const event = this.getEventSummary(id);
    if (!event) throw new NotFoundError('That event could not be found.');
    if (event.archived) throw new ConflictError('Archived events cannot enter rehearsal or live mode.');
    if (!Object.values(EVENT_STATUS).includes(status)) {
      throw new AppError('Invalid event status.', 'INVALID_STATUS');
    }
    const cues = this.db.all('SELECT id FROM cues WHERE event_id = ?;', [id]);
    const cueIds = new Set(cues.map((row) => row.id));
    if (status === EVENT_STATUS.LIVE && cues.length === 0) {
      throw new ConflictError('Add at least one cue before entering live mode.');
    }
    let nextArmed = armedCueId === undefined ? event.armedCueId : armedCueId;
    let nextLive = liveCueId === undefined ? event.liveCueId : liveCueId;
    if (nextArmed && !cueIds.has(nextArmed)) {
      throw new AppError('The armed cue does not belong to this event.', 'INVALID_CUE');
    }
    if (nextLive && !cueIds.has(nextLive)) {
      throw new AppError('The live cue does not belong to this event.', 'INVALID_CUE');
    }
    if (status !== EVENT_STATUS.LIVE && status !== EVENT_STATUS.REHEARSAL) {
      nextLive = null;
    }
    this.db.execute(
      `UPDATE events SET status = ?, armed_cue_id = ?, live_cue_id = ?, updated_at = ? WHERE id = ?;`,
      [status, nextArmed || null, nextLive || null, nowIso(), id],
    );
    this.db.saveNow();
    if (event.status !== status) {
      const messages = {
        rehearsal: `Rehearsal mode enabled for ${event.title}`,
        live: `LIVE mode started for ${event.title} — no commands are replayed`,
        completed: `Event marked complete: ${event.title}`,
        interrupted: `Session marked interrupted: ${event.title}`,
        draft: `Event returned to standby: ${event.title}`,
      };
      this.logActivity({
        eventId: id,
        kind: 'event',
        mode: status === EVENT_STATUS.REHEARSAL ? 'rehearsal' : status === EVENT_STATUS.LIVE ? 'live' : 'system',
        message: messages[status] || `Event status changed to ${status}`,
      });
    }
    return this.getEvent(id);
  }

  recoverInterruptedSessions() {
    const rows = this.db.all("SELECT id, title, status FROM events WHERE status IN ('live', 'rehearsal');");
    for (const row of rows) {
      this.db.execute(
        "UPDATE events SET status = 'interrupted', live_cue_id = NULL, updated_at = ? WHERE id = ?;",
        [nowIso(), row.id],
      );
      this.db.saveNow();
      this.logActivity({
        eventId: row.id,
        kind: 'system',
        mode: 'system',
        message:
          row.status === 'rehearsal'
            ? 'ShowFlow restarted during rehearsal. The session has been marked interrupted; no cue is executing and no production commands were replayed.'
            : 'ShowFlow restarted while this event was live. It has been marked interrupted; no production commands were replayed.',
      });
    }
    return rows.length;
  }

  // -------------------------------------------------------------------- cues
  assertEventEditable(eventId) {
    const event = this.getEventSummary(eventId);
    if (!event) throw new NotFoundError('That event could not be found.');
    if (event.archived) throw new ConflictError('Restore the archived event before editing it.');
    if (event.status === EVENT_STATUS.LIVE) {
      throw new ConflictError('Cue changes are locked while the event is live. Use rehearsal mode or end the live session.');
    }
    return event;
  }

  createCue(eventId, input) {
    this.assertEventEditable(eventId);
    const id = newId();
    const now = nowIso();
    const max = Number(
      this.db.get('SELECT COALESCE(MAX(sort_index), -1) AS value FROM cues WHERE event_id = ?;', [eventId])
        ?.value ?? -1,
    );
    this.db.transaction(() => {
      this.db.execute(
        `INSERT INTO cues
         (id, event_id, sort_index, title, type, notes, fallback, operator_id, duration_seconds, asset_id,
          resolume_action, resolume_layer, resolume_clip, resolume_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          eventId,
          max + 1,
          input.title,
          input.type,
          input.notes || '',
          input.fallback || '',
          input.operatorId || null,
          input.durationSeconds || 0,
          input.assetId || null,
          input.resolumeAction || 'none',
          input.resolumeLayer ?? null,
          input.resolumeClip ?? null,
          input.resolumeValue ?? null,
          now,
          now,
        ],
      );
      const event = this.db.get('SELECT armed_cue_id FROM events WHERE id = ?;', [eventId]);
      if (!event?.armed_cue_id) {
        this.db.execute('UPDATE events SET armed_cue_id = ?, updated_at = ? WHERE id = ?;', [id, now, eventId]);
      }
    });
    this.logActivity({
      eventId,
      kind: 'cue',
      message: `Cue added: ${input.title}`,
    });
    return this.getCueById(id);
  }

  updateCue(id, input) {
    const cue = this.getCueById(id);
    if (!cue) throw new NotFoundError('That cue could not be found.');
    this.assertEventEditable(cue.eventId);
    this.db.execute(
      `UPDATE cues SET title = ?, type = ?, notes = ?, fallback = ?, operator_id = ?, duration_seconds = ?,
       asset_id = ?, resolume_action = ?, resolume_layer = ?, resolume_clip = ?, resolume_value = ?, updated_at = ?
       WHERE id = ?;`,
      [
        input.title,
        input.type,
        input.notes || '',
        input.fallback || '',
        input.operatorId || null,
        input.durationSeconds || 0,
        input.assetId || null,
        input.resolumeAction || 'none',
        input.resolumeLayer ?? null,
        input.resolumeClip ?? null,
        input.resolumeValue ?? null,
        nowIso(),
        id,
      ],
    );
    this.db.saveNow();
    return this.getCueById(id);
  }

  deleteCue(id) {
    const cue = this.getCueById(id);
    if (!cue) throw new NotFoundError('That cue could not be found.');
    this.assertEventEditable(cue.eventId);
    const event = this.getEvent(cue.eventId);
    const remaining = event.cues.filter((item) => item.id !== id);
    this.db.transaction(() => {
      this.db.execute('DELETE FROM cues WHERE id = ?;', [id]);
      const nextArmed =
        event.armedCueId === id ? remaining[0]?.id || null : event.armedCueId || remaining[0]?.id || null;
      this.db.execute('UPDATE events SET armed_cue_id = ?, updated_at = ? WHERE id = ?;', [
        nextArmed,
        nowIso(),
        cue.eventId,
      ]);
    });
    this.logActivity({
      eventId: cue.eventId,
      kind: 'cue',
      message: `Cue removed: ${cue.title}`,
    });
    return { id };
  }

  reorderCues(eventId, orderedIds) {
    this.assertEventEditable(eventId);
    const rows = this.db.all('SELECT id FROM cues WHERE event_id = ?;', [eventId]);
    const existingIds = rows.map((row) => row.id).sort();
    const requested = [...orderedIds].sort();
    if (
      existingIds.length !== requested.length ||
      existingIds.some((value, index) => value !== requested[index])
    ) {
      throw new ConflictError('The running order changed on another screen. Reload the event and try again.');
    }
    this.db.transaction(() => {
      orderedIds.forEach((cueId, index) => {
        this.db.execute('UPDATE cues SET sort_index = ?, updated_at = ? WHERE id = ? AND event_id = ?;', [
          index,
          nowIso(),
          cueId,
          eventId,
        ]);
      });
      this.db.execute('UPDATE events SET updated_at = ? WHERE id = ?;', [nowIso(), eventId]);
    });
    this.logActivity({
      eventId,
      kind: 'cue',
      message: 'Running order reordered',
      detail: { cueCount: orderedIds.length },
    });
    return this.db
      .all(`${CUE_SELECT} WHERE c.event_id = ? ORDER BY c.sort_index ASC;`, [eventId])
      .map(mapCueRow);
  }

  createEventBundle(eventInput, cueInputs = [], assignmentInputs = [], checklistInputs = []) {
    const eventId = newId();
    const now = nowIso();
   this.db.transaction(() => {
      this.db.execute(
        `INSERT INTO events
         (id, title, description, venue, event_date, start_time, status, notes, technical_notes, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, 0, ?, ?);`,
        [
          eventId,
          eventInput.title,
          eventInput.description || '',
          eventInput.venue || '',
          eventInput.eventDate,
          eventInput.startTime || '',
          eventInput.notes || '',
          eventInput.technicalNotes || '',
          now,
          now,
        ],
      );
      const cueIds = [];
      cueInputs.forEach((cue, index) => {
        const cueId = newId();
        cueIds.push(cueId);
        this.db.execute(
          `INSERT INTO cues
           (id, event_id, sort_index, title, type, notes, fallback, operator_id, duration_seconds, asset_id,
            resolume_action, resolume_layer, resolume_clip, resolume_value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            cueId,
            eventId,
            index,
            cue.title,
            cue.type,
            cue.notes || '',
            cue.fallback || '',
            cue.operatorId || null,
            cue.durationSeconds || 0,
            cue.assetId || null,
            cue.resolumeAction || 'none',
            cue.resolumeLayer ?? null,
            cue.resolumeClip ?? null,
            cue.resolumeValue ?? null,
            now,
            now,
          ],
        );
      });
      if (cueIds.length) {
        this.db.execute('UPDATE events SET armed_cue_id = ? WHERE id = ?;', [cueIds[0], eventId]);
      }
      for (const assignment of assignmentInputs) {
        this.db.execute(
          `INSERT INTO assignments (id, event_id, operator_id, role, role_label, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            newId(),
            eventId,
            assignment.operatorId || null,
            assignment.role,
            assignment.roleLabel || '',
            assignment.notes || '',
            now,
          ],
        );
      }
      for (const item of checklistInputs) {
        this.db.execute(
          `INSERT INTO checklists (id, event_id, kind, title, owner, done, sort_index, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
          [newId(), eventId, item.kind, item.title, item.owner || '', item.sortIndex ?? 0, now],
        );
      }
    });
    this.logActivity({
      eventId,
      kind: 'event',
      message: `Event plan imported: ${eventInput.title}`,
      detail: { cues: cueInputs.length, assignments: assignmentInputs.length, checklists: checklistInputs.length },
    });
    return this.getEvent(eventId);
  }

  // ------------------------------------------------------------------- media
  listMedia({
    search = '',
    kind = null,
    eventId = null,
    tag = null,
    availability = null,
    sort = 'name',
    limit = 3000,
  } = {}) {
    const clauses = [];
    const params = [];
    if (search) {
      clauses.push('(m.name LIKE ? OR m.path LIKE ? OR m.category LIKE ? OR m.tags LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (kind) {
      clauses.push('m.kind = ?');
      params.push(kind);
    }
    if (eventId === 'unassigned') {
      clauses.push('m.event_id IS NULL');
    } else if (eventId) {
      clauses.push('m.event_id = ?');
      params.push(eventId);
    }
    if (tag) {
      clauses.push('m.tags LIKE ?');
      params.push(`%${tag}%`);
    }
    if (availability === 'missing') clauses.push('m.available = 0');
    if (availability === 'available') clauses.push('m.available = 1');
    if (availability === 'unlinked') {
      clauses.push('NOT EXISTS (SELECT 1 FROM cues c WHERE c.asset_id = m.id)');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order =
      sort === 'recent'
        ? 'm.added_at DESC'
        : sort === 'size'
          ? 'm.size_bytes DESC'
          : sort === 'missing'
            ? 'm.available ASC, m.name COLLATE NOCASE ASC'
            : 'm.name COLLATE NOCASE ASC';
    const items = this.db
      .all(`${MEDIA_SELECT} ${where} ORDER BY ${order} LIMIT ?;`, [
        ...params,
        Math.min(Math.max(Number(limit) || 3000, 1), 5000),
      ])
      .map(mapAssetRow);
    const summaryRows = this.db.all(
      `SELECT kind, available, COUNT(*) AS count FROM media_assets GROUP BY kind, available;`,
    );
    const byKind = {};
    let total = 0;
    let missing = 0;
    let available = 0;
    for (const row of summaryRows) {
      const count = Number(row.count);
      total += count;
      byKind[row.kind] = (byKind[row.kind] || 0) + count;
      if (Number(row.available) === 0) missing += count;
      else available += count;
    }
    const unassigned = Number(
      this.db.get('SELECT COUNT(*) AS count FROM media_assets WHERE event_id IS NULL;')?.count || 0,
    );
    const unused = Number(
      this.db.get(
        'SELECT COUNT(*) AS count FROM media_assets m WHERE NOT EXISTS (SELECT 1 FROM cues c WHERE c.asset_id = m.id);',
      )?.count || 0,
    );
    return {
      items,
      summary: { total, missing, available, byKind, unassigned, unused },
    };
  }

  getMedia(id) {
    return mapAssetRow(this.db.get(`${MEDIA_SELECT} WHERE m.id = ?;`, [id]));
  }

  getMediaByPath(filePath) {
    return mapAssetRow(this.db.get(`${MEDIA_SELECT} WHERE m.path = ? COLLATE NOCASE;`, [filePath]));
  }

  addMediaRecords(records, { eventId = null } = {}) {
    if (eventId) {
      const event = this.getEventSummary(eventId);
      if (!event) throw new NotFoundError('The destination event could not be found.');
      if (event.archived) throw new ConflictError('Cannot add media to an archived event.');
    }
    let added = 0;
    let skipped = 0;
    const now = nowIso();
    this.db.transaction(() => {
      for (const record of records) {
        const existing = this.db.get('SELECT id FROM media_assets WHERE path = ? COLLATE NOCASE;', [record.path]);
        if (existing) {
          skipped += 1;
          continue;
        }
        this.db.execute(
          `INSERT INTO media_assets
           (id, name, path, kind, extension, size_bytes, duration_seconds, width, height, tags, category,
            event_id, notes, added_at, last_checked_at, available, missing_since)
           VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, 1, NULL);`,
          [
            newId(),
            record.name || path.basename(record.path),
            record.path,
            record.kind,
            path.extname(record.path).toLowerCase(),
            record.sizeBytes || 0,
            JSON.stringify(Array.isArray(record.tags) ? record.tags : []),
            record.category || '',
            eventId,
            record.notes || '',
            now,
            now,
          ],
        );
        added += 1;
      }
    });
    if (added) {
      this.logActivity({
        eventId,
        kind: 'media',
        message: `Added ${added} media file${added === 1 ? '' : 's'} to the library${skipped ? `; ${skipped} already indexed` : ''}`,
        detail: { added, skipped },
      });
    }
    return { added, skipped };
  }

  updateMedia(id, patch) {
    const asset = this.getMedia(id);
    if (!asset) throw new NotFoundError('That media item could not be found.');
    if (patch.eventId) {
      const event = this.getEventSummary(patch.eventId);
      if (!event) throw new NotFoundError('The selected event could not be found.');
    }
    const next = {
      name: patch.name ?? asset.name,
      tags: patch.tags ?? asset.tags,
      category: patch.category ?? asset.category,
      notes: patch.notes ?? asset.notes,
      eventId: 'eventId' in patch ? patch.eventId : asset.eventId,
    };
    this.db.execute(
      `UPDATE media_assets SET name = ?, tags = ?, category = ?, notes = ?, event_id = ? WHERE id = ?;`,
      [
        next.name,
        JSON.stringify(next.tags),
        next.category,
        next.notes,
        next.eventId || null,
        id,
      ],
    );
    this.db.saveNow();
    return this.getMedia(id);
  }

  updateMediaProbe(id, probe) {
    const asset = this.getMedia(id);
    if (!asset) throw new NotFoundError('That media item could not be found.');
    this.db.execute(
      `UPDATE media_assets SET duration_seconds = ?, width = ?, height = ?, last_checked_at = ? WHERE id = ?;`,
      [
        probe.durationSeconds ?? asset.durationSeconds,
        probe.width ?? asset.width,
        probe.height ?? asset.height,
        nowIso(),
        id,
      ],
    );
    this.db.saveNow();
    return this.getMedia(id);
  }

  updateMediaAvailability(results) {
    let newlyMissing = 0;
    let recovered = 0;
    const now = nowIso();
    this.db.transaction(() => {
      for (const result of results) {
        const asset = this.db.get('SELECT available, name FROM media_assets WHERE id = ?;', [result.id]);
        if (!asset) continue;
        const wasAvailable = Number(asset.available) === 1;
        if (!result.available && wasAvailable) newlyMissing += 1;
        if (result.available && !wasAvailable) recovered += 1;
        this.db.execute(
          `UPDATE media_assets SET available = ?, last_checked_at = ?,
            missing_since = CASE
              WHEN ? = 0 AND missing_since IS NULL THEN ?
              WHEN ? = 1 THEN NULL
              ELSE missing_since
            END
           WHERE id = ?;`,
          [result.available ? 1 : 0, now, result.available ? 1 : 0, now, result.available ? 1 : 0, result.id],
        );
      }
    });
    if (newlyMissing || recovered) {
      this.logActivity({
        kind: 'media',
        message: `Media readiness check: ${newlyMissing} missing, ${recovered} recovered`,
        detail: { newlyMissing, recovered, checked: results.length },
      });
    }
    return { newlyMissing, recovered, checked: results.length };
  }

  relinkMedia(id, newPath, fileInfo) {
    const asset = this.getMedia(id);
    if (!asset) throw new NotFoundError('That media item could not be found.');
    const collision = this.db.get(
      'SELECT id FROM media_assets WHERE path = ? COLLATE NOCASE AND id != ?;',
      [newPath, id],
    );
    if (collision) throw new ConflictError('Another library item already points to that file.');
    const oldBasename = path.basename(asset.path);
    const newBasename = path.basename(newPath);
    const name = asset.name === oldBasename ? newBasename : asset.name;
    this.db.execute(
      `UPDATE media_assets SET path = ?, name = ?, extension = ?, size_bytes = ?, available = 1,
        last_checked_at = ?, missing_since = NULL WHERE id = ?;`,
      [newPath, name, path.extname(newPath).toLowerCase(), fileInfo.sizeBytes || 0, nowIso(), id],
    );
    this.db.saveNow();
    this.logActivity({
      eventId: asset.eventId,
      kind: 'media',
      message: `Media relinked: ${asset.name}`,
      detail: { oldPath: asset.path, newPath },
    });
    return this.getMedia(id);
  }

  relinkMediaBatch(matches) {
    let relinked = 0;
    this.db.transaction(() => {
      for (const match of matches) {
        const collision = this.db.get(
          'SELECT id FROM media_assets WHERE path = ? COLLATE NOCASE AND id != ?;',
          [match.newPath, match.id],
        );
        if (collision) continue;
        const asset = this.db.get('SELECT name, path FROM media_assets WHERE id = ?;', [match.id]);
        if (!asset) continue;
        const name =
          asset.name === path.basename(asset.path) ? path.basename(match.newPath) : asset.name;
        this.db.execute(
          `UPDATE media_assets SET path = ?, name = ?, extension = ?, size_bytes = ?, available = 1,
            last_checked_at = ?, missing_since = NULL WHERE id = ?;`,
          [
            match.newPath,
            name,
            path.extname(match.newPath).toLowerCase(),
            match.sizeBytes || 0,
            nowIso(),
            match.id,
          ],
        );
        relinked += 1;
      }
    });
    if (relinked) {
      this.logActivity({
        kind: 'media',
        message: `${relinked} missing media file${relinked === 1 ? '' : 's'} relinked`,
        detail: { relinked },
      });
    }
    return { relinked };
  }

  removeMedia(id) {
    const asset = this.getMedia(id);
    if (!asset) throw new NotFoundError('That media item could not be found.');
    this.db.execute('DELETE FROM media_assets WHERE id = ?;', [id]);
    this.db.saveNow();
    this.logActivity({
      eventId: asset.eventId,
      kind: 'media',
      message: `Removed from MediaVault (file untouched): ${asset.name}`,
      detail: { path: asset.path },
    });
    return { id };
  }

  // -------------------------------------------------------------------- crew
  listOperators() {
    return this.db
      .all(
        `SELECT o.*,
          (SELECT COUNT(*) FROM assignments a WHERE a.operator_id = o.id) AS assignment_count
         FROM operators o ORDER BY o.active DESC, o.name COLLATE NOCASE ASC;`,
      )
      .map(mapOperator);
  }

  saveOperator(input, operatorId = null) {
    if (operatorId) {
      const existing = this.db.get('SELECT id FROM operators WHERE id = ?;', [operatorId]);
      if (!existing) throw new NotFoundError('That crew member could not be found.');
      this.db.execute(
        'UPDATE operators SET name = ?, role = ?, contact = ?, active = ?, updated_at = ? WHERE id = ?;',
        [input.name, input.role, input.contact || '', input.active ? 1 : 0, nowIso(), operatorId],
      );
      this.db.saveNow();
      return this.listOperators().find((operator) => operator.id === operatorId) || null;
    }
    const id = newId();
    const now = nowIso();
    this.db.execute(
      'INSERT INTO operators (id, name, role, contact, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [id, input.name, input.role, input.contact || '', input.active ? 1 : 0, now, now],
    );
    this.db.saveNow();
    this.logActivity({ kind: 'crew', message: `Crew member added: ${input.name}` });
    return this.listOperators().find((operator) => operator.id === id) || null;
  }

  deleteOperator(id) {
    const operator = this.db.get('SELECT name FROM operators WHERE id = ?;', [id]);
    if (!operator) throw new NotFoundError('That crew member could not be found.');
    this.db.execute('DELETE FROM operators WHERE id = ?;', [id]);
    this.db.saveNow();
    this.logActivity({
      kind: 'crew',
      message: `Crew member removed: ${operator.name}`,
      detail: { note: 'Assignments remain but are now unassigned.' },
    });
    return { id };
  }

  saveAssignment(input) {
    const event = this.getEventSummary(input.eventId);
    if (!event) throw new NotFoundError('That event could not be found.');
    if (event.archived) throw new ConflictError('Restore the archived event before editing crew.');
    if (input.operatorId && !this.db.get('SELECT id FROM operators WHERE id = ?;', [input.operatorId])) {
      throw new NotFoundError('That crew member could not be found.');
    }
    const now = nowIso();
    if (input.id) {
      const existing = this.db.get('SELECT id FROM assignments WHERE id = ? AND event_id = ?;', [
        input.id,
        input.eventId,
      ]);
      if (!existing) throw new NotFoundError('That crew assignment could not be found.');
      this.db.execute(
        'UPDATE assignments SET operator_id = ?, role = ?, role_label = ?, notes = ? WHERE id = ?;',
        [input.operatorId || null, input.role, input.roleLabel || '', input.notes || '', input.id],
      );
    } else {
      this.db.execute(
        `INSERT INTO assignments (id, event_id, operator_id, role, role_label, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          newId(),
          input.eventId,
          input.operatorId || null,
          input.role,
          input.roleLabel || '',
          input.notes || '',
          now,
        ],
      );
    }
    this.db.saveNow();
    const assignment = this.db.get(
      `${ASSIGNMENT_SELECT} WHERE a.event_id = ? ORDER BY a.created_at DESC LIMIT 1;`,
      [input.eventId],
    );
    this.logActivity({
      eventId: input.eventId,
      kind: 'crew',
      message: `Crew assignment updated: ${input.roleLabel || input.role}`,
    });
    return mapAssignment(assignment);
  }

  deleteAssignment(id) {
    const assignment = this.db.get('SELECT event_id, role, role_label FROM assignments WHERE id = ?;', [id]);
    if (!assignment) throw new NotFoundError('That crew assignment could not be found.');
    this.db.execute('DELETE FROM assignments WHERE id = ?;', [id]);
    this.db.saveNow();
    this.logActivity({
      eventId: assignment.event_id,
      kind: 'crew',
      message: `Crew assignment removed: ${assignment.role_label || assignment.role}`,
    });
    return { id };
  }

  saveChecklist(input) {
    const event = this.getEventSummary(input.eventId);
    if (!event) throw new NotFoundError('That event could not be found.');
    if (event.archived) throw new ConflictError('Restore the archived event before editing checklists.');
    if (input.id) {
      const existing = this.db.get('SELECT id FROM checklists WHERE id = ? AND event_id = ?;', [
        input.id,
        input.eventId,
      ]);
      if (!existing) throw new NotFoundError('That checklist item could not be found.');
      this.db.execute('UPDATE checklists SET title = ?, owner = ?, done = ? WHERE id = ?;', [
        input.title,
        input.owner || '',
        input.done ? 1 : 0,
        input.id,
      ]);
      this.db.saveNow();
      return mapChecklist(this.db.get('SELECT * FROM checklists WHERE id = ?;', [input.id]));
    }
    const max = Number(
      this.db.get(
        'SELECT COALESCE(MAX(sort_index), -1) AS value FROM checklists WHERE event_id = ? AND kind = ?;',
        [input.eventId, input.kind],
      )?.value ?? -1,
    );
    const id = newId();
    this.db.execute(
      `INSERT INTO checklists (id, event_id, kind, title, owner, done, sort_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [id, input.eventId, input.kind, input.title, input.owner || '', input.done ? 1 : 0, max + 1, nowIso()],
    );
    this.db.saveNow();
    return mapChecklist(this.db.get('SELECT * FROM checklists WHERE id = ?;', [id]));
  }

  deleteChecklist(id) {
    const item = this.db.get('SELECT event_id, title FROM checklists WHERE id = ?;', [id]);
    if (!item) throw new NotFoundError('That checklist item could not be found.');
    this.db.execute('DELETE FROM checklists WHERE id = ?;', [id]);
    this.db.saveNow();
    return { id };
  }

  // ---------------------------------------------------------------- displays
  generateUniquePairingCode() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = String(crypto.randomInt(100000, 1000000));
      if (!this.db.get('SELECT id FROM displays WHERE pairing_code = ?;', [code])) return code;
    }
    throw new AppError('Could not generate a unique pairing code.', 'CODE_GENERATION');
  }

  listDisplays() {
    return this.db
      .all('SELECT * FROM displays ORDER BY created_at ASC;')
      .map(mapDisplay);
  }

  getDisplay(id) {
    return mapDisplay(this.db.get('SELECT * FROM displays WHERE id = ?;', [id]));
  }

  findByPairing(id, code) {
    return mapDisplay(
      this.db.get('SELECT * FROM displays WHERE id = ? AND pairing_code = ?;', [id, code]),
    );
  }

  saveDisplay(input, displayId = null) {
    const now = nowIso();
    if (displayId) {
      const existing = this.getDisplay(displayId);
      if (!existing) throw new NotFoundError('That display could not be found.');
      this.db.execute(
        `UPDATE displays SET name = ?, purpose = ?, width = ?, height = ?, layout = ?, notes = ?,
          enabled = ?, updated_at = ? WHERE id = ?;`,
        [
          input.name,
          input.purpose,
          input.width,
          input.height,
          input.layout,
          input.notes || '',
          input.enabled ? 1 : 0,
          now,
          displayId,
        ],
      );
      this.db.saveNow();
      return this.getDisplay(displayId);
    }
    const id = newId();
    this.db.execute(
      `INSERT INTO displays
       (id, name, purpose, width, height, layout, notes, pairing_code, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.name,
        input.purpose,
        input.width,
        input.height,
        input.layout,
        input.notes || '',
        this.generateUniquePairingCode(),
        input.enabled ? 1 : 0,
        now,
        now,
      ],
    );
    this.db.saveNow();
    this.logActivity({
      kind: 'display',
      message: `Display added: ${input.name}`,
      detail: { purpose: input.purpose, resolution: `${input.width}x${input.height}` },
    });
    return this.getDisplay(id);
  }

  deleteDisplay(id) {
    const display = this.getDisplay(id);
    if (!display) throw new NotFoundError('That display could not be found.');
    this.db.execute('DELETE FROM displays WHERE id = ?;', [id]);
    this.db.saveNow();
    this.logActivity({ kind: 'display', message: `Display removed: ${display.name}` });
    return { id };
  }

  regenerateDisplayCode(id) {
    const display = this.getDisplay(id);
    if (!display) throw new NotFoundError('That display could not be found.');
    const code = this.generateUniquePairingCode();
    this.db.execute('UPDATE displays SET pairing_code = ?, updated_at = ? WHERE id = ?;', [
      code,
      nowIso(),
      id,
    ]);
    this.db.saveNow();
    this.logActivity({
      kind: 'display',
      message: `Pairing code regenerated for ${display.name}`,
      detail: { note: 'Existing receiver connections were disconnected.' },
    });
    return this.getDisplay(id);
  }

  updateDisplayLastSeen(id, iso = nowIso()) {
    this.db.execute('UPDATE displays SET last_seen = ? WHERE id = ?;', [iso, id]);
    this.db.saveNow();
  }

  // --------------------------------------------------------------- dashboard
  dashboard() {
    const today = todayIso();
    const counts = {
      activeEvents: Number(
        this.db.get('SELECT COUNT(*) AS count FROM events WHERE archived = 0;')?.count || 0,
      ),
      liveEvents: Number(
        this.db.get("SELECT COUNT(*) AS count FROM events WHERE archived = 0 AND status = 'live';")?.count || 0,
      ),
      archivedEvents: Number(
        this.db.get('SELECT COUNT(*) AS count FROM events WHERE archived = 1;')?.count || 0,
      ),
      upcomingEvents: Number(
        this.db.get(
          `SELECT COUNT(*) AS count FROM events WHERE archived = 0 AND status != 'completed' AND event_date >= ?;`,
          [today],
        )?.count || 0,
      ),
      media: Number(this.db.get('SELECT COUNT(*) AS count FROM media_assets;')?.count || 0),
      missingMedia: Number(
        this.db.get('SELECT COUNT(*) AS count FROM media_assets WHERE available = 0;')?.count || 0,
      ),
      crew: Number(this.db.get('SELECT COUNT(*) AS count FROM operators WHERE active = 1;')?.count || 0),
      displays: Number(this.db.get('SELECT COUNT(*) AS count FROM displays WHERE enabled = 1;')?.count || 0),
    };
    const upcomingRows = this.db.all(
      `${EVENT_SELECT}
       WHERE e.archived = 0 AND e.status != 'completed' AND e.event_date >= ?
       ORDER BY e.event_date ASC, e.start_time ASC LIMIT 5;`,
      [today],
    );
    const upcoming = upcomingRows.map(mapEventRow);
    const recent = this.db
      .all(`${EVENT_SELECT} ORDER BY e.updated_at DESC LIMIT 5;`)
      .map(mapEventRow);
    const activity = this.listActivity({ limit: 8 }).items;
    const integration = this.getIntegration();
    let readiness = null;
    if (upcoming[0]) {
      const event = this.getEvent(upcoming[0].id);
      const setup = event.checklists.filter((item) => item.kind === 'setup');
      readiness = {
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.eventDate,
        startTime: event.startTime,
        cueCount: event.cues.length,
        missingAssets: event.readiness.missingAssets,
        missingCueAssets: event.readiness.missingCueAssets,
        setupTotal: setup.length,
        setupDone: setup.filter((item) => item.done).length,
      };
    }
    return {
      counts,
      upcoming,
      recent,
      activity,
      integration,
      readiness,
      generatedAt: nowIso(),
    };
  }

  // ------------------------------------------------------------ backup hooks
  exportTables() {
    const tables = [
      'settings',
      'events',
      'media_assets',
      'operators',
      'cues',
      'assignments',
      'checklists',
      'displays',
      'activity',
    ];
    return Object.fromEntries(tables.map((table) => [table, this.db.all(`SELECT * FROM ${table};`)]));
  }

  restoreTables(tables) {
    const order = [
      'settings',
      'operators',
      'events',
      'media_assets',
      'cues',
      'assignments',
      'checklists',
      'displays',
      'activity',
    ];
    const deleteOrder = [...order].reverse();
    this.db.transaction(() => {
      for (const table of deleteOrder) this.db.execute(`DELETE FROM ${table};`);
      for (const table of order) {
        const rows = tables[table] || [];
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.length) continue;
          const placeholders = columns.map(() => '?').join(', ');
          this.db.execute(
            `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')})
             VALUES (${placeholders});`,
            columns.map((column) => row[column]),
          );
        }
      }
    });
  }
}
