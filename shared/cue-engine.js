import { CUE_STATUS, EXECUTION_STATE, RUNTIME_MODE } from './enums.js';

export function cueNumber(cues, cueId) {
  const index = cues.findIndex((cue) => cue.id === cueId);
  return index === -1 ? null : index + 1;
}

export function nextCue(cues, cueId) {
  const index = cues.findIndex((cue) => cue.id === cueId);
  if (index === -1) return cues[0] || null;
  return cues[index + 1] || null;
}

export function previousCue(cues, cueId) {
  const index = cues.findIndex((cue) => cue.id === cueId);
  if (index <= 0) return null;
  return cues[index - 1] || null;
}

export function createCueRuntime({ cues = [], armedCueId = null, liveCueId = null, mode = RUNTIME_MODE.LIVE } = {}) {
  const validIds = new Set(cues.map((cue) => cue.id));
  const armed = validIds.has(armedCueId) ? armedCueId : cues[0]?.id || null;
  const live = validIds.has(liveCueId) ? liveCueId : null;
  const statuses = {};
  for (const cue of cues) {
    statuses[cue.id] = cue.id === live ? CUE_STATUS.LIVE : CUE_STATUS.READY;
  }
  return {
    mode,
    armedCueId: armed,
    liveCueId: live,
    statuses,
    executions: {},
    cueStartedAt: live ? Date.now() : null,
    lastActionAt: null,
    lastActionLabel: null,
  };
}

function finishExecution(execution, status, extra = {}) {
  if (!execution) return null;
  return {
    ...execution,
    status,
    ...extra,
    updatedAt: new Date().toISOString(),
  };
}

export function armCue(runtime, cues, cueId) {
  if (!cues.some((cue) => cue.id === cueId)) return runtime;
  const statuses = { ...runtime.statuses };
  if (statuses[cueId] === CUE_STATUS.SKIPPED || statuses[cueId] === CUE_STATUS.ERROR) {
    statuses[cueId] = CUE_STATUS.READY;
  }
  return {
    ...runtime,
    armedCueId: cueId,
    statuses,
    lastActionAt: Date.now(),
    lastActionLabel: 'Arm cue',
  };
}

export function startCue(runtime, cues, cueId, { simulated = false, now = Date.now() } = {}) {
  const cue = cues.find((item) => item.id === cueId);
  if (!cue) return runtime;
  const statuses = { ...runtime.statuses };
  if (runtime.liveCueId && runtime.liveCueId !== cueId) {
    statuses[runtime.liveCueId] = CUE_STATUS.COMPLETED;
  }
  statuses[cueId] = CUE_STATUS.LIVE;
  const following = nextCue(cues, cueId);
  const requestedAt = new Date(now).toISOString();
  return {
    ...runtime,
    liveCueId: cueId,
    armedCueId: following?.id || cueId,
    statuses,
    executions: {
      ...runtime.executions,
      [cueId]: {
        status: EXECUTION_STATE.REQUESTED,
        simulated,
        requestedAt,
        updatedAt: requestedAt,
        cueId,
      },
    },
    cueStartedAt: now,
    lastActionAt: now,
    lastActionLabel: 'GO',
  };
}

export function acknowledgeCueExecution(runtime, cueId, result = {}) {
  const current = runtime.executions[cueId];
  if (!current) return runtime;
  const nextStatus = result.status || EXECUTION_STATE.UNKNOWN;
  const updated = finishExecution(current, nextStatus, {
    acknowledgedAt:
      nextStatus === EXECUTION_STATE.ACKNOWLEDGED || nextStatus === EXECUTION_STATE.COMPLETED
        ? new Date().toISOString()
        : undefined,
    completedAt: nextStatus === EXECUTION_STATE.COMPLETED ? new Date().toISOString() : undefined,
    detail: result.detail || '',
    path: result.path || '',
    adapter: result.adapter || '',
    simulated: Boolean(result.simulated ?? current.simulated),
  });
  const statuses = { ...runtime.statuses };
  if (nextStatus === EXECUTION_STATE.FAILED && statuses[cueId] === CUE_STATUS.LIVE) {
    statuses[cueId] = CUE_STATUS.ERROR;
  }
  return {
    ...runtime,
    statuses,
    executions: { ...runtime.executions, [cueId]: updated },
    lastActionAt: Date.now(),
    lastActionLabel: 'Execution update',
  };
}

export function markCueComplete(runtime, cues, cueId) {
  const statuses = { ...runtime.statuses };
  statuses[cueId] = CUE_STATUS.COMPLETED;
  const now = Date.now();
  const execution = runtime.executions[cueId];
  return {
    ...runtime,
    statuses,
    liveCueId: runtime.liveCueId === cueId ? null : runtime.liveCueId,
    armedCueId: nextCue(cues, cueId)?.id || runtime.armedCueId,
    executions: execution
      ? {
          ...runtime.executions,
          [cueId]: finishExecution(execution, EXECUTION_STATE.COMPLETED, {
            completedAt: new Date(now).toISOString(),
            manualCompletion: true,
          }),
        }
      : runtime.executions,
    cueStartedAt: runtime.liveCueId === cueId ? null : runtime.cueStartedAt,
    lastActionAt: now,
    lastActionLabel: 'Complete cue',
  };
}

export function skipCue(runtime, cues, cueId) {
  const statuses = { ...runtime.statuses };
  statuses[cueId] = CUE_STATUS.SKIPPED;
  const now = Date.now();
  return {
    ...runtime,
    statuses,
    liveCueId: runtime.liveCueId === cueId ? null : runtime.liveCueId,
    armedCueId: nextCue(cues, cueId)?.id || runtime.armedCueId,
    cueStartedAt: runtime.liveCueId === cueId ? null : runtime.cueStartedAt,
    lastActionAt: now,
    lastActionLabel: 'Skip cue',
  };
}

export function resetCueRuntime(runtime, cues) {
  return createCueRuntime({
    cues,
    armedCueId: runtime.armedCueId,
    liveCueId: null,
    mode: runtime.mode,
  });
}

export function setRuntimeMode(runtime, mode) {
  return {
    ...runtime,
    mode,
    lastActionAt: Date.now(),
    lastActionLabel: mode === RUNTIME_MODE.REHEARSAL ? 'Rehearsal mode' : 'Live mode',
  };
}

export function setRuntimeArmed(runtime, cues, cueId) {
  return armCue(runtime, cues, cueId);
}

export function progressFor(cues, runtime) {
  if (!cues.length) return 0;
  const completed = cues.filter((cue) => {
    const status = runtime.statuses[cue.id];
    return status === CUE_STATUS.COMPLETED || status === CUE_STATUS.SKIPPED;
  }).length;
  return Math.round((completed / cues.length) * 100);
}

export function cueTimer(runtime, cue, now = Date.now()) {
  if (!runtime.cueStartedAt || !cue || runtime.liveCueId !== cue.id) {
    return { elapsedSeconds: 0, remainingSeconds: null, overdue: false };
  }
  const elapsedSeconds = Math.max(0, Math.floor((now - runtime.cueStartedAt) / 1000));
  if (!cue.durationSeconds) return { elapsedSeconds, remainingSeconds: null, overdue: false };
  const remainingSeconds = cue.durationSeconds - elapsedSeconds;
  return { elapsedSeconds, remainingSeconds, overdue: remainingSeconds < 0 };
}

export function executionLabel(execution, mode) {
  if (!execution) return 'No command';
  const base = {
    idle: 'No command',
    requested: 'Requested',
    acknowledged: 'Acknowledged',
    completed: 'Completed',
    failed: 'Failed',
    unknown: 'Sent — unverified',
  }[execution.status] || 'Unknown';
  if (execution.simulated || mode === RUNTIME_MODE.REHEARSAL) {
    return `Simulated · ${base}`;
  }
  return base;
}
