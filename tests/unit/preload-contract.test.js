import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import IPC from '../../shared/ipc.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const allowlist = Object.values(IPC);

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

const preloadSource = read('electron', 'preload.cjs');
const registerSource = read('electron', 'ipc', 'register.js');
const mainSource = read('electron', 'main.js');

describe('preload and IPC allowlist contract', () => {
  it('never invokes a channel outside the audited allowlist', () => {
    const invoked = matches(preloadSource, /invoke\('([^']+)'\)/g);
    expect(invoked.length).toBeGreaterThan(50);
    expect(new Set(invoked).size).toBe(invoked.length);
    for (const channel of invoked) expect(allowlist).toContain(channel);
  });

  it('never listens to a channel outside the audited allowlist', () => {
    const listened = matches(preloadSource, /ipcRenderer\.on\('([^']+)'/g);
    expect(listened.sort()).toEqual(
      ['event:integration-status', 'event:screen-status', 'event:server-status'].sort(),
    );
    for (const channel of listened) expect(allowlist).toContain(channel);
  });

  it('registers a handler for every exposed invoke channel', () => {
    const invoked = new Set(matches(preloadSource, /invoke\('([^']+)'\)/g));
    const handled = matches(registerSource, /handle\(IPC\.([A-Z0-9_]+),/g).map((key) => {
      expect(IPC).toHaveProperty(key);
      return IPC[key];
    });
    expect(new Set(handled).size).toBe(handled.length);
    expect([...handled].sort()).toEqual([...invoked].sort());
    for (const key of matches(registerSource, /handle\(IPC\.([A-Z0-9_]+),/g)) {
      expect(allowlist).toContain(IPC[key]);
    }
  });

  it('exposes only frozen, explicit methods through contextBridge', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('showflow', Object.freeze(api))");
    expect(preloadSource).not.toContain('ipcRenderer.send(');
    expect(preloadSource).not.toContain('ipcRenderer.sendSync');
    expect(preloadSource).not.toContain('nodeIntegration');
    expect(preloadSource).not.toContain("require('fs')");
    expect(preloadSource).not.toContain("require('path')");
  });

  it('rejects untrusted senders and unknown channels in the main process', () => {
    expect(registerSource).toContain('assertTrustedSender(event)');
    expect(registerSource).toContain('event.sender !== window.webContents');
    expect(registerSource).toContain('event.senderFrame?.parent');
    expect(registerSource).toContain('if (!Object.values(IPC).includes(channel))');
    expect(registerSource).toContain("throw new Error(`Attempted to register an unknown IPC channel: ${channel}`)");
  });
});

describe('Electron security posture', () => {
  it('uses isolation, sandboxing, no Node integration and a restricted preload', () => {
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('webviewTag: false');
    expect(mainSource).toContain('webSecurity: true');
    expect(mainSource).toContain('allowRunningInsecureContent: false');
    expect(mainSource).toContain("preload: preloadPath");
  });

  it('blocks navigation, popups, webviews, permissions and unsafe CSP directives', () => {
    expect(mainSource).toContain("return { action: 'deny' };");
    expect(mainSource).toContain("window.webContents.on('will-navigate'");
    expect(mainSource).toContain('event.preventDefault()');
    expect(mainSource).toContain("window.webContents.on('will-attach-webview'");
    expect(mainSource).toContain('setPermissionRequestHandler');
    expect(mainSource).toContain('setPermissionCheckHandler');
    expect(mainSource).toContain("default-src 'self'");
    expect(mainSource).toContain("script-src 'self'");
    expect(mainSource).toContain("object-src 'none'");
    expect(mainSource).toContain("frame-ancestors 'none'");
    expect(mainSource).toContain("connect-src 'self'");
  });

  it('only opens allowlisted HTTPS links and indexes supported media through a custom protocol', () => {
    expect(registerSource).toContain("parsed.protocol !== 'https:'");
    expect(registerSource).toContain('EXTERNAL_HOSTS.has(parsed.hostname)');
    expect(mainSource).toContain("protocol.handle('showflow-media'");
    expect(mainSource).toContain("url.hostname !== 'asset'");
    expect(mainSource).toContain('isSupportedMediaPath(asset.path)');
    expect(mainSource).toContain('net.fetch(pathToFileURL(asset.path).toString())');
  });

  it('does not replay commands or auto-start transmission after restart', () => {
    expect(mainSource).toContain('recoverInterruptedSessions()');
    expect(mainSource).toContain('without replaying commands');
    expect(mainSource).toContain('No pending commands are replayed.');
    expect(mainSource).not.toContain('receiver.start(');
    expect(mainSource).not.toContain('sendCue(');
  });
});
