import { describe, expect, it } from 'vitest';
import {
  acknowledgeCueExecution,
  armCue,
  createCueRuntime,
  cueNumber,
  cueTimer,
  executionLabel,
  markCueComplete,
  nextCue,
  previousCue,
  progressFor,
  resetCueRuntime,
  setRuntimeMode,
  skipCue,
  startCue,
} from '../../shared/cue-engine.js';
import { CUE_STATUS, EXECUTION_STATE, RUNTIME_MODE } from '../../shared/enums.js';

const cues = [
  { id: 'cue-a', title: 'Pre-roll', durationSeconds: 30 },
  { id: 'cue-b', title: 'Walk-in', durationSeconds: 60 },
  { id: 'cue-c', title: 'Welcome', durationSeconds: 0 },
];

describe('cue navigation', () => {
  it('derives one-based numbers and neighbours', () => {
    expect(cueNumber(cues, 'cue-b')).toBe(2);
    expect(cueNumber(cues, 'missing')).toBeNull();
    expect(nextCue(cues, 'cue-a')?.id).toBe('cue-b');
    expect(nextCue(cues, 'cue-c')).toBeNull();
    expect(nextCue(cues, 'missing')?.id).toBe('cue-a');
    expect(previousCue(cues, 'cue-b')?.id).toBe('cue-a');
    expect(previousCue(cues, 'cue-a')).toBeNull();
    expect(previousCue(cues, 'missing')).toBeNull();
  });
});

describe('cue runtime lifecycle', () => {
  it('starts with the first cue armed and every cue ready', () => {
    const runtime = createCueRuntime({ cues, mode: RUNTIME_MODE.REHEARSAL });
    expect(runtime.mode).toBe('rehearsal');
    expect(runtime.armedCueId).toBe('cue-a');
    expect(runtime.liveCueId).toBeNull();
    expect(runtime.statuses).toEqual({
      'cue-a': CUE_STATUS.READY,
      'cue-b': CUE_STATUS.READY,
      'cue-c': CUE_STATUS.READY,
    });
    expect(runtime.executions).toEqual({});
    expect(runtime.cueStartedAt).toBeNull();
  });

  it('ignores an armed cue that is not in the running order', () => {
    const runtime = createCueRuntime({ cues, armedCueId: 'not-a-cue', liveCueId: 'cue-b' });
    expect(runtime.armedCueId).toBe('cue-a');
    expect(runtime.liveCueId).toBe('cue-b');
    expect(runtime.statuses['cue-b']).toBe(CUE_STATUS.LIVE);
  });

  it('arms a cue and clears a skipped state', () => {
    const runtime = { ...createCueRuntime({ cues }), statuses: { 'cue-a': CUE_STATUS.SKIPPED } };
    const next = armCue(runtime, cues, 'cue-a');
    expect(next.armedCueId).toBe('cue-a');
    expect(next.statuses['cue-a']).toBe(CUE_STATUS.READY);
    expect(armCue(runtime, cues, 'unknown')).toBe(runtime);
  });

  it('GO marks the previous cue complete, requests execution and arms the next cue', () => {
    const runtime = createCueRuntime({ cues });
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    const afterFirst = startCue(runtime, cues, 'cue-a', { now });
    expect(afterFirst.liveCueId).toBe('cue-a');
    expect(afterFirst.armedCueId).toBe('cue-b');
    expect(afterFirst.statuses['cue-a']).toBe(CUE_STATUS.LIVE);
    expect(afterFirst.executions['cue-a']).toMatchObject({
      status: EXECUTION_STATE.REQUESTED,
      cueId: 'cue-a',
      simulated: false,
      requestedAt: new Date(now).toISOString(),
    });
    expect(afterFirst.cueStartedAt).toBe(now);

    const afterSecond = startCue(afterFirst, cues, 'cue-b', { simulated: true, now: now + 5000 });
    expect(afterSecond.statuses['cue-a']).toBe(CUE_STATUS.COMPLETED);
    expect(afterSecond.statuses['cue-b']).toBe(CUE_STATUS.LIVE);
    expect(afterSecond.executions['cue-b'].simulated).toBe(true);
    expect(afterSecond.armedCueId).toBe('cue-c');
  });

  it('leaves runtime untouched for an unknown cue', () => {
    const runtime = createCueRuntime({ cues });
    expect(startCue(runtime, cues, 'missing')).toBe(runtime);
  });

  it('records acknowledgements without inventing a completed state', () => {
    const runtime = startCue(createCueRuntime({ cues }), cues, 'cue-a');
    const acknowledged = acknowledgeCueExecution(runtime, 'cue-a', {
      status: EXECUTION_STATE.ACKNOWLEDGED,
      detail: 'Receiver accepted frame',
      path: '/display',
      adapter: 'screenpilot',
    });
    expect(acknowledged.executions['cue-a'].status).toBe(EXECUTION_STATE.ACKNOWLEDGED);
    expect(acknowledged.executions['cue-a'].acknowledgedAt).toBeTruthy();
    expect(acknowledged.executions['cue-a'].completedAt).toBeUndefined();
    expect(acknowledged.executions['cue-a'].path).toBe('/display');
    expect(acknowledged.statuses['cue-a']).toBe(CUE_STATUS.LIVE);

    const unknown = acknowledgeCueExecution(runtime, 'cue-a', { status: EXECUTION_STATE.UNKNOWN });
    expect(unknown.executions['cue-a'].status).toBe(EXECUTION_STATE.UNKNOWN);
    expect(unknown.executions['cue-a'].acknowledgedAt).toBeUndefined();
    expect(unknown.executions['cue-a'].completedAt).toBeUndefined();
  });

  it('marks a live cue as errored when its execution fails', () => {
    const runtime = startCue(createCueRuntime({ cues }), cues, 'cue-a');
    const failed = acknowledgeCueExecution(runtime, 'cue-a', {
      status: EXECUTION_STATE.FAILED,
      detail: 'UDP failure',
    });
    expect(failed.statuses['cue-a']).toBe(CUE_STATUS.ERROR);
    expect(failed.executions['cue-a'].status).toBe(EXECUTION_STATE.FAILED);
    expect(acknowledgeCueExecution(runtime, 'missing', { status: 'failed' })).toBe(runtime);
  });

  it('completes a cue manually and moves the armed cue forward', () => {
    const runtime = startCue(createCueRuntime({ cues }), cues, 'cue-a');
    const complete = markCueComplete(runtime, cues, 'cue-a');
    expect(complete.liveCueId).toBeNull();
    expect(complete.cueStartedAt).toBeNull();
    expect(complete.armedCueId).toBe('cue-b');
    expect(complete.statuses['cue-a']).toBe(CUE_STATUS.COMPLETED);
    expect(complete.executions['cue-a']).toMatchObject({
      status: EXECUTION_STATE.COMPLETED,
      manualCompletion: true,
    });
    expect(complete.executions['cue-a'].completedAt).toBeTruthy();
  });

  it('skips a cue without inventing an execution record', () => {
    const runtime = startCue(createCueRuntime({ cues }), cues, 'cue-a');
    const skipped = skipCue(runtime, cues, 'cue-a');
    expect(skipped.liveCueId).toBeNull();
    expect(skipped.statuses['cue-a']).toBe(CUE_STATUS.SKIPPED);
    expect(skipped.armedCueId).toBe('cue-b');
    // The earlier GO request remains in the audit history; skipping must not
    // pretend that it completed successfully.
    expect(skipped.executions['cue-a'].status).toBe(EXECUTION_STATE.REQUESTED);
  });

  it('resets progress but keeps the mode and armed cue', () => {
    let runtime = createCueRuntime({ cues, mode: RUNTIME_MODE.REHEARSAL });
    runtime = startCue(runtime, cues, 'cue-a');
    runtime = markCueComplete(runtime, cues, 'cue-a');
    const reset = resetCueRuntime(runtime, cues);
    expect(reset.liveCueId).toBeNull();
    expect(reset.mode).toBe(RUNTIME_MODE.REHEARSAL);
    expect(reset.armedCueId).toBe('cue-b');
    expect(reset.executions).toEqual({});
  });

  it('switches runtime mode with a truthful action label', () => {
    const runtime = setRuntimeMode(createCueRuntime({ cues }), RUNTIME_MODE.REHEARSAL);
    expect(runtime.mode).toBe('rehearsal');
    expect(runtime.lastActionLabel).toBe('Rehearsal mode');
  });
});

describe('cue progress, timer and labels', () => {
  it('counts completed and skipped cues toward progress', () => {
    const runtime = createCueRuntime({ cues });
    runtime.statuses['cue-a'] = CUE_STATUS.COMPLETED;
    runtime.statuses['cue-b'] = CUE_STATUS.SKIPPED;
    expect(progressFor(cues, runtime)).toBe(67);
    expect(progressFor([], runtime)).toBe(0);
  });

  it('reports elapsed, remaining and overdue time only for the live cue', () => {
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    const runtime = { ...createCueRuntime({ cues }), liveCueId: 'cue-a', cueStartedAt: now };
    expect(cueTimer(runtime, cues[0], now + 15_000)).toEqual({
      elapsedSeconds: 15,
      remainingSeconds: 15,
      overdue: false,
    });
    expect(cueTimer(runtime, cues[0], now + 31_000).overdue).toBe(true);
    expect(cueTimer(runtime, cues[1], now + 15_000)).toEqual({
      elapsedSeconds: 0,
      remainingSeconds: null,
      overdue: false,
    });
    expect(cueTimer(runtime, cues[2], now + 15_000).remainingSeconds).toBeNull();
  });

  it('never labels an unverified OSC send as completed', () => {
    expect(executionLabel(null, 'live')).toBe('No command');
    expect(
      executionLabel({ status: EXECUTION_STATE.UNKNOWN, simulated: false }, 'live'),
    ).toBe('Sent — unverified');
    expect(
      executionLabel({ status: EXECUTION_STATE.COMPLETED, simulated: true }, 'live'),
    ).toBe('Simulated · Completed');
    expect(
      executionLabel({ status: EXECUTION_STATE.REQUESTED, simulated: false }, 'rehearsal'),
    ).toBe('Simulated · Requested');
  });
});
