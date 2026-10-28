export const EVENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  REHEARSAL: 'rehearsal',
  LIVE: 'live',
  COMPLETED: 'completed',
  INTERRUPTED: 'interrupted',
});

export const EVENT_STATUS_VALUES = Object.freeze(Object.values(EVENT_STATUS));

export const EVENT_STATUS_META = Object.freeze({
  draft: { label: 'Draft', tone: 'neutral' },
  rehearsal: { label: 'Rehearsal', tone: 'amber' },
  live: { label: 'Live', tone: 'red' },
  completed: { label: 'Completed', tone: 'green' },
  interrupted: { label: 'Interrupted', tone: 'amber' },
});

export const CUE_STATUS = Object.freeze({
  READY: 'ready',
  LIVE: 'live',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  WARNING: 'warning',
  ERROR: 'error',
});

export const CUE_STATUS_META = Object.freeze({
  ready: { label: 'Ready', tone: 'neutral' },
  live: { label: 'Live', tone: 'red' },
  completed: { label: 'Complete', tone: 'green' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  warning: { label: 'Warning', tone: 'amber' },
  error: { label: 'Error', tone: 'red' },
});

export const EXECUTION_STATE = Object.freeze({
  IDLE: 'idle',
  REQUESTED: 'requested',
  ACKNOWLEDGED: 'acknowledged',
  COMPLETED: 'completed',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
});

export const EXECUTION_STATE_META = Object.freeze({
  idle: { label: 'No command', tone: 'neutral' },
  requested: { label: 'Requested', tone: 'cyan' },
  acknowledged: { label: 'Acknowledged', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  unknown: { label: 'Unverified', tone: 'amber' },
});

export const CUE_TYPES = Object.freeze([
  { value: 'video', label: 'Video', description: 'Playback, projection or playback software cue.' },
  { value: 'audio', label: 'Audio', description: 'Music, microphone or sound effect cue.' },
  { value: 'image', label: 'Image', description: 'Still image, slide or graphic cue.' },
  { value: 'presentation', label: 'Presentation', description: 'Slides or speaker support cue.' },
  { value: 'lighting', label: 'Lighting', description: 'Lighting state or lighting operator instruction.' },
  { value: 'stage', label: 'Stage', description: 'Stage movement, prop or people cue.' },
  { value: 'countdown', label: 'Countdown', description: 'Timed countdown to a moment on stage.' },
  { value: 'manual', label: 'Manual', description: 'Operator action that cannot be automated.' },
  { value: 'custom', label: 'Custom', description: 'Any other production cue.' },
]);

export const CUE_TYPE_VALUES = Object.freeze(CUE_TYPES.map((t) => t.value));

export const CUE_TYPE_MAP = Object.freeze(
  Object.fromEntries(CUE_TYPES.map((type) => [type.value, type])),
);

export const CREW_ROLES = Object.freeze([
  { value: 'show_caller', label: 'Show caller', short: 'CALLER' },
  { value: 'playback', label: 'Playback operator', short: 'PLAYBACK' },
  { value: 'display', label: 'Display operator', short: 'DISPLAY' },
  { value: 'audio', label: 'Audio operator', short: 'AUDIO' },
  { value: 'stage_manager', label: 'Stage manager', short: 'STAGE' },
  { value: 'lighting', label: 'Lighting operator', short: 'LIGHTS' },
  { value: 'technician', label: 'Technician', short: 'TECH' },
  { value: 'custom', label: 'Custom role', short: 'CREW' },
]);

export const CREW_ROLE_VALUES = Object.freeze(CREW_ROLES.map((r) => r.value));

export const CREW_ROLE_MAP = Object.freeze(
  Object.fromEntries(CREW_ROLES.map((role) => [role.value, role])),
);

export const DISPLAY_PURPOSE = Object.freeze({
  LIVE: 'live',
  PREVIEW: 'preview',
});

export const DISPLAY_PURPOSE_META = Object.freeze({
  live: { label: 'Live output', tone: 'red' },
  preview: { label: 'Preview', tone: 'cyan' },
});

export const DISPLAY_LAYOUTS = Object.freeze([
  { value: 'full', label: 'Full screen', description: 'Current cue, next cue and event clock.' },
  { value: 'lower_third', label: 'Lower third', description: 'Cue information along the lower edge.' },
  { value: 'minimal', label: 'Minimal', description: 'Current cue and time only.' },
]);

export const DISPLAY_LAYOUT_VALUES = Object.freeze(DISPLAY_LAYOUTS.map((l) => l.value));

export const CHECKLIST_KINDS = Object.freeze({
  SETUP: 'setup',
  SHUTDOWN: 'shutdown',
});

export const CHECKLIST_KIND_META = Object.freeze({
  setup: { label: 'Setup checklist' },
  shutdown: { label: 'Shutdown checklist' },
});

export const CHECKLIST_KIND_VALUES = Object.freeze(Object.values(CHECKLIST_KINDS));

export const ACTIVITY_KINDS = Object.freeze([
  'event',
  'cue',
  'media',
  'display',
  'integration',
  'crew',
  'backup',
  'system',
]);

export const MEDIA_KIND_VALUES = Object.freeze([
  'video',
  'audio',
  'image',
  'presentation',
  'document',
  'other',
]);

export const INTEGRATION_MODES = Object.freeze({
  MOCK: 'mock',
  RESOLUME: 'resolume',
});

export const INTEGRATION_MODE_VALUES = Object.freeze(Object.values(INTEGRATION_MODES));

export const RESOLUME_ACTIONS = Object.freeze([
  {
    value: 'none',
    label: 'No Resolume action',
    description: 'The cue is operated manually.',
  },
  {
    value: 'clip_connect',
    label: 'Connect clip',
    description: 'Trigger a clip in a Resolume layer.',
  },
  {
    value: 'layer_opacity',
    label: 'Set layer opacity',
    description: 'Set the video opacity of a layer.',
  },
]);

export const RESOLUME_ACTION_VALUES = Object.freeze(RESOLUME_ACTIONS.map((a) => a.value));

export const RUNTIME_MODE = Object.freeze({
  LIVE: 'live',
  REHEARSAL: 'rehearsal',
});
