/**
 * Minimal OSC 1.0 message encoder.
 * Only the message type is implemented; ShowFlow sends int32 and float32 arguments.
 * OSC is a one-way transport: sending a datagram never constitutes acknowledgement.
 */

function assertAddress(address) {
  if (typeof address !== 'string' || !address.startsWith('/') || address.length < 2) {
    throw new Error('OSC address must begin with "/" and contain a path.');
  }
  // OSC addresses must not contain control characters.
  // eslint-disable-next-line no-control-regex
  if (address.length > 512 || /[\u0000-\u001f]/.test(address)) {
    throw new Error('OSC address contains invalid characters.');
  }
  return address;
}

function paddedString(value) {
  const raw = Buffer.from(`${value}\u0000`, 'utf8');
  const remainder = raw.length % 4;
  if (remainder === 0) return raw;
  return Buffer.concat([raw, Buffer.alloc(4 - remainder)]);
}

export function encodeOscMessage(address, args = []) {
  assertAddress(address);
  if (!Array.isArray(args)) throw new Error('OSC arguments must be an array.');
  if (args.length > 32) throw new Error('Too many OSC arguments.');

  const tags = [','];
  const payloads = [];
  for (const arg of args) {
    if (typeof arg === 'number' && Number.isInteger(arg)) {
      if (arg < -2147483648 || arg > 2147483647) {
        throw new Error('OSC integer argument is outside int32 range.');
      }
      tags.push('i');
      const buffer = Buffer.alloc(4);
      buffer.writeInt32BE(arg, 0);
      payloads.push(buffer);
    } else if (typeof arg === 'number' && Number.isFinite(arg)) {
      tags.push('f');
      const buffer = Buffer.alloc(4);
      buffer.writeFloatBE(arg, 0);
      payloads.push(buffer);
    } else if (typeof arg === 'string') {
      tags.push('s');
      payloads.push(paddedString(arg));
    } else if (typeof arg === 'boolean') {
      tags.push(arg ? 'T' : 'F');
    } else {
      throw new Error('Unsupported OSC argument type.');
    }
  }

  return Buffer.concat([paddedString(address), paddedString(tags.join('')), ...payloads]);
}

export function decodeOscString(buffer, offset = 0) {
  const start = offset;
  while (offset < buffer.length && buffer[offset] !== 0) offset += 1;
  const value = buffer.subarray(start, offset).toString('utf8');
  const consumed = Math.ceil((offset - start + 1) / 4) * 4;
  return { value, nextOffset: start + consumed };
}

/** Decodes only messages ShowFlow itself emits. Used by tests and diagnostics. */
export function decodeOscMessage(buffer) {
  const address = decodeOscString(buffer, 0);
  const tagPart = decodeOscString(buffer, address.nextOffset);
  const tags = tagPart.value.slice(1);
  let offset = tagPart.nextOffset;
  const args = [];
  for (const tag of tags) {
    if (tag === 'i') {
      args.push(buffer.readInt32BE(offset));
      offset += 4;
    } else if (tag === 'f') {
      args.push(buffer.readFloatBE(offset));
      offset += 4;
    } else if (tag === 's') {
      const result = decodeOscString(buffer, offset);
      args.push(result.value);
      offset = result.nextOffset;
    } else if (tag === 'T') {
      args.push(true);
    } else if (tag === 'F') {
      args.push(false);
    } else {
      throw new Error(`Unsupported OSC tag "${tag}" in diagnostic decoder.`);
    }
  }
  return { address: address.value, args };
}
