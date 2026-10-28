'use strict';

/**
 * Sandboxed preload bridge. Only the explicit methods below are exposed to the
 * renderer. Channel names are duplicated here deliberately because a sandboxed
 * preload cannot require local modules; tests/unit/preload-contract.test.js
 * verifies that this file and shared/ipc.cjs stay in sync.
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

const api = {
  app: {
    info: invoke('app:info'),
    openExternal: invoke('app:open-external'),
    openDataFolder: invoke('app:open-data-folder'),
  },
  setup: {
    complete: invoke('setup:complete'),
  },
  settings: {
    get: invoke('settings:get'),
    update: invoke('settings:update'),
  },
  dashboard: {
    summary: invoke('dashboard:summary'),
  },
  events: {
    list: invoke('events:list'),
    get: invoke('events:get'),
    create: invoke('events:create'),
    update: invoke('events:update'),
    duplicate: invoke('events:duplicate'),
    archive: invoke('events:archive'),
    remove: invoke('events:delete'),
    runtime: invoke('events:runtime'),
    exportSheet: invoke('events:export-sheet'),
    exportPlan: invoke('events:export-plan'),
    importPlan: invoke('events:import-plan'),
  },
  cues: {
    create: invoke('cues:create'),
    update: invoke('cues:update'),
    remove: invoke('cues:delete'),
    reorder: invoke('cues:reorder'),
  },
  media: {
    list: invoke('media:list'),
    addFiles: invoke('media:add-files'),
    addFolder: invoke('media:add-folder'),
    checkAll: invoke('media:check-all'),
    relink: invoke('media:relink'),
    relinkFolder: invoke('media:relink-folder'),
    remove: invoke('media:remove'),
    update: invoke('media:update'),
    probe: invoke('media:probe'),
    exportMetadata: invoke('media:export'),
    importMetadata: invoke('media:import'),
    open: invoke('media:open'),
    reveal: invoke('media:reveal'),
  },
  crew: {
    operators: invoke('operators:list'),
    saveOperator: invoke('operators:save'),
    removeOperator: invoke('operators:delete'),
    saveAssignment: invoke('assignments:save'),
    removeAssignment: invoke('assignments:delete'),
    saveChecklist: invoke('checklists:save'),
    removeChecklist: invoke('checklists:delete'),
  },
  activity: {
    list: invoke('activity:list'),
    log: invoke('activity:log'),
  },
  displays: {
    list: invoke('displays:list'),
    save: invoke('displays:save'),
    remove: invoke('displays:delete'),
    regenerateCode: invoke('displays:regenerate-code'),
    serverStatus: invoke('displays:server-status'),
    startServer: invoke('displays:server-start'),
    stopServer: invoke('displays:server-stop'),
    links: invoke('displays:links'),
    openReceiver: invoke('displays:open-receiver'),
    push: invoke('displays:push'),
    test: invoke('displays:test'),
    blackout: invoke('displays:blackout'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('event:screen-status', listener);
      return () => ipcRenderer.removeListener('event:screen-status', listener);
    },
    onServerStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('event:server-status', listener);
      return () => ipcRenderer.removeListener('event:server-status', listener);
    },
  },
  integrations: {
    get: invoke('integrations:get'),
    save: invoke('integrations:save'),
    test: invoke('integrations:test'),
    send: invoke('integrations:send'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('event:integration-status', listener);
      return () => ipcRenderer.removeListener('event:integration-status', listener);
    },
  },
  backup: {
    create: invoke('backup:create'),
    restore: invoke('backup:restore'),
    integrity: invoke('backup:integrity'),
    stats: invoke('backup:stats'),
  },
};

try {
  contextBridge.exposeInMainWorld('showflow', Object.freeze(api));
} catch (error) {
  console.error('ShowFlow preload bridge could not be exposed', error);
}
