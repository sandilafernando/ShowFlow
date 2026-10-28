import { describe, expect, it } from 'vitest';
import {
  RESOLUME_CAPABILITIES,
  RESOLUME_CONSTRAINTS,
  buildResolumeAction,
  validateIntegrationTarget,
} from '../../shared/resolume.js';

describe('verified Resolume mappings', () => {
  it('documents only the two verified one-way operations', () => {
    expect(RESOLUME_CAPABILITIES.map((capability) => capability.id)).toEqual([
      'clip_connect',
      'layer_opacity',
    ]);
    expect(RESOLUME_CAPABILITIES.every((capability) => capability.acknowledgement === false)).toBe(true);
  });

  it('builds a clip connect message from cue mapping fields', () => {
    const result = buildResolumeAction({
      resolumeAction: 'clip_connect',
      resolumeLayer: 3,
      resolumeClip: 12,
    });
    expect(result).toEqual({
      ok: true,
      action: 'clip_connect',
      address: '/composition/layers/3/clips/12/connect',
      args: [1],
      description: 'Connect clip 12 on layer 3',
    });
  });

  it('builds a layer opacity message from cue mapping fields', () => {
    const result = buildResolumeAction({
      resolumeAction: 'layer_opacity',
      resolumeLayer: '2',
      resolumeValue: '0.4',
    });
    expect(result).toEqual({
      ok: true,
      action: 'layer_opacity',
      address: '/composition/layers/2/video/opacity',
      args: [0.4],
      description: 'Set layer 2 opacity to 40%',
    });
  });

  it('rejects missing, unsupported and out-of-range mappings', () => {
    expect(buildResolumeAction(null).code).toBe('NO_MAPPING');
    expect(buildResolumeAction({ resolumeAction: 'none' }).code).toBe('NO_MAPPING');
    expect(buildResolumeAction({ resolumeAction: 'clip_connect', resolumeLayer: 0, resolumeClip: 1 }).code).toBe(
      'INVALID_LAYER',
    );
    expect(
      buildResolumeAction({
        resolumeAction: 'clip_connect',
        resolumeLayer: RESOLUME_CONSTRAINTS.maxLayer + 1,
        resolumeClip: 1,
      }).code,
    ).toBe('INVALID_LAYER');
    expect(buildResolumeAction({ resolumeAction: 'clip_connect', resolumeLayer: 1, resolumeClip: 0 }).code).toBe(
      'INVALID_CLIP',
    );
    expect(
      buildResolumeAction({
        resolumeAction: 'clip_connect',
        resolumeLayer: 1,
        resolumeClip: RESOLUME_CONSTRAINTS.maxClip + 1,
      }).code,
    ).toBe('INVALID_CLIP');
    expect(buildResolumeAction({ resolumeAction: 'layer_opacity', resolumeLayer: 1, resolumeValue: 1.2 }).code).toBe(
      'INVALID_OPACITY',
    );
    expect(buildResolumeAction({ resolumeAction: 'layer_opacity', resolumeLayer: 1 }).code).toBe('INVALID_OPACITY');
    expect(buildResolumeAction({ resolumeAction: 'not-real', resolumeLayer: 1 }).code).toBe('UNSUPPORTED_ACTION');
  });
});

describe('integration target validation', () => {
  it('accepts hostnames and IPv4 addresses on valid ports', () => {
    expect(validateIntegrationTarget({ host: '127.0.0.1', port: 7000 })).toEqual({
      ok: true,
      host: '127.0.0.1',
      port: 7000,
    });
    expect(validateIntegrationTarget({ host: ' media-pc.local ', port: '7000' })).toEqual({
      ok: true,
      host: 'media-pc.local',
      port: 7000,
    });
    expect(validateIntegrationTarget({ host: '::1', port: 1 }).ok).toBe(true);
  });

  it('rejects schemes, paths, broadcast targets and invalid ports', () => {
    for (const host of ['', '   ', 'http://127.0.0.1', 'host/path', '0.0.0.0', '255.255.255.255', '-host', 'host-']) {
      expect(validateIntegrationTarget({ host, port: 7000 }).ok).toBe(false);
    }
    for (const port of [0, 65536, 1.5, 'abc', null, undefined]) {
      expect(validateIntegrationTarget({ host: '127.0.0.1', port }).ok).toBe(false);
    }
  });
});
