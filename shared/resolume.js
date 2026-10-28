/**
 * Resolume OSC facts used by ShowFlow.
 *
 * Verified addresses (Resolume support documentation "OSC"):
 *   /composition/layers/{layer}/video/opacity   float 0..1
 *   /composition/layers/{layer}/clips/{clip}/connect   int 1
 *
 * Resolume's OSC input is a one-way UDP transport. Resolume does not return an
 * acknowledgement for these messages. ShowFlow therefore reports a successful
 * send as "unverified", never as acknowledged or completed.
 */
export const RESOLUME_SUPPORT_URL = 'https://resolume.com/support/en/osc';
export const RESOLUME_DEFAULT_PORT = 7000;

export const RESOLUME_CAPABILITIES = Object.freeze([
  {
    id: 'clip_connect',
    label: 'Connect clip',
    address: '/composition/layers/{layer}/clips/{clip}/connect',
    argument: 'int 1',
    acknowledgement: false,
  },
  {
    id: 'layer_opacity',
    label: 'Set layer opacity',
    address: '/composition/layers/{layer}/video/opacity',
    argument: 'float 0..1',
    acknowledgement: false,
  },
]);

export const RESOLUME_CONSTRAINTS = Object.freeze({
  minLayer: 1,
  maxLayer: 999,
  minClip: 1,
  maxClip: 9999,
});

export function buildResolumeAction(cue) {
  if (!cue || !cue.resolumeAction || cue.resolumeAction === 'none') {
    return { ok: false, code: 'NO_MAPPING', message: 'No Resolume action is mapped to this cue.' };
  }
  const layer = Number(cue.resolumeLayer);
  if (!Number.isInteger(layer) || layer < RESOLUME_CONSTRAINTS.minLayer || layer > RESOLUME_CONSTRAINTS.maxLayer) {
    return {
      ok: false,
      code: 'INVALID_LAYER',
      message: `Resolume layer must be a whole number between ${RESOLUME_CONSTRAINTS.minLayer} and ${RESOLUME_CONSTRAINTS.maxLayer}.`,
    };
  }

  if (cue.resolumeAction === 'clip_connect') {
    const clip = Number(cue.resolumeClip);
    if (!Number.isInteger(clip) || clip < RESOLUME_CONSTRAINTS.minClip || clip > RESOLUME_CONSTRAINTS.maxClip) {
      return {
        ok: false,
        code: 'INVALID_CLIP',
        message: `Resolume clip must be a whole number between ${RESOLUME_CONSTRAINTS.minClip} and ${RESOLUME_CONSTRAINTS.maxClip}.`,
      };
    }
    return {
      ok: true,
      action: 'clip_connect',
      address: `/composition/layers/${layer}/clips/${clip}/connect`,
      args: [1],
      description: `Connect clip ${clip} on layer ${layer}`,
    };
  }

  if (cue.resolumeAction === 'layer_opacity') {
    const opacity = Number(cue.resolumeValue);
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      return {
        ok: false,
        code: 'INVALID_OPACITY',
        message: 'Layer opacity must be a number between 0 and 1.',
      };
    }
    return {
      ok: true,
      action: 'layer_opacity',
      address: `/composition/layers/${layer}/video/opacity`,
      args: [opacity],
      description: `Set layer ${layer} opacity to ${Math.round(opacity * 100)}%`,
    };
  }

  return { ok: false, code: 'UNSUPPORTED_ACTION', message: 'Unsupported Resolume action.' };
}

export function validateIntegrationTarget({ host, port }) {
  if (typeof host !== 'string' || !host.trim()) {
    return { ok: false, message: 'Host is required.' };
  }
  const clean = host.trim();
  if (
    clean.length > 253 ||
    !/^[a-zA-Z0-9.:-]+$/.test(clean) ||
    clean.includes('://') ||
    clean.includes('/') ||
    clean.startsWith('-') ||
    clean.endsWith('-')
  ) {
    return { ok: false, message: 'Host must be an IP address or hostname without a scheme or path.' };
  }
  if (clean === '0.0.0.0' || clean === '255.255.255.255') {
    return { ok: false, message: 'Broadcast and unspecified addresses are not allowed.' };
  }
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return { ok: false, message: 'Port must be a whole number between 1 and 65535.' };
  }
  return { ok: true, host: clean, port: numericPort };
}
