import crypto from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  dateString,
  id,
  idList,
  integer,
  isId,
  safeJsonSize,
  tags,
  text,
  timeString,
  validateActivityEntry,
  validateChecklistInput,
  validateCueInput,
  validateDisplayInput,
  validateEventInput,
  validateIntegrationConfig,
  validateMediaImportRecord,
  validateMediaUpdate,
  validateOperatorInput,
  validateProbeResult,
  validateSettingsPatch,
} from '../../shared/validation.js';

const uuid = () => crypto.randomUUID();

describe('primitive validators', () => {
  it('normalises text, strips NULs and enforces limits', () => {
    expect(text('  Hello\r\nworld\t', 'Field')).toBe('Hello world');
    expect(text('line one\r\nline two', 'Notes', { multiline: true })).toBe('line one\nline two');
    expect(text('a\u0000b', 'Field')).toBe('ab');
    expect(() => text('', 'Field', { required: true })).toThrow(/required/);
    expect(() => text('', 'Field', { min: 3 })).toThrow(/at least 3/);
    expect(() => text('abcd', 'Field', { max: 3 })).toThrow(/3 characters or fewer/);
    expect(() => text(42, 'Field')).toThrow(ValidationError);
  });

  it('validates UUID identifiers and deduplicates lists', () => {
    const value = uuid();
    expect(isId(value)).toBe(true);
    expect(isId('not-a-uuid')).toBe(false);
    expect(id(value, 'Item')).toBe(value);
    expect(id(undefined, 'Item', { optional: true })).toBeNull();
    expect(() => id(undefined, 'Item')).toThrow(/required/);
    expect(() => id('nope', 'Item')).toThrow(/valid identifier/);
    expect(idList([value], 'Items')).toEqual([value]);
    expect(() => idList([value, value], 'Items')).toThrow(/duplicate/);
    expect(() => idList(new Array(2001).fill(value), 'Items')).toThrow(/too large/);
    expect(() => idList([], 'Items', { minLength: 1 })).toThrow(/incomplete/);
  });

  it('validates integers, dates and times strictly', () => {
    expect(integer('12', 'Count', { min: 1, max: 20 })).toBe(12);
    expect(integer('', 'Count', { fallback: 0 })).toBe(0);
    expect(() => integer(1.2, 'Count')).toThrow(/whole number/);
    expect(() => integer(30, 'Count', { max: 20 })).toThrow(/between/);
    expect(dateString('2026-10-28', 'Date')).toBe('2026-10-28');
    expect(() => dateString('2026-02-30', 'Date')).toThrow(/valid calendar date/);
    expect(() => dateString('28-10-2026', 'Date')).toThrow(/YYYY-MM-DD/);
    expect(timeString('23:59', 'Time')).toBe('23:59');
    expect(timeString('', 'Time')).toBe('');
    expect(() => timeString('24:00', 'Time')).toThrow(/HH:MM/);
    expect(() => timeString('9:00', 'Time')).toThrow(/HH:MM/);
  });

  it('normalises tags and rejects invalid lists', () => {
    expect(tags([' Lighting ', 'lighting', 'Audio', ''])).toEqual(['Lighting', 'Audio']);
    expect(tags(undefined)).toEqual([]);
    expect(() => tags('no')).toThrow(/list/);
    expect(() => tags(new Array(25).fill('tag'))).toThrow(/at most 24/);
  });

  it('serialises only small JSON details', () => {
    expect(safeJsonSize({ ok: true })).toEqual({ ok: true });
    expect(safeJsonSize({ value: 'x'.repeat(5000) })).toBeNull();
    const circular = {};
    circular.self = circular;
    expect(safeJsonSize(circular)).toBeNull();
  });
});

describe('domain validators', () => {
  it('validates event input and ignores client-supplied status except allowed values', () => {
    const input = validateEventInput({
      title: '  Annual Prize Day ',
      eventDate: '2026-11-20',
      startTime: '17:00',
      description: 'Awards',
      status: 'live',
    });
    expect(input.title).toBe('Annual Prize Day');
    expect(input.status).toBe('live');
    expect(() => validateEventInput({ title: 'x', eventDate: '2026-11-20', status: 'hacked' })).toThrow(/status/);
    expect(() => validateEventInput({ eventDate: '2026-11-20' })).toThrow(/title/);
  });

  it('validates cue mappings and strips irrelevant mapping fields', () => {
    const cue = validateCueInput({
      title: 'Play VT',
      type: 'video',
      resolumeAction: 'clip_connect',
      resolumeLayer: 2,
      resolumeClip: 5,
      resolumeValue: 0.5,
    });
    expect(cue).toMatchObject({
      resolumeAction: 'clip_connect',
      resolumeLayer: 2,
      resolumeClip: 5,
      resolumeValue: null,
    });
    const manual = validateCueInput({ title: 'Manual cue', type: 'manual', resolumeLayer: 4 });
    expect(manual.resolumeLayer).toBeNull();
    expect(manual.resolumeAction).toBe('none');
    expect(() => validateCueInput({ title: 'Bad', type: 'video', resolumeAction: 'clip_connect' })).toThrow(
      /Resolume layer/,
    );
    expect(() =>
      validateCueInput({
        title: 'Bad',
        type: 'video',
        resolumeAction: 'layer_opacity',
        resolumeLayer: 1,
        resolumeValue: 2,
      }),
    ).toThrow(/opacity/);
  });

  it('validates operator, display and checklist input', () => {
    expect(validateOperatorInput({ name: 'Nimal', role: 'audio', contact: ' ext 22 ' })).toEqual({
      name: 'Nimal',
      role: 'audio',
      contact: 'ext 22',
      active: true,
    });
    expect(validateDisplayInput({ name: 'Stage left', purpose: 'preview', width: 1920, height: 1080, layout: 'minimal' })).toMatchObject({
      name: 'Stage left',
      purpose: 'preview',
      enabled: true,
    });
    expect(
      validateChecklistInput({ eventId: uuid(), kind: 'setup', title: 'Test projectors' }),
    ).toMatchObject({ done: false, owner: '' });
    expect(() => validateChecklistInput({ eventId: 'bad', kind: 'setup', title: 'x' })).toThrow(/Event/);
  });

  it('allows only known settings keys and normalises values', () => {
    expect(
      validateSettingsPatch({
        operatorName: '  Sandila ',
        receiverPort: '43000',
        autoBackup: false,
        unknown: 'ignored',
      }),
    ).toEqual({ operatorName: 'Sandila', receiverPort: 43000, autoBackup: false });
    expect(validateSettingsPatch({ unknown: 'ignored' })).toEqual({});
    expect(() => validateSettingsPatch({ receiverPort: 80 })).toThrow(/between 1024 and 65535/);
    expect(() => validateSettingsPatch({ autoBackup: 'yes' })).toThrow(/true or false/);
    expect(() => validateSettingsPatch({ backupRetention: 2 })).toThrow(/between 3 and 30/);
  });

  it('rejects unsafe integration targets before saving', () => {
    expect(
      validateIntegrationConfig({ mode: 'resolume', host: '10.0.0.5', port: 7000, enabled: true }),
    ).toEqual({ mode: 'resolume', host: '10.0.0.5', port: 7000, enabled: true });
    expect(() =>
      validateIntegrationConfig({ mode: 'resolume', host: '0.0.0.0', port: 7000 }),
    ).toThrow(/Broadcast/);
    expect(() => validateIntegrationConfig({ mode: 'midi', host: '127.0.0.1', port: 7000 })).toThrow(/mode/);
  });

  it('validates media updates, probes and imports', () => {
    expect(validateMediaUpdate({ name: 'Opening.mp4', tags: ['Open'], eventId: null })).toMatchObject({
      name: 'Opening.mp4',
      tags: ['Open'],
      eventId: null,
    });
    expect(validateProbeResult({ durationSeconds: '12.5', width: 1920, height: 1080 })).toEqual({
      durationSeconds: 12.5,
      width: 1920,
      height: 1080,
    });
    expect(() => validateProbeResult({ durationSeconds: -1 })).toThrow(/between/);
    expect(
      validateMediaImportRecord({
        path: path.resolve('media', 'clip.mp4'),
        name: 'clip.mp4',
        kind: 'video',
        tags: ['assembly'],
      }),
    ).toMatchObject({ name: 'clip.mp4', kind: 'video', tags: ['assembly'] });
    expect(() =>
      validateMediaImportRecord({ path: 'relative.mp4', name: 'x', kind: 'video' }),
    ).toThrow(/absolute/);
  });

  it('validates activity entries with safe detail objects only', () => {
    expect(
      validateActivityEntry({ kind: 'system', message: 'Started', mode: 'system', detail: { version: 1 } }),
    ).toEqual({ eventId: null, kind: 'system', message: 'Started', mode: 'system', detail: { version: 1 } });
    expect(validateActivityEntry({ kind: 'system', message: 'Started', detail: 'not-an-object' }).detail).toBeNull();
    expect(() => validateActivityEntry({ kind: 'nope', message: 'x' })).toThrow(/kind/);
  });
});
