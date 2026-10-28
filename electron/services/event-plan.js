import path from 'node:path';
import {
  EVENT_PLAN_FORMAT,
  EVENT_PLAN_SCHEMA_VERSION,
} from '../../shared/defaults.js';
import { CREW_ROLE_VALUES } from '../../shared/enums.js';
import {
  ValidationError,
  assertObject,
  validateAssignmentInput,
  validateChecklistInput,
  validateCueInput,
  validateEventInput,
} from '../../shared/validation.js';

const MAX_PLAN_BYTES = 10 * 1024 * 1024;

export function buildEventPlan(event, { appVersion }) {
  const operators = new Map(event.assignments.map((assignment) => [assignment.operatorId, assignment]));
  return {
    format: EVENT_PLAN_FORMAT,
    schemaVersion: EVENT_PLAN_SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    event: {
      title: event.title,
      description: event.description,
      venue: event.venue,
      eventDate: event.eventDate,
      startTime: event.startTime,
      notes: event.notes,
      technicalNotes: event.technicalNotes,
      originalStatus: event.status,
    },
    cues: event.cues.map((cue) => ({
      title: cue.title,
      type: cue.type,
      notes: cue.notes,
      fallback: cue.fallback,
      operatorName: cue.operatorName || '',
      durationSeconds: cue.durationSeconds,
      assetPath: cue.asset?.path || '',
      assetName: cue.asset?.name || '',
      resolumeAction: cue.resolumeAction,
      resolumeLayer: cue.resolumeLayer,
      resolumeClip: cue.resolumeClip,
      resolumeValue: cue.resolumeValue,
    })),
    assignments: event.assignments.map((assignment) => ({
      role: assignment.role,
      roleLabel: assignment.roleLabel,
      operatorName: assignment.operatorName || '',
      notes: assignment.notes,
    })),
    checklists: event.checklists.map((item) => ({
      kind: item.kind,
      title: item.title,
      owner: item.owner,
    })),
    media: event.media.map((asset) => ({
      name: asset.name,
      path: asset.path,
      kind: asset.kind,
      tags: asset.tags,
      category: asset.category,
      notes: asset.notes,
    })),
    warnings: event.readiness.missingCueAssets.map((item) => `${item.cueTitle}: ${item.assetName} was missing when exported.`),
    metadata: {
      assignmentCount: event.assignments.length,
      cueCount: event.cues.length,
      mediaCount: event.media.length,
      operatorCount: operators.size,
    },
  };
}

function validatePlan(plan) {
  assertObject(plan, 'Event plan');
  if (plan.format !== EVENT_PLAN_FORMAT) throw new ValidationError('This file is not a ShowFlow event plan.');
  if (plan.schemaVersion !== EVENT_PLAN_SCHEMA_VERSION) {
    throw new ValidationError(
      `This event plan uses schema version ${plan.schemaVersion}; this build supports version ${EVENT_PLAN_SCHEMA_VERSION}.`,
    );
  }
  if (!plan.event || typeof plan.event !== 'object') throw new ValidationError('The event plan is missing its event details.');
  if (!Array.isArray(plan.cues)) throw new ValidationError('The event plan is missing its cue list.');
  if (!Array.isArray(plan.assignments || [])) throw new ValidationError('The event plan crew list is invalid.');
  if (!Array.isArray(plan.checklists || [])) throw new ValidationError('The event plan checklist list is invalid.');
  if (plan.cues.length > 1000) throw new ValidationError('This event plan contains too many cues (maximum 1000).');
  if ((plan.assignments || []).length > 300) throw new ValidationError('This event plan contains too many crew assignments.');
  if ((plan.checklists || []).length > 1000) throw new ValidationError('This event plan contains too many checklist items.');
  return plan;
}

export function parseEventPlanJson(raw) {
  if (typeof raw !== 'string') throw new ValidationError('Event plan file could not be read.');
  if (Buffer.byteLength(raw, 'utf8') > MAX_PLAN_BYTES) {
    throw new ValidationError('This event plan is too large to import safely.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('The event plan is not valid JSON.');
  }
  return validatePlan(parsed);
}

export function importEventPlan(plan, repository) {
  const validated = validatePlan(plan);
  const eventInput = validateEventInput(validated.event);
  const operators = repository.listOperators();
  const operatorByName = new Map(
    operators.map((operator) => [operator.name.trim().toLowerCase(), operator]),
  );
  const media = repository.listMedia({ limit: 5000 }).items;
  const assetByPath = new Map(
    media.map((asset) => [path.resolve(asset.path).toLowerCase(), asset]),
  );
  const warnings = [];

  const cues = validated.cues.map((rawCue, index) => {
    const operator = rawCue.operatorName
      ? operatorByName.get(String(rawCue.operatorName).trim().toLowerCase())
      : null;
    if (rawCue.operatorName && !operator) {
      warnings.push(`Cue ${index + 1} (${rawCue.title}): crew member “${rawCue.operatorName}” was not found; cue imported unassigned.`);
    }
    const asset = rawCue.assetPath
      ? assetByPath.get(path.resolve(String(rawCue.assetPath)).toLowerCase())
      : null;
    if (rawCue.assetPath && !asset) {
      warnings.push(`Cue ${index + 1} (${rawCue.title}): media “${rawCue.assetName || rawCue.assetPath}” was not found in MediaVault; imported without a linked file.`);
    }
    return validateCueInput({
      title: rawCue.title,
      type: rawCue.type,
      notes: rawCue.notes,
      fallback: rawCue.fallback,
      operatorId: operator?.id || null,
      durationSeconds: rawCue.durationSeconds,
      assetId: asset?.id || null,
      resolumeAction: rawCue.resolumeAction,
      resolumeLayer: rawCue.resolumeLayer,
      resolumeClip: rawCue.resolumeClip,
      resolumeValue: rawCue.resolumeValue,
    });
  });

  const assignments = (validated.assignments || []).map((rawAssignment) => {
    const operator = rawAssignment.operatorName
      ? operatorByName.get(String(rawAssignment.operatorName).trim().toLowerCase())
      : null;
    if (rawAssignment.operatorName && !operator) {
      warnings.push(`Crew assignment “${rawAssignment.operatorName}” was not found; imported without a linked crew member.`);
    }
    return validateAssignmentInput({
      eventId: '00000000-0000-4000-8000-000000000000',
      operatorId: operator?.id || null,
      role: CREW_ROLE_VALUES.includes(rawAssignment.role) ? rawAssignment.role : 'custom',
      roleLabel: rawAssignment.roleLabel || rawAssignment.role,
      notes: rawAssignment.notes,
    });
  });

  const checklists = (validated.checklists || []).map((rawItem) =>
    validateChecklistInput({
      eventId: '00000000-0000-4000-8000-000000000000',
      kind: rawItem.kind,
      title: rawItem.title,
      owner: rawItem.owner,
      done: false,
    }),
  );

  const event = repository.createEventBundle(eventInput, cues, assignments, checklists);
  repository.logActivity({
    eventId: event.id,
    kind: 'event',
    message: `Imported ${cues.length} cue${cues.length === 1 ? '' : 's'} from an event plan`,
    detail: { warnings: warnings.length },
  });
  return { event, warnings };
}

export function serialiseEventPlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
