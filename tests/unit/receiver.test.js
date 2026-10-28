import net from 'node:net';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { ReceiverServer } from '../../electron/services/receiver.js';
import { validateDisplayInput } from '../../shared/validation.js';
import { createTestContext, silentLogger } from './helpers.js';

const contexts = [];
const servers = [];
const sockets = [];

async function context() {
  const value = await createTestContext();
  contexts.push(value);
  return value;
}

async function getFreePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function makeDisplay(ctx, overrides = {}) {
  return ctx.repo.saveDisplay(
    validateDisplayInput({
      name: 'Main projector',
      purpose: 'live',
      width: 1920,
      height: 1080,
      layout: 'full',
      notes: '',
      enabled: true,
      ...overrides,
    }),
  );
}

async function startReceiver(ctx) {
  const statuses = [];
  const server = new ReceiverServer({
    repository: ctx.repo,
    logger: silentLogger,
    onStatusChange: (status) => statuses.push(status),
  });
  const port = await getFreePort();
  await server.start(port);
  servers.push(server);
  return { server, port, statuses };
}

async function waitFor(predicate, description, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function waitForEvent(emitter, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const onEvent = (value) => {
      cleanup();
      resolve(value);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timer);
      emitter.off(event, onEvent);
      emitter.off('error', onError);
    }
    emitter.once(event, onEvent);
    emitter.once('error', onError);
  });
}

async function connectDisplay(port, display) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/ws?displayId=${encodeURIComponent(display.id)}&code=${encodeURIComponent(display.pairingCode)}`,
  );
  sockets.push(socket);
  socket.messages = [];
  socket.on('message', (data) => {
    socket.messages.push(JSON.parse(data.toString('utf8')));
  });
  await waitForEvent(socket, 'open');
  return socket;
}

afterEach(async () => {
  while (sockets.length) {
    const socket = sockets.pop();
    try {
      socket.close();
    } catch {
      /* already closed */
    }
  }
  while (servers.length) {
    const server = servers.pop();
    try {
      await server.stop({ silent: true });
    } catch {
      /* already stopped */
    }
  }
  while (contexts.length) await contexts.pop().cleanup();
});

describe('ScreenPilot receiver server', () => {
  it('starts, serves health, and stops cleanly', async () => {
    const ctx = await context();
    const { server, port, statuses } = await startReceiver(ctx);

    expect(server.getStatus()).toMatchObject({
      running: true,
      port,
      error: null,
      localBaseUrl: `http://127.0.0.1:${port}`,
    });
    expect(server.getStatus().startedAt).toEqual(expect.any(String));
    expect(statuses.at(-1).running).toBe(true);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get('cache-control')).toBe('no-store');
    await expect(health.json()).resolves.toMatchObject({
      app: 'ShowFlow ScreenPilot',
      ok: true,
      running: true,
    });

    const root = await fetch(`http://127.0.0.1:${port}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('receiver server is running');

    await server.stop();
    expect(server.getStatus()).toMatchObject({ running: false, port: null, localBaseUrl: null });
    expect(statuses.at(-1).running).toBe(false);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  it('serves a receiver page only for a valid per-display pairing code', async () => {
    const ctx = await context();
    const display = makeDisplay(ctx, { name: 'Stage left <LED>' });
    const { server, port } = await startReceiver(ctx);

    const valid = await fetch(
      `http://127.0.0.1:${port}/r/${display.id}?code=${display.pairingCode}`,
    );
    expect(valid.status).toBe(200);
    expect(valid.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await valid.text();
    expect(html).toContain('Stage left &lt;LED&gt;');
    expect(html).toContain(display.id);
    expect(html).not.toContain('Stage left <LED>');

    const invalid = await fetch(`http://127.0.0.1:${port}/r/${display.id}?code=000000`);
    expect(invalid.status).toBe(403);
    expect(await invalid.text()).toContain('PAIRING FAILED');

    const regenerated = ctx.repo.regenerateDisplayCode(display.id);
    const stale = await fetch(`http://127.0.0.1:${port}/r/${display.id}?code=${display.pairingCode}`);
    expect(stale.status).toBe(403);
    const fresh = await fetch(`http://127.0.0.1:${port}/r/${regenerated.id}?code=${regenerated.pairingCode}`);
    expect(fresh.status).toBe(200);

    const links = server.getLinks(regenerated.id);
    expect(links.links[0]).toMatchObject({
      label: 'This computer',
      receiverUrl: `http://127.0.0.1:${port}/r/${regenerated.id}?code=${regenerated.pairingCode}`,
    });
  });

  it('rate limits repeated invalid pairing attempts from one address', async () => {
    const ctx = await context();
    const display = makeDisplay(ctx);
    const { port } = await startReceiver(ctx);
    const url = `http://127.0.0.1:${port}/r/${display.id}?code=000000`;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch(url);
      expect(response.status).toBe(403);
      await response.text();
    }
    const limited = await fetch(url);
    expect(limited.status).toBe(429);
    expect(await limited.text()).toContain('Too many attempts');
  });

  it('pushes content over WebSocket and records a receiver acknowledgement', async () => {
    const ctx = await context();
    const display = makeDisplay(ctx, { name: 'House left' });
    const { server, port, statuses } = await startReceiver(ctx);
    const socket = await connectDisplay(port, display);

    await waitFor(
      () => socket.messages.some((message) => message.type === 'welcome'),
      'receiver welcome',
    );
    expect(socket.messages[0]).toMatchObject({
      type: 'welcome',
      display: { id: display.id, name: 'House left', width: 1920, height: 1080 },
    });
    await waitFor(() => server.getStatus().connections.length === 1, 'connected display status');

    const result = server.push(
      { displayId: display.id },
      {
        eventTitle: 'Foundation Day',
        venue: 'Main Hall',
        currentCue: { number: 2, title: 'Principal address' },
        nextCue: { number: 3, title: 'Awards' },
      },
    );
    expect(result).toMatchObject({
      delivered: [display.id],
      offline: [],
      targets: 1,
    });
    expect(result.messageId).toMatch(/^[0-9a-f-]{36}$/);

    await waitFor(
      () => socket.messages.some((message) => message.type === 'content'),
      'content push',
    );
    const content = socket.messages.find((message) => message.type === 'content');
    expect(content).toMatchObject({
      messageId: result.messageId,
      payload: {
        eventTitle: 'Foundation Day',
        currentCue: { number: 2, title: 'Principal address' },
      },
    });

    socket.send(
      JSON.stringify({
        type: 'content-ack',
        messageId: result.messageId,
        receivedAt: '2026-10-28T12:00:00.000Z',
      }),
    );
    await waitFor(
      () =>
        statuses.some(
          (status) => status.connections[0]?.lastAcknowledged?.messageId === result.messageId,
        ),
      'receiver acknowledgement',
    );
    expect(server.getStatus().connections[0].lastAcknowledged).toEqual({
      messageId: result.messageId,
      receivedAt: '2026-10-28T12:00:00.000Z',
    });

    const testResult = server.sendTest({ displayId: display.id }, 'grid');
    expect(testResult).toMatchObject({ delivered: [display.id], offline: [], pattern: 'grid' });
    await waitFor(
      () => socket.messages.some((message) => message.type === 'test'),
      'test pattern push',
    );

    server.blackout({ purpose: 'live' });
    await waitFor(
      () => socket.messages.some((message) => message.type === 'blackout'),
      'blackout push',
    );

    socket.close();
    await waitFor(() => server.getStatus().connections.length === 0, 'disconnect cleanup');
  });

  it('rejects a WebSocket without a valid pairing code', async () => {
    const ctx = await context();
    const display = makeDisplay(ctx);
    const { port } = await startReceiver(ctx);
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/ws?displayId=${display.id}&code=000000`,
    );
    sockets.push(socket);
    socket.on('error', () => {});

    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for upgrade refusal')), 3000);
      socket.once('unexpected-response', (_request, incoming) => {
        clearTimeout(timer);
        resolve(incoming);
      });
    });
    expect(response.statusCode).toBe(403);
    response.resume();
  });

  it('refuses to push while the server is stopped', async () => {
    const ctx = await context();
    const display = makeDisplay(ctx);
    const server = new ReceiverServer({
      repository: ctx.repo,
      logger: silentLogger,
    });
    servers.push(server);

    expect(() => server.push({ displayId: display.id }, { eventTitle: 'Not live' })).toThrow(
      /receiver server is not running/i,
    );
    expect(() => server.sendTest({}, 'bars')).toThrow(/receiver server is not running/i);
    expect(() => server.blackout({})).toThrow(/receiver server is not running/i);
  });
});
