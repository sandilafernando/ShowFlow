import path from 'node:path';
import {
  CUE_TYPE_VALUES,
  CREW_ROLE_VALUES,
  DISPLAY_LAYOUT_VALUES,
  DISPLAY_PURPOSE_META,
  EVENT_STATUS_VALUES,
  INTEGRATION_MODE_VALUES,
  RESOLUME_ACTION_VALUES,
  CHECKLIST_KIND_VALUES,
  ACTIVITY_KINDS,
  MEDIA_KIND_VALUES,
} from './enums.js';
import { validateIntegrationTarget } from './resolume.js';

export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION';
    this.details = details;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function assertObject(value, label = 'Input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object.`);
  }
  return value;
}

export function text(value, field, { required = false, min = 0, max = 500, multiline = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text.`);
  // Strip NUL characters because SQLite text fields cannot store them safely.
  // eslint-disable-next-line no-control-regex
  let cleaned = value.replace(/\u0000/g, '');
  if (!multiline) cleaned = cleaned.replace(/[\r\n\t]+/g, ' ');
  cleaned = cleaned.replace(/\r\n/g, '\n').trim();
  if (required && cleaned.length < Math.max(1, min)) {
    throw new ValidationError(`${field} is required.`);
  }
  if (cleaned.length < min) throw new ValidationError(`${field} must be at least ${min} characters.`);
  if (cleaned.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer.`);
  return cleaned;
}

export function id(value, field, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new ValidationError(`${field} is required.`);
  }
  if (!isId(value)) throw new ValidationError(`${field} is not a valid identifier.`);
  return value;
}

export function optionalId(value, field) {
  return id(value, field, { optional: true });
}

export function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

export function integer(value, field, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== null) return fallback;
  const number = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number)) {
    throw new ValidationError(`${field} must be a whole number.`);
  }
  if (number < min || number > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max}.`);
  }
  return number;
}

export function numeric(value, field, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new ValidationError(`${field} is required.`);
  }
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new ValidationError(`${field} must be a number.`);
  }
  if (number < min || number > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max}.`);
  }
  return number;
}

export function boolean(value, field) {
  if (typeof value !== 'boolean') throw new ValidationError(`${field} must be true or false.`);
  return value;
}

export function dateString(value, field, { required = true } = {}) {
  if (!value && !required) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${field} must use YYYY-MM-DD format.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ValidationError(`${field} is not a valid calendar date.`);
  }
  return value;
}

export function timeString(value, field, { required = false } = {}) {
  if (!value) {
    if (required) throw new ValidationError(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ValidationError(`${field} must use 24-hour HH:MM format.`);
  }
  return value;
}

export function tags(value, field = 'Tags') {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`);
  if (value.length > 24) throw new ValidationError(`${field} may contain at most 24 items.`);
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    const cleaned = text(entry, field, { max: 32 });
    const key = cleaned.toLowerCase();
    if (cleaned && !seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }
  return result;
}

export function idList(value, field, { minLength = 0 } = {}) {
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`);
  if (value.length < minLength) throw new ValidationError(`${field} is incomplete.`);
  if (value.length > 2000) throw new ValidationError(`${field} is too large.`);
  const result = value.map((entry) => id(entry, field));
  if (new Set(result).size !== result.length) {
    throw new ValidationError(`${field} contains duplicate identifiers.`);
  }
  return result;
}

function optionalNumberOrNull(value, field, opts) {
  if (value === undefined || value === null || value === '') return null;
  return numeric(value, field, opts);
}

export function validateEventInput(raw) {
  const input = assertObject(raw, 'Event');
  const status = input.status ? oneOf(input.status, 'Event status', EVENT_STATUS_VALUES) : undefined;
  return {
    title: text(input.title, 'Event title', { required: true, min: 1, max: 160 }),
    description: text(input.description, 'Description', { max: 4000, multiline: true }),
    venue: text(input.venue, 'Venue', { max: 160 }),
    eventDate: dateString(input.eventDate, 'Event date'),
    startTime: timeString(input.startTime, 'Start time'),
    notes: text(input.notes, 'Production notes', { max: 8000, multiline: true }),
    technicalNotes: text(input.technicalNotes, 'Technical notes', { max: 8000, multiline: true }),
    ...(status ? { status } : {}),
  };
}

export function validateCueInput(raw) {
  const input = assertObject(raw, 'Cue');
  const type = oneOf(input.type, 'Cue type', CUE_TYPE_VALUES);
  const resolumeAction = input.resolumeAction
    ? oneOf(input.resolumeAction, 'Resolume action', RESOLUME_ACTION_VALUES)
    : 'none';
  const resolumeLayer =
    resolumeAction === 'none' ? null : integer(input.resolumeLayer, 'Resolume layer', { min: 1, max: 999 });
  const resolumeClip =
    resolumeAction !== 'clip_connect'
      ? null
      : integer(input.resolumeClip, 'Resolume clip', { min: 1, max: 9999 });
  const resolumeValue =
    resolumeAction !== 'layer_opacity'
      ? null
      : numeric(input.resolumeValue, 'Resolume opacity', { min: 0, max: 1 });
  return {
    title: text(input.title, 'Cue title', { required: true, min: 1, max: 160 }),
    type,
    notes: text(input.notes, 'Cue notes', { max: 3000, multiline: true }),
    fallback: text(input.fallback, 'Fallback instructions', { max: 3000, multiline: true }),
    operatorId: optionalId(input.operatorId, 'Operator'),
    durationSeconds: integer(input.durationSeconds, 'Duration', { min: 0, max: 86400, fallback: 0 }),
    assetId: optionalId(input.assetId, 'Media asset'),
    resolumeAction,
    resolumeLayer,
    resolumeClip,
    resolumeValue,
  };
}

export function validateOperatorInput(raw) {
  const input = assertObject(raw, 'Crew member');
  return {
    name: text(input.name, 'Crew member name', { required: true, min: 1, max: 80 }),
    role: oneOf(input.role, 'Role', CREW_ROLE_VALUES),
    contact: text(input.contact, 'Contact', { max: 160 }),
    active: input.active === undefined ? true : boolean(input.active, 'Active'),
  };
}

export function validateAssignmentInput(raw) {
  const input = assertObject(raw, 'Assignment');
  const role = oneOf(input.role, 'Role', CREW_ROLE_VALUES);
  return {
    id: input.id ? id(input.id, 'Assignment') : null,
    eventId: id(input.eventId, 'Event'),
    operatorId: optionalId(input.operatorId, 'Crew member'),
    role,
    roleLabel:
      role === 'custom'
        ? text(input.roleLabel, 'Custom role label', { max: 60 })
        : '',
    notes: text(input.notes, 'Assignment notes', { max: 2000, multiline: true }),
  };
}

export function validateChecklistInput(raw) {
  const input = assertObject(raw, 'Checklist item');
  return {
    id: input.id ? id(input.id, 'Checklist item') : null,
    eventId: id(input.eventId, 'Event'),
    kind: oneOf(input.kind, 'Checklist kind', CHECKLIST_KIND_VALUES),
    title: text(input.title, 'Checklist item', { required: true, min: 1, max: 200 }),
    owner: text(input.owner, 'Owner', { max: 80 }),
    done: input.done === undefined ? false : boolean(input.done, 'Done'),
  };
}

export function validateDisplayInput(raw) {
  const input = assertObject(raw, 'Display');
  return {
    name: text(input.name, 'Display name', { required: true, min: 1, max: 60 }),
    purpose: oneOf(input.purpose, 'Purpose', Object.keys(DISPLAY_PURPOSE_META)),
    width: integer(input.width, 'Width', { min: 320, max: 7680 }),
    height: integer(input.height, 'Height', { min: 200, max: 4320 }),
    layout: oneOf(input.layout, 'Layout', DISPLAY_LAYOUT_VALUES),
    notes: text(input.notes, 'Display notes', { max: 1000, multiline: true }),
    enabled: input.enabled === undefined ? true : boolean(input.enabled, 'Enabled'),
  };
}

export function validateSettingsPatch(raw) {
  const input = assertObject(raw, 'Settings');
  const output = {};
  if ('operatorName' in input) output.operatorName = text(input.operatorName, 'Operator name', { max: 80 });
  if ('defaultVenue' in input) output.defaultVenue = text(input.defaultVenue, 'Default venue', { max: 160 });
  if ('receiverPort' in input) {
    output.receiverPort = integer(input.receiverPort, 'Receiver port', { min: 1024, max: 65535 });
  }
  if ('autoBackup' in input) output.autoBackup = boolean(input.autoBackup, 'Automatic backups');
  if ('backupRetention' in input) {
    output.backupRetention = integer(input.backupRetention, 'Backup retention', { min: 3, max: 30 });
  }
  if ('onboardingComplete' in input) {
    output.onboardingComplete = boolean(input.onboardingComplete, 'Onboarding status');
  }
  return output;
}

export function validateIntegrationConfig(raw) {
  const input = assertObject(raw, 'Integration settings');
  const mode = oneOf(input.mode, 'Integration mode', INTEGRATION_MODE_VALUES);
  const target = validateIntegrationTarget({ host: input.host, port: input.port });
  if (!target.ok) throw new ValidationError(target.message);
  return {
    mode,
    host: target.host,
    port: target.port,
    enabled: input.enabled === undefined ? false : boolean(input.enabled, 'Enabled'),
  };
}

export function validateMediaUpdate(raw) {
  const input = assertObject(raw, 'Media update');
  const output = {};
  if ('name' in input) output.name = text(input.name, 'Display name', { required: true, min: 1, max: 240 });
  if ('tags' in input) output.tags = tags(input.tags);
  if ('category' in input) output.category = text(input.category, 'Category', { max: 60 });
  if ('notes' in input) output.notes = text(input.notes, 'Notes', { max: 2000, multiline: true });
  if ('eventId' in input) output.eventId = optionalId(input.eventId, 'Event');
  return output;
}

export function validateProbeResult(raw) {
  const input = assertObject(raw, 'Media metadata');
  return {
    durationSeconds: optionalNumberOrNull(input.durationSeconds, 'Duration', { min: 0, max: 864000 }),
    width: optionalNumberOrNull(input.width, 'Width', { min: 0, max: 30000 }),
    height: optionalNumberOrNull(input.height, 'Height', { min: 0, max: 30000 }),
  };
}

export function validateActivityEntry(raw) {
  const input = assertObject(raw, 'Activity entry');
  return {
    eventId: optionalId(input.eventId, 'Event'),
    kind: oneOf(input.kind, 'Activity kind', ACTIVITY_KINDS),
    message: text(input.message, 'Activity message', { required: true, min: 1, max: 600 }),
    mode: input.mode ? oneOf(input.mode, 'Mode', ['live', 'rehearsal', 'system']) : 'system',
    detail: input.detail && typeof input.detail === 'object' ? input.detail : null,
  };
}

export function validateMediaImportRecord(raw) {
  const input = assertObject(raw, 'Library record');
  const filePath = text(input.path, 'Path', { required: true, max: 3000 });
  if (!path.isAbsolute(filePath)) throw new ValidationError('Media path must be absolute.');
  return {
    path: filePath,
    name: text(input.name, 'Name', { required: true, max: 240 }),
    kind: oneOf(input.kind, 'Media kind', MEDIA_KIND_VALUES),
    tags: tags(input.tags),
    category: text(input.category, 'Category', { max: 60 }),
    notes: text(input.notes, 'Notes', { max: 2000, multiline: true }),
  };
}

export function safeJsonSize(value, maxBytes = 4000) {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > maxBytes) return null;
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}
