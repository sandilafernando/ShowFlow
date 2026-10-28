import dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { IntegrationService } from '../../electron/integrations/service.js';
import { decodeOscMessage } from '../../shared/osc.js';
import { createTestContext, cueInput, eventInput, silentLogger } from './helpers.js';

const contexts = [];
const sockets = [];

async function context() {
  const value = await createTestContext();
  contexts.push(value);
  return value;
}

async function liveEventWithCue(repo, cueOverrides) {
  const event = repo.createEvent(eventInput({ title: 'Integration event' }));
  const cue = repo.createCue(event.id, cueInput(cueOverrides));
  repo.setEventRuntime(event.id, { status: 'live' });
  return { event: repo.getEvent(event.id), cue: repo.getCueById(cue.id) };
}

function serviceFor(repo) {
  return new IntegrationService({ repository: repo, logger: silentLogger, appVersion: '1.0.0-test' });
}

afterEach(async () => {
  while (sockets.length) {
    const socket = sockets.pop();
    await new Promise((resolve) => socket.close(resolve));
  }
  while (contexts.length) await contexts.pop().cleanup();
});

describe('integration send gating', () => {
  it('blocks rehearsal sends before any adapter is contacted', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput());
    const cue = repo.createCue(
      event.id,
      cueInput({ resolumeAction: 'clip_connect', resolumeLayer: 1, resolumeClip: 1 }),
    );
    repo.saveIntegration({ mode: 'mock', enabled: true });
    repo.setEventRuntime(event.id, { status: 'rehearsal' });
    const service = serviceFor(repo);

    const result = await service.sendCue({ eventId: event.id, cueId: cue.id });
    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_LIVE',
      status: 'failed',
      acknowledged: false,
      simulated: true,
    });
    expect(result.detail).toMatch(/Rehearsal mode is active/);
    const log = repo.listActivity({ eventId: event.id, kind: 'integration' }).items[0];
    expect(log.message).toMatch(/blocked/);
  });

  it('blocks sends from standby and when the integration is disabled', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput());
    const cue = repo.createCue(
      event.id,
      cueInput({ resolumeAction: 'clip_connect', resolumeLayer: 1, resolumeClip: 1 }),
    );
    repo.saveIntegration({ mode: 'mock', enabled: true });
    const service = serviceFor(repo);

    const standby = await service.sendCue({ eventId: event.id, cueId: cue.id });
    expect(standby.code).toBe('NOT_LIVE');
    expect(standby.acknowledged).toBe(false);

    repo.setEventRuntime(event.id, { status: 'live' });
    repo.saveIntegration({ mode: 'mock', enabled: false });
    const disabled = await service.sendCue({ eventId: event.id, cueId: cue.id });
    expect(disabled).toMatchObject({
      ok: false,
      code: 'INTEGRATION_DISABLED',
      acknowledged: false,
    });
  });

  it('refuses a cue with no verified mapping', async () => {
    const { repo } = await context();
    const event = repo.createEvent(eventInput());
    const cue = repo.createCue(event.id, cueInput({ resolumeAction: 'none' }));
    repo.saveIntegration({ mode: 'mock', enabled: true });
    repo.setEventRuntime(event.id, { status: 'live' });
    const service = serviceFor(repo);

    const result = await service.sendCue({ eventId: event.id, cueId: cue.id });
    expect(result).toMatchObject({ ok: false, code: 'NO_MAPPING', acknowledged: false });
  });

  it('refuses a cue from another event', async () => {
    const { repo } = await context();
    const first = repo.createEvent(eventInput({ title: 'First' }));
    const second = repo.createEvent(eventInput({ title: 'Second' }));
    repo.createCue(first.id, cueInput());
    const other = repo.createCue(second.id, cueInput());
    repo.saveIntegration({ mode: 'mock', enabled: true });
    repo.setEventRuntime(first.id, { status: 'live' });
    const service = serviceFor(repo);
    await expect(service.sendCue({ eventId: first.id, cueId: other.id })).rejects.toMatchObject({
      code: 'CUE_NOT_FOUND',
    });
  });
});

describe('mock integration', () => {
  it('reports a simulated completion without opening a network connection', async () => {
    const { repo } = await context();
    const { event, cue } = await liveEventWithCue(repo, {
      resolumeAction: 'clip_connect',
      resolumeLayer: 2,
      resolumeClip: 7,
    });
    repo.saveIntegration({ mode: 'mock', enabled: true });
    const service = serviceFor(repo);

    const result = await service.sendCue({ eventId: event.id, cueId: cue.id });
    expect(result).toMatchObject({
      ok: true,
      status: 'completed',
      acknowledged: true,
      simulated: true,
      mode: 'mock',
      action: 'clip_connect',
      target: 'mock',
      path: '/composition/layers/2/clips/7/connect',
    });
    expect(result.detail).toMatch(/SIMULATION ONLY/);
    const log = repo.listActivity({ eventId: event.id, kind: 'integration' }).items[0];
    expect(log.message).toMatch(/^SIMULATED Resolume action/);
  });

  it('tests the mock transport and persists the test result', async () => {
    const { repo } = await context();
    repo.saveIntegration({ mode: 'mock', enabled: true });
    const service = serviceFor(repo);
    const result = await service.test();
    expect(result).toMatchObject({
      ok: true,
      status: 'simulated-ready',
      simulated: true,
      acknowledged: true,
      mode: 'mock',
    });
    expect(repo.getIntegration().lastTest).toMatchObject({ status: 'simulated-ready' });
    const status = service.getStatus();
    expect(status.acknowledgement).toBe(false);
    expect(status.transport).toMatch(/one-way/);
    expect(status.notes.join(' ')).toMatch(/never acknowledged/);
  });
});

describe('Resolume OSC transport', () => {
  it('sends the mapped datagram but reports an unverified acknowledgement', async () => {
    const { repo } = await context();
    const server = dgram.createSocket('udp4');
    sockets.push(server);
    await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OSC datagram was not received')), 2000);
      server.once('message', (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });

    const { event, cue } = await liveEventWithCue(repo, {
      resolumeAction: 'clip_connect',
      resolumeLayer: 4,
      resolumeClip: 9,
    });
    repo.saveIntegration({ mode: 'resolume', host: '127.0.0.1', port, enabled: true });
    const service = serviceFor(repo);

    const result = await service.sendCue({ eventId: event.id, cueId: cue.id });
    expect(result).toMatchObject({
      ok: true,
      status: 'unknown',
      acknowledged: false,
      simulated: false,
      mode: 'resolume',
      target: `127.0.0.1:${port}`,
      path: '/composition/layers/4/clips/9/connect',
      args: [1],
    });
    expect(result.detail).toMatch(/does not acknowledge/);

    const message = await received;
    expect(decodeOscMessage(message)).toEqual({
      address: '/composition/layers/4/clips/9/connect',
      args: [1],
    });
    const log = repo.listActivity({ eventId: event.id, kind: 'integration' }).items[0];
    expect(log.message).toMatch(/^OSC sent \(unverified\)/);
    expect(log.detail).toMatchObject({ status: 'unknown', acknowledged: false, simulated: false });
  });
});
