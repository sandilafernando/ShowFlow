import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import { encodeOscMessage } from '../../shared/osc.js';
import { RESOLUME_SUPPORT_URL, validateIntegrationTarget } from '../../shared/resolume.js';
import { AppError } from '../errors.js';

const DEFAULT_TIMEOUT_MS = 1800;

function timeoutPromise(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new AppError(message, 'TIMEOUT')), ms);
    }),
  ]);
}

export class ResolumeAdapter {
  constructor({ host, port, logger, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.host = host;
    this.port = port;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.id = 'resolume';
  }

  async testTransport() {
    const target = validateIntegrationTarget({ host: this.host, port: this.port });
    if (!target.ok) return { ok: false, detail: target.message };
    try {
      await timeoutPromise(
        dns.lookup(target.host),
        this.timeoutMs,
        'Name resolution timed out. Check the host address and network connection.',
      );
    } catch (error) {
      return {
        ok: false,
        detail: `Could not resolve ${target.host}: ${error.message}`,
        target: `${target.host}:${target.port}`,
      };
    }
    try {
      const socket = dgram.createSocket('udp4');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.close();
          reject(new AppError('The local UDP socket did not bind in time.', 'UDP_BIND_TIMEOUT'));
        }, this.timeoutMs);
        socket.once('error', (error) => {
          clearTimeout(timer);
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          reject(error);
        });
        socket.bind(0, '0.0.0.0', () => {
          clearTimeout(timer);
          socket.close(resolve);
        });
      });
    } catch (error) {
      return {
        ok: false,
        detail: `Local UDP transport is unavailable: ${error.message}`,
        target: `${target.host}:${target.port}`,
      };
    }
    return {
      ok: true,
      status: 'transport-ready',
      acknowledged: false,
      simulated: false,
      target: `${target.host}:${target.port}`,
      detail:
        'Target resolved and the local UDP transport is ready. No datagram was sent. Resolume OSC is one-way, so reception cannot be verified from ShowFlow.',
      supportUrl: RESOLUME_SUPPORT_URL,
      checkedAt: new Date().toISOString(),
    };
  }

  async send(action) {
    const buffer = encodeOscMessage(action.address, action.args);
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        callback(value);
      };
      const timer = setTimeout(() => {
        finish(
          reject,
          new AppError(
            'The OSC datagram was not handed to the local network stack in time. The cue state is unverified.',
            'OSC_SEND_TIMEOUT',
          ),
        );
      }, this.timeoutMs);
      socket.once('error', (error) => {
        finish(reject, new AppError(`OSC transport error: ${error.message}`, 'OSC_SEND_FAILED'));
      });
      socket.send(buffer, this.port, this.host, (error) => {
        if (error) {
          finish(reject, new AppError(`OSC send failed: ${error.message}`, 'OSC_SEND_FAILED'));
          return;
        }
        finish(resolve, {
          ok: true,
          status: 'unknown',
          acknowledged: false,
          simulated: false,
          path: action.address,
          args: action.args,
          detail:
            'OSC datagram sent. Resolume does not acknowledge clip triggers or opacity changes; confirm the visual result on the output.',
          target: `${this.host}:${this.port}`,
          sentAt: new Date().toISOString(),
        });
      });
    });
  }
}

export class MockAdapter {
  constructor({ logger } = {}) {
    this.id = 'mock';
    this.logger = logger;
  }

  async testTransport() {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      ok: true,
      status: 'simulated-ready',
      acknowledged: true,
      simulated: true,
      target: 'ShowFlow mock integration',
      detail:
        'Mock integration is ready. No network connection is opened and no production equipment is contacted.',
      checkedAt: new Date().toISOString(),
    };
  }

  async send(action) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      ok: true,
      status: 'completed',
      acknowledged: true,
      simulated: true,
      path: action.address,
      args: action.args,
      detail:
        'SIMULATION ONLY. ShowFlow simulated the mapped action without sending any OSC datagram. Confirm real equipment manually.',
      target: 'mock',
      sentAt: new Date().toISOString(),
    };
  }
}
