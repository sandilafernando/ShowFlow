import {
  RESOLUME_CAPABILITIES,
  RESOLUME_SUPPORT_URL,
  buildResolumeAction,
} from '../../shared/resolume.js';
import { INTEGRATION_MODES } from '../../shared/enums.js';
import { AppError } from '../errors.js';
import { MockAdapter, ResolumeAdapter } from './adapters.js';

function blockedResult(code, message, extra = {}) {
  return {
    ok: false,
    code,
    status: 'failed',
    acknowledged: false,
    simulated: extra.simulated ?? false,
    detail: message,
    ...extra,
  };
}

export class IntegrationService {
  constructor({ repository, logger, appVersion }) {
    this.repo = repository;
    this.logger = logger;
    this.appVersion = appVersion;
  }

  getConfig() {
    return this.repo.getIntegration();
  }

  getStatus() {
    const config = this.getConfig();
    return {
      config,
      capabilities: RESOLUME_CAPABILITIES,
      documentationUrl: RESOLUME_SUPPORT_URL,
      transport: 'OSC over UDP (one-way)',
      acknowledgement: false,
      modes: [
        {
          value: INTEGRATION_MODES.MOCK,
          label: 'Mock integration',
          description: 'Safe offline simulation. Never contacts production equipment.',
        },
        {
          value: INTEGRATION_MODES.RESOLUME,
          label: 'Resolume Arena OSC',
          description: 'Sends verified clip connect and layer opacity messages over UDP.',
        },
      ],
      planned: [
        { value: 'vmix', label: 'vMix', status: 'planned' },
        { value: 'midi', label: 'MIDI', status: 'planned' },
      ],
      notes: [
        'Resolume OSC messages are one-way. ShowFlow reports a successful send as unverified, never acknowledged.',
        'Live sends are blocked unless the event is in LIVE mode. Rehearsal and standby events never transmit.',
        'No commands are replayed after restart or retried automatically.',
      ],
      appVersion: this.appVersion,
    };
  }

  createAdapter(config) {
    if (config.mode === INTEGRATION_MODES.MOCK) return new MockAdapter({ logger: this.logger });
    return new ResolumeAdapter({
      host: config.host,
      port: config.port,
      logger: this.logger,
    });
  }

  async test() {
    const config = this.getConfig();
    const adapter = this.createAdapter(config);
    let result;
    try {
      result = await adapter.testTransport();
    } catch (error) {
      this.logger.error('Integration transport test failed', error);
      result = {
        ok: false,
        status: 'failed',
        acknowledged: false,
        simulated: config.mode === INTEGRATION_MODES.MOCK,
        detail: error.message,
      };
    }
    const lastTest = {
      ...result,
      mode: config.mode,
      target: result.target || (config.mode === 'resolume' ? `${config.host}:${config.port}` : 'mock'),
      ranAt: new Date().toISOString(),
    };
    this.repo.setIntegrationLastTest(lastTest);
    this.repo.logActivity({
      kind: 'integration',
      message: result.ok
        ? `Integration test passed (${config.mode === 'mock' ? 'simulated' : 'transport only'})`
        : `Integration test failed (${config.mode})`,
      detail: { mode: config.mode, status: result.status, detail: result.detail },
    });
    return lastTest;
  }

  async sendCue({ eventId, cueId }) {
    const event = this.repo.getEvent(eventId);
    const cue = event.cues.find((item) => item.id === cueId);
    if (!cue) throw new AppError('That cue does not belong to the selected event.', 'CUE_NOT_FOUND');
    const config = this.getConfig();

    if (event.archived) {
      return blockedResult('EVENT_ARCHIVED', 'Archived events cannot send production commands.');
    }
    if (event.status !== 'live') {
      const message =
        event.status === 'rehearsal'
          ? 'Rehearsal mode is active. No integration command was sent.'
          : 'Integration commands are only transmitted from a LIVE event. No command was sent.';
      this.repo.logActivity({
        eventId,
        kind: 'integration',
        mode: event.status === 'rehearsal' ? 'rehearsal' : 'system',
        message: `Integration send blocked for "${cue.title}" — ${message}`,
        detail: { cueId, eventStatus: event.status },
      });
      return blockedResult('NOT_LIVE', message, { simulated: true });
    }
    if (!config.enabled) {
      return blockedResult(
        'INTEGRATION_DISABLED',
        'The integration is disabled in Settings. No command was sent.',
      );
    }
    const action = buildResolumeAction(cue);
    if (!action.ok) {
      this.repo.logActivity({
        eventId,
        kind: 'integration',
        mode: 'live',
        message: `Integration mapping invalid for "${cue.title}"`,
        detail: { cueId, code: action.code, message: action.message },
      });
      return blockedResult(action.code, action.message);
    }

    const adapter = this.createAdapter(config);
    let result;
    try {
      result = await adapter.send(action);
    } catch (error) {
      this.logger.error('Integration send failed', error);
      result = {
        ok: false,
        status: 'failed',
        acknowledged: false,
        simulated: config.mode === INTEGRATION_MODES.MOCK,
        path: action.address,
        args: action.args,
        detail: error.message,
        sentAt: new Date().toISOString(),
      };
    }

    this.repo.logActivity({
      eventId,
      kind: 'integration',
      mode: 'live',
      message:
        result.simulated && result.ok
          ? `SIMULATED Resolume action for "${cue.title}" — ${action.description}`
          : result.ok
            ? `OSC sent (unverified) for "${cue.title}" — ${action.description}`
            : `Integration send failed for "${cue.title}" — ${result.detail}`,
      detail: {
        cueId,
        cueTitle: cue.title,
        mode: config.mode,
        action: action.action,
        path: action.address,
        args: action.args,
        status: result.status,
        simulated: Boolean(result.simulated),
        acknowledged: Boolean(result.acknowledged),
      },
    });

    return {
      ...result,
      ok: Boolean(result.ok),
      simulated: config.mode === INTEGRATION_MODES.MOCK,
      mode: config.mode,
      action: action.action,
      description: action.description,
      target: config.mode === 'mock' ? 'mock' : `${config.host}:${config.port}`,
    };
  }
}
