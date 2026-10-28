import { describe, expect, it } from 'vitest';
import { decodeOscMessage, encodeOscMessage } from '../../shared/osc.js';

describe('OSC message encoding', () => {
  it('round-trips an int argument used by Resolume clip connect', () => {
    const message = encodeOscMessage('/composition/layers/1/clips/2/connect', [1]);
    expect(message.length % 4).toBe(0);
    expect(decodeOscMessage(message)).toEqual({
      address: '/composition/layers/1/clips/2/connect',
      args: [1],
    });
  });

  it('round-trips floats, strings and booleans with four-byte padding', () => {
    const message = encodeOscMessage('/showflow/test', [0.75, 'hello', true, false, -7]);
    expect(message.length % 4).toBe(0);
    expect(decodeOscMessage(message)).toEqual({
      address: '/showflow/test',
      args: [0.75, 'hello', true, false, -7],
    });
  });

  it('encodes zero arguments as a tags-only message', () => {
    const message = encodeOscMessage('/showflow/ping');
    expect(decodeOscMessage(message)).toEqual({ address: '/showflow/ping', args: [] });
  });

  it('accepts the int32 boundary values', () => {
    const message = encodeOscMessage('/bounds', [-2147483648, 2147483647]);
    expect(decodeOscMessage(message).args).toEqual([-2147483648, 2147483647]);
  });

  it('rejects malformed addresses, arguments and integers', () => {
    expect(() => encodeOscMessage('showflow', [])).toThrow(/must begin with/);
    expect(() => encodeOscMessage('/', [])).toThrow(/must begin with/);
    expect(() => encodeOscMessage(`/${'a'.repeat(512)}`, [])).toThrow(/invalid characters/);
    expect(() => encodeOscMessage('/showflow\u0001', [])).toThrow(/invalid characters/);
    expect(() => encodeOscMessage('/showflow', 'nope')).toThrow(/must be an array/);
    expect(() => encodeOscMessage('/showflow', new Array(33).fill(0))).toThrow(/Too many/);
    expect(() => encodeOscMessage('/showflow', [2147483648])).toThrow(/int32/);
    expect(() => encodeOscMessage('/showflow', [{ nested: true }])).toThrow(/Unsupported/);
    expect(() => encodeOscMessage('/showflow', [undefined])).toThrow(/Unsupported/);
  });

  it('rejects unknown tags in the diagnostic decoder', () => {
    const message = encodeOscMessage('/showflow', [1]);
    message[message.indexOf(Buffer.from(',i')) + 1] = 'x'.charCodeAt(0);
    expect(() => decodeOscMessage(message)).toThrow(/Unsupported OSC tag/);
  });
});
