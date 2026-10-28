export const DEFAULT_SETTINGS = Object.freeze({
  onboardingComplete: false,
  operatorName: '',
  defaultVenue: '',
  receiverPort: 41730,
  autoBackup: true,
  backupRetention: 8,
});

export const DEFAULT_INTEGRATION = Object.freeze({
  mode: 'mock',
  host: '127.0.0.1',
  port: 7000,
  enabled: false,
});

export const DEFAULT_APP_PREFERENCES = Object.freeze({
  mediaView: 'grid',
});

export const DATABASE_SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'showflow-backup';
export const BACKUP_SCHEMA_VERSION = 1;
export const EVENT_PLAN_FORMAT = 'showflow-event-plan';
export const EVENT_PLAN_SCHEMA_VERSION = 1;
export const MEDIA_LIBRARY_FORMAT = 'showflow-media-library';
export const MEDIA_LIBRARY_SCHEMA_VERSION = 1;
