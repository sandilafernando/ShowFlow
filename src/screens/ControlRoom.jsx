import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Clock,
  ListChecks,
  MonitorPlay,
  OctagonAlert,
  Play,
  Power,
  Radio,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader, useNow } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import {
  CUE_STATUS_META,
  CUE_TYPE_MAP,
  EVENT_STATUS_META,
  EXECUTION_STATE,
  EXECUTION_STATE_META,
  RUNTIME_MODE,
} from '@shared/enums.js';
import {
  acknowledgeCueExecution,
  armCue,
  createCueRuntime,
  cueTimer,
  markCueComplete,
  nextCue,
  previousCue,
  progressFor,
  resetCueRuntime,
  skipCue,
  startCue,
} from '@shared/cue-engine.js';
import { formatClock, formatDurationWords, formatEventWhen, formatTimeOfDay } from '@shared/format.js';
import {
  Badge,
  Button,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
} from '../components/ui.jsx';

function EmptyControl({ events, onChoose, onCreate }) {
  const active = events.filter((event) => event.status === 'live' || event.status === 'rehearsal');
  const available = events.filter((event) => !event.archived);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Live production control"
        title="Control Room"
        description="Choose an event to prepare its running order. No cue runs, no screen changes and no OSC is sent until you deliberately start a session and press GO."
        actions={
          <>
            <Button as={Link} to="/screens" variant="secondary"><MonitorPlay size={14} /> ScreenPilot</Button>
            <Button as={Link} to="/events?new=1" variant="primary"><ListChecks size={14} /> New event</Button>
          </>
        }
      />

      {active.length ? (
        <div style={{ marginBottom: 24 }}>
          <div className="section-heading">
            <div>
              <div className="eyebrow">Active sessions</div>
              <h2>Already running</h2>
            </div>
          </div>
          <div className="grid-2">
            {active.map((event) => (
              <button key={event.id} type="button" onClick={() => onChoose(event.id)} className="panel crosshair" style={{ padding: 19, textAlign: 'left', cursor: 'pointer', borderColor: event.status === 'live' ? 'rgba(251,113,133,.3)' : 'rgba(251,191,36,.25)' }}>
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={event.status} meta={EVENT_STATUS_META} />
                  <ChevronsRight size={15} className="text-faint" />
                </div>
                <div style={{ marginTop: 13, fontSize: 18, fontWeight: 570, letterSpacing: '-.02em' }}>{event.title}</div>
                <div className="text-faint" style={{ marginTop: 3, fontSize: 11.5 }}>
                  {formatEventWhen(event.eventDate, event.startTime)} · {event.stats.cueCount} cues
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section-heading">
        <div>
          <div className="eyebrow">Event index</div>
          <h2>Ready the control room</h2>
          <p>Rehearsal never transmits integration commands. Live sends only when a mapped cue is invoked.</p>
        </div>
      </div>

      <Panel style={{ overflow: 'hidden' }}>
        {available.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ width: 72, textAlign: 'right' }}>Cues</th>
                  <th style={{ width: 100 }}>Media</th>
                  <th style={{ width: 120, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {available.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <button type="button" onClick={() => onChoose(event.id)} style={{ textAlign: 'left', border: 0, background: 'none', padding: 0, cursor: 'pointer' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 540 }}>{event.title}</div>
                        <div className="text-faint" style={{ marginTop: 1, fontSize: 10.5 }}>{event.venue || 'Venue not set'}</div>
                      </button>
                    </td>
                    <td className="mono" style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{formatEventWhen(event.eventDate, event.startTime)}</td>
                    <td><StatusBadge status={event.status} meta={EVENT_STATUS_META} /></td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>{event.stats.cueCount}</td>
                    <td>{event.stats.missingMediaCount ? <Badge tone="amber" dot>{event.stats.missingMediaCount} missing</Badge> : event.stats.cueCount ? <Badge tone="green" dot>Available</Badge> : <Badge tone="neutral">No media</Badge>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button size="sm" variant="soft" onClick={() => onChoose(event.id)}>Prepare <ChevronRight size={13} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><ListChecks size={19} /></div>
            <h3>No events yet</h3>
            <p>Create an event, add cues, then return to the Control Room to rehearse or go live.</p>
            <Button variant="soft" size="sm" onClick={onCreate} style={{ marginTop: 15 }}>Create an event</Button>
          </div>
        )}
      </Panel>

      <div className="control-safety-note">
        <ShieldAlert size={15} />
        <p>
          ShowFlow never starts a cue at launch and never replays commands after a restart. Live status is restored
          as <strong>interrupted</strong> if the app closes during a show. The operator must invoke every cue again.
        </p>
      </div>
    </div>
  );
}

function ReadinessPanel({ event }) {
  const setup = event.checklists.filter((item) => item.kind === 'setup');
  const setupDone = setup.filter((item) => item.done).length;
  const setupPercent = setup.length ? Math.round((setupDone / setup.length) * 100) : 0;
  return (
    <Panel style={{ padding: 16 }}>
      <div className="eyebrow">Preflight readiness</div>
      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <div>
          <div className="flex justify-between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 11.5 }}>Setup checks</span>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{setupDone}/{setup.length}</span>
          </div>
          <ProgressBar value={setupPercent} tone={setupPercent === 100 && setup.length ? 'positive' : 'accent'} height={3} label="Setup checks" />
        </div>
        <div className="flex items-center justify-between gap-2" style={{ fontSize: 11.5 }}>
          <span className="flex items-center gap-1 text-muted"><ListChecks size={12} /> Running order</span>
          <span className="mono" style={{ fontSize: 10 }}>{event.cues.length} cues</span>
        </div>
        <div className="flex items-center justify-between gap-2" style={{ fontSize: 11.5 }}>
          <span className="flex items-center gap-1 text-muted"><Users size={12} /> Crew assigned</span>
          <span className="mono" style={{ fontSize: 10 }}>{event.assignments.length}</span>
        </div>
        <div className="flex items-center justify-between gap-2" style={{ fontSize: 11.5 }}>
          <span className="flex items-center gap-1 text-muted"><MonitorPlay size={12} /> Linked media</span>
          <span className="mono" style={{ fontSize: 10 }}>{event.readiness.linkedAssets}</span>
        </div>
      </div>
      {event.readiness.missingAssets ? (
        <div style={{ marginTop: 13, padding: '9px 10px', borderRadius: 6, border: '1px solid rgba(251,191,36,.2)', background: 'rgba(251,191,36,.04)', fontSize: 10.5, lineHeight: '16px', color: 'var(--warning)' }}>
          <div className="flex items-start gap-2">
            <TriangleAlert size={13} style={{ flex: 'none', marginTop: 1 }} />
            <span>{event.readiness.missingAssets} cue media file{event.readiness.missingAssets === 1 ? ' is' : 's are'} missing. Rehearsal can continue; playback may fail.</span>
          </div>
        </div>
      ) : null}
      <Button as={Link} to={`/events/${event.id}`} size="sm" variant="ghost" style={{ marginTop: 12, paddingLeft: 0 }}>
        Open event workspace <ChevronRight size={12} />
      </Button>
    </Panel>
  );
}

function CueList({ event, runtime, active, onArm, busy }) {
  const statuses = runtime?.statuses || {};
  const armedId = runtime?.armedCueId;
  const liveId = runtime?.liveCueId;
  return (
    <Panel style={{ overflow: 'hidden' }}>
      <div className="flex items-center justify-between gap-3" style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <div className="eyebrow">Running order</div>
          <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 540 }}>{event.cues.length} cues · click a row to arm</div>
        </div>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{active ? 'ARMING ENABLED' : 'PREVIEW'}</span>
      </div>
      <div className="control-cue-list scroll-thin">
        {event.cues.map((cue, index) => {
          const status = statuses[cue.id] || 'ready';
          const isArmed = cue.id === armedId;
          const isLive = cue.id === liveId;
          return (
            <button
              key={cue.id}
              type="button"
              className={`control-cue-row${isArmed ? ' armed' : ''}${isLive ? ' live' : ''}`}
              onClick={() => active && onArm(cue.id)}
              disabled={!active || busy}
              title={active ? `Arm cue ${index + 1}: ${cue.title}` : 'Start a session to arm cues'}
            >
              <span className="mono control-cue-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="control-cue-marker" />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="flex items-center gap-2">
                  <span className="truncate" style={{ fontSize: 12, fontWeight: isArmed || isLive ? 570 : 480 }}>{cue.title}</span>
                  {cue.asset && !cue.asset.available ? <TriangleAlert size={11} style={{ color: 'var(--warning)', flex: 'none' }} /> : null}
                </span>
                <span className="text-faint" style={{ display: 'block', marginTop: 1, fontSize: 9.5 }}>
                  {CUE_TYPE_MAP[cue.type]?.label}{cue.durationSeconds ? ` · ${formatDurationWords(cue.durationSeconds)}` : ''}{cue.operatorName ? ` · ${cue.operatorName}` : ''}
                </span>
              </span>
              {isLive ? <Badge tone="red" dot live>Live</Badge> : isArmed ? <Badge tone="cyan">Next</Badge> : <Badge tone={CUE_STATUS_META[status]?.tone || 'neutral'}>{CUE_STATUS_META[status]?.label || status}</Badge>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

export default function ControlRoom() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { toast, confirm, confirming } = useApp();
  const now = useNow(1000);
  const [event, setEvent] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [busy, setBusy] = useState('');
  const [lastExecution, setLastExecution] = useState(null);
  const [screenSync, setScreenSync] = useState(null);
  const [screenStatus, setScreenStatus] = useState(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const goRef = useRef(() => {});

  const { data, error, loading, reload } = useLoader(
    async () => {
      const [events, selected, displays, integration] = await Promise.all([
        api('events.list', { limit: 400 }),
        eventId ? api('events.get', eventId) : Promise.resolve(null),
        api('displays.list'),
        api('integrations.get'),
      ]);
      return { events, event: selected, displays, integration };
    },
    [eventId],
  );

  useEffect(() => {
    if (!data?.event) {
      setEvent(null);
      setRuntime(null);
      return;
    }
    const loaded = data.event;
    setEvent(loaded);
    setRuntime(
      createCueRuntime({
        cues: loaded.cues,
        armedCueId: loaded.armedCueId,
        liveCueId: loaded.liveCueId,
        mode: loaded.status === 'rehearsal' ? RUNTIME_MODE.REHEARSAL : RUNTIME_MODE.LIVE,
      }),
    );
    setLastExecution(null);
    setScreenSync(null);
    setSessionSummary(null);
    setScreenStatus(data.displays?.server || null);
  }, [data]);

  useEffect(() => {
    if (!data?.displays?.server) return;
    setScreenStatus(data.displays.server);
  }, [data?.displays?.server]);

  useEffect(() => {
    if (!window.showflow?.displays?.onStatus) return undefined;
    const unsubscribe = window.showflow.displays.onStatus((status) => setScreenStatus(status));
    return () => unsubscribe?.();
  }, []);

  const sessionActive = event?.status === 'live' || event?.status === 'rehearsal';
  const rehearsal = event?.status === 'rehearsal';
  const cues = useMemo(() => event?.cues || [], [event?.cues]);
  const liveCue = runtime?.liveCueId ? cues.find((cue) => cue.id === runtime.liveCueId) : null;
  const armedCue = runtime?.armedCueId ? cues.find((cue) => cue.id === runtime.armedCueId) : null;
  const nextAfterArmed = armedCue ? nextCue(cues, armedCue.id) : cues[0];
  const timer = liveCue ? cueTimer(runtime, liveCue, now) : null;
  const progress = runtime ? progressFor(cues, runtime) : 0;
  const integration = data?.integration;
  const connectedScreens = screenStatus?.connections?.length || 0;
  const totalScreens = data?.displays?.items?.filter((display) => display.enabled).length || 0;

  const arm = useCallback(
    async (cueId) => {
      if (!event || !runtime) return;
      const next = armCue(runtime, cues, cueId);
      if (next === runtime) return;
      setRuntime(next);
      setBusy('arm');
      try {
        await api('events.runtime', {
          eventId: event.id,
          status: event.status,
          armedCueId: next.armedCueId,
          liveCueId: next.liveCueId ?? null,
        });
      } catch (caught) {
        setRuntime(runtime);
        toast.error('Could not arm cue', friendlyError(caught));
      } finally {
        setBusy('');
      }
    },
    [event, runtime, cues, toast],
  );

  const persist = useCallback(
    async (nextRuntime, status = event?.status) => {
      const updated = await api('events.runtime', {
        eventId: event.id,
        status,
        armedCueId: nextRuntime.armedCueId,
        liveCueId: nextRuntime.liveCueId ?? null,
      });
      setEvent(updated);
      return updated;
    },
    [event],
  );

  const startSession = useCallback(
    async (mode) => {
      if (!event) return;
      if (!event.cues.length) {
        toast.warning('Add cues first', 'A session needs at least one cue in the running order.');
        return;
      }
      if (mode === 'live') {
        const ok = await confirm({
          title: 'Start the live session?',
          eyebrow: 'Live production',
          message: `“${event.title}” will be marked LIVE. The running order and armed cue will be visible to every ShowFlow surface.`,
          detail:
            'Starting the session sends no OSC and starts no cue. Going live only unlocks deliberate integration sends when you press GO. Rehearsal marks are discarded.',
          confirmLabel: 'Go live',
          tone: 'danger',
        });
        if (!ok) return;
      }
      setBusy(mode);
      try {
        const armedCueId = runtime?.armedCueId || event.cues[0]?.id || null;
        const updated = await api('events.runtime', {
          eventId: event.id,
          status: mode,
          armedCueId,
          liveCueId: null,
        });
        setEvent(updated);
        setRuntime(
          createCueRuntime({
            cues: updated.cues,
            armedCueId: updated.armedCueId,
            liveCueId: null,
            mode: mode === 'rehearsal' ? RUNTIME_MODE.REHEARSAL : RUNTIME_MODE.LIVE,
          }),
        );
        setLastExecution(null);
        setScreenSync(null);
        setSessionSummary(null);
        toast.success(mode === 'live' ? 'Live session started' : 'Rehearsal started', mode === 'live' ? 'No command was sent. GO is still deliberate.' : 'No integration commands will be transmitted.');
      } catch (caught) {
        toast.error('Could not start session', friendlyError(caught));
      } finally {
        setBusy('');
      }
    },
    [event, runtime, confirm, toast],
  );

  const endSession = useCallback(async () => {
    if (!event) return;
    const endingLive = event.status === 'live';
    const ok = await confirm({
      title: endingLive ? 'End the live session?' : 'End rehearsal?',
      eyebrow: endingLive ? 'Live production' : 'Rehearsal',
      message: endingLive
        ? `“${event.title}” will be marked completed. ShowFlow will stop tracking a live cue.`
        : `“${event.title}” will return to draft. Rehearsal marks will be cleared.`,
      detail:
        'Ending a session does not stop projectors, media players, lighting desks or Resolume. The last screen content remains until you black it out or change it. No command is sent automatically.',
      confirmLabel: endingLive ? 'End live session' : 'End rehearsal',
      tone: endingLive ? 'danger' : 'warning',
    });
    if (!ok) return;
    setBusy('end');
    try {
      const completed = cues.filter((cue) => runtime?.statuses[cue.id] === 'completed').length;
      const skipped = cues.filter((cue) => runtime?.statuses[cue.id] === 'skipped').length;
      const summary = { title: event.title, mode: event.status, completed, skipped, total: cues.length, at: new Date().toISOString() };
      const updated = await api('events.runtime', {
        eventId: event.id,
        status: endingLive ? 'completed' : 'draft',
        armedCueId: runtime?.armedCueId || event.cues[0]?.id || null,
        liveCueId: null,
      });
      setEvent(updated);
      setRuntime(
        createCueRuntime({
          cues: updated.cues,
          armedCueId: updated.armedCueId,
          liveCueId: null,
          mode: RUNTIME_MODE.LIVE,
        }),
      );
      setLastExecution(null);
      setSessionSummary(summary);
      toast.success(endingLive ? 'Live session ended' : 'Rehearsal ended', 'No conditional changes were made to screens or integrations.');
    } catch (caught) {
      toast.error('Could not end session', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }, [event, cues, runtime, confirm, toast]);

  const go = useCallback(async () => {
    if (!event || !runtime || !sessionActive || busy) return;
    const target = cues.find((cue) => cue.id === runtime.armedCueId);
    if (!target) {
      toast.warning('No cue armed', 'Select a cue in the running order before pressing GO.');
      return;
    }
    setBusy('go');
    const isRehearsal = event.status === 'rehearsal';
    const next = startCue(runtime, cues, target.id, { simulated: isRehearsal });
    try {
      await persist(next, event.status);
    } catch (caught) {
      toast.error('GO was not sent', `ShowFlow could not save the armed cue: ${friendlyError(caught)}`);
      setBusy('');
      return;
    }
    setRuntime(next);
    setLastExecution({
      cueTitle: target.title,
      cueNumber: cues.findIndex((cue) => cue.id === target.id) + 1,
      status: 'requested',
      simulated: isRehearsal,
      detail: 'Cue requested locally.',
    });

    let screenResult = null;
    try {
      const pushed = await api('displays.push', { eventId: event.id, target: { all: true } });
      screenResult = {
        tone: pushed.delivered.length ? 'positive' : 'warning',
        message:
          pushed.targets === 0
            ? 'No enabled displays are configured. Screen content was not sent.'
            : `${pushed.delivered.length} of ${pushed.targets} receiver${pushed.targets === 1 ? '' : 's'} received cue content${pushed.offline.length ? ` · ${pushed.offline.length} offline` : ''}. Browser receipt only — verify the projector output.`,
      };
    } catch (caught) {
      screenResult = {
        tone: 'neutral',
        message: caught.code === 'CONFLICT' || caught.code === 'SERVER_STOPPED'
          ? 'Screens were not updated because the ScreenPilot receiver server is stopped.'
          : `Screens were not updated: ${friendlyError(caught)}`,
      };
    }
    setScreenSync(screenResult);

    if (target.resolumeAction && target.resolumeAction !== 'none') {
      if (isRehearsal) {
        setRuntime((current) =>
          acknowledgeCueExecution(current, target.id, {
            status: EXECUTION_STATE.COMPLETED,
            simulated: true,
            detail: 'Rehearsal simulation — no OSC datagram was sent.',
            adapter: 'rehearsal',
          }),
        );
        setLastExecution((current) => ({
          ...current,
          status: EXECUTION_STATE.COMPLETED,
          simulated: true,
          detail: 'Rehearsal simulation — no OSC datagram was sent.',
        }));
      } else if (!integration?.config?.enabled) {
        setLastExecution((current) => ({
          ...current,
          status: EXECUTION_STATE.IDLE,
          detail: 'Cue is mapped to Resolume, but the integration is disabled in Settings. No command was sent.',
        }));
      } else {
        try {
          const result = await api('integrations.send', { eventId: event.id, cueId: target.id });
          const executionStatus = result.acknowledged
            ? EXECUTION_STATE.COMPLETED
            : result.ok
              ? EXECUTION_STATE.UNKNOWN
              : EXECUTION_STATE.FAILED;
          setRuntime((current) =>
            acknowledgeCueExecution(current, target.id, {
              status: executionStatus,
              simulated: Boolean(result.simulated),
              detail: result.detail || '',
              path: result.path || '',
              adapter: result.mode || '',
            }),
          );
          setLastExecution((current) => ({
            ...current,
            status: executionStatus,
            simulated: Boolean(result.simulated),
            detail: result.detail || '',
            path: result.path || '',
            adapter: result.mode || '',
          }));
          if (executionStatus === EXECUTION_STATE.FAILED) {
            toast.error('Integration did not send', result.detail || 'Inspect the integration settings.');
          }
        } catch (caught) {
          setLastExecution((current) => ({
            ...current,
            status: EXECUTION_STATE.FAILED,
            detail: friendlyError(caught),
          }));
          toast.error('Integration send failed', friendlyError(caught));
        }
      }
    } else {
      setLastExecution((current) => ({
        ...current,
        status: EXECUTION_STATE.IDLE,
        detail: 'Manual cue — no integration mapping. Operate the source as rehearsed.',
      }));
    }

    api('activity.log', {
      eventId: event.id,
      kind: 'cue',
      mode: isRehearsal ? 'rehearsal' : 'live',
      message: `${isRehearsal ? 'Rehearsal · ' : ''}GO cue ${cues.findIndex((cue) => cue.id === target.id) + 1}: ${target.title}`,
      detail: { cueId: target.id, simulated: isRehearsal, screenReceipts: screenResult?.message || '' },
    }).catch(() => {});
    setBusy('');
  }, [event, runtime, cues, sessionActive, busy, persist, integration, toast]);

  goRef.current = go;

  useEffect(() => {
    const handler = (keyEvent) => {
      if (!sessionActive || confirming || emergencyOpen) return;
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key === 'Enter') {
        keyEvent.preventDefault();
        goRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionActive, confirming, emergencyOpen]);

  const complete = useCallback(async () => {
    if (!liveCue) return;
    setBusy('complete');
    const next = markCueComplete(runtime, cues, liveCue.id);
    try {
      await persist(next, event.status);
      setRuntime(next);
      api('activity.log', {
        eventId: event.id,
        kind: 'cue',
        mode: rehearsal ? 'rehearsal' : 'live',
        message: `${rehearsal ? 'Rehearsal · ' : ''}Cue marked complete: ${liveCue.title}`,
        detail: { cueId: liveCue.id },
      }).catch(() => {});
    } catch (caught) {
      toast.error('Could not complete cue', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }, [liveCue, runtime, cues, event, persist, rehearsal, toast]);

  const skip = useCallback(async () => {
    if (!liveCue) return;
    setBusy('skip');
    const next = skipCue(runtime, cues, liveCue.id);
    try {
      await persist(next, event.status);
      setRuntime(next);
      toast.info('Cue skipped', liveCue.title);
    } catch (caught) {
      toast.error('Could not skip cue', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }, [liveCue, runtime, cues, event, persist, toast]);

  const resetRehearsal = useCallback(async () => {
    if (!event || event.status !== 'rehearsal') return;
    const ok = await confirm({
      title: 'Reset rehearsal marks?',
      message: 'Cue completion, skip and live markers will be cleared. The armed cue stays where it is.',
      detail: 'This affects ShowFlow only. It sends nothing to screens or integrations.',
      confirmLabel: 'Reset marks',
      tone: 'warning',
    });
    if (!ok) return;
    setBusy('reset');
    const next = resetCueRuntime(runtime, cues);
    try {
      await persist(next, event.status);
      setRuntime(next);
      setLastExecution(null);
      toast.success('Rehearsal marks cleared');
    } catch (caught) {
      toast.error('Could not reset rehearsal', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }, [event, runtime, cues, persist, confirm, toast]);

  const blackout = useCallback(async () => {
    setBusy('blackout');
    try {
      const result = await api('displays.blackout', {});
      toast.success(
        'Blackout sent',
        result.targets === 0
          ? 'No enabled displays were targeted. Check ScreenPilot.'
          : `${result.delivered.length} of ${result.targets} receiver${result.targets === 1 ? '' : 's'} received the blackout. Verify the projector output visually.`,
      );
      setScreenSync({
        tone: result.delivered.length ? 'warning' : 'neutral',
        message: result.delivered.length
          ? `Blackout sent to ${result.delivered.length} receiver${result.delivered.length === 1 ? '' : 's'}. Browser receipt does not prove the projector is black.`
          : 'Blackout could not be delivered to any receiver.',
      });
      setEmergencyOpen(false);
    } catch (caught) {
      toast.error('Blackout not sent', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }, [toast]);

  const interruptSession = useCallback(async () => {
    if (!event) return;
    setBusy('interrupt');
    try {
      const completed = cues.filter((cue) => runtime?.statuses[cue.id] === 'completed').length;
      const summary = { title: event.title, mode: event.status, completed, skipped: 0, total: cues.length, at: new Date().toISOString(), interrupted: true };
      const updated = await api('events.runtime', {
        eventId: event.id,
        status: 'interrupted',
        armedCueId: runtime?.armedCueId || event.cues[0]?.id || null,
        liveCueId: null,
      });
      setEvent(updated);
      setRuntime(createCueRuntime({ cues: updated.cues, armedCueId: updated.armedCueId, liveCueId: null, mode: RUNTIME_MODE.LIVE }));
      setSessionSummary(summary);
      setEmergencyOpen(false);
      toast.warning('Session marked interrupted', 'No commands were replayed or sent to production equipment.');
    } catch (caught) {
      toast.error('Could not interrupt session', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }, [event, cues, runtime, toast]);

  if (loading) {
    return (
      <div className="page">
        <PageHeader eyebrow="Live production control" title="Opening Control Room" />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Live production control" title="Control Room unavailable" />
        <ErrorState error={error} onRetry={() => reload()} />
      </div>
    );
  }

  if (!eventId) {
    return <EmptyControl events={data?.events || []} onChoose={(id) => navigate(`/control/${id}`)} onCreate={() => navigate('/events?new=1')} />;
  }

  if (!event || !runtime) {
    return (
      <div className="page">
        <PageHeader eyebrow="Live production control" title="Event not loaded" actions={<Button as={Link} to="/control" variant="ghost"><ArrowLeft size={14} /> Control Room</Button>} />
        <ErrorState title="This event could not be opened" error={{ message: 'It may have been deleted. Return to the Control Room and choose another event.' }} />
      </div>
    );
  }

  const currentExecution = liveCue ? runtime.executions[liveCue.id] : null;

  return (
    <div className={`page control-page${sessionActive ? ' is-active' : ''}`}>
      <div style={{ marginBottom: 13 }}>
        <Link to="/control" className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
          <ArrowLeft size={12} /> Control Room
        </Link>
      </div>

      <PageHeader
        eyebrow={sessionActive ? (rehearsal ? 'Rehearsal · no integration transmission' : 'Live production · deliberate execution') : 'Session preparation'}
        title={event.title}
        description={`${formatEventWhen(event.eventDate, event.startTime)}${event.venue ? ` · ${event.venue}` : ''} · ${cues.length} cues`}
        actions={
          <>
            <Button as={Link} to={`/events/${event.id}`} variant="ghost">Event workspace</Button>
            <Button as={Link} to="/screens" variant="secondary"><MonitorPlay size={14} /> ScreenPilot</Button>
            {sessionActive ? (
              <Button variant="danger" onClick={endSession} loading={busy === 'end'}>{rehearsal ? 'End rehearsal' : 'End live session'}</Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
          <StatusBadge status={event.status} meta={EVENT_STATUS_META} />
          {sessionActive ? <Badge tone="cyan" dot>{rehearsal ? 'Rehearsal isolation active' : 'Live controls armed'}</Badge> : <Badge tone="neutral">Standby — nothing is executing</Badge>}
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>
            {connectedScreens}/{totalScreens} RECEIVERS CONNECTED
          </span>
        </div>
      </PageHeader>

      {sessionSummary ? (
        <Panel style={{ padding: '14px 17px', marginBottom: 16, borderColor: sessionSummary.interrupted ? 'rgba(251,191,36,.28)' : 'rgba(74,222,128,.2)' }}>
          <div className="flex wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow" style={{ color: sessionSummary.interrupted ? 'var(--warning)' : 'var(--positive)' }}>
                {sessionSummary.interrupted ? 'Session interrupted' : 'Session ended'}
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)' }}>
                {sessionSummary.completed} of {sessionSummary.total} cues completed{sessionSummary.skipped ? ` · ${sessionSummary.skipped} skipped` : ''}.
                {' '}Screens and integrations were not changed automatically.
              </div>
            </div>
            <Button as={Link} to={`/history?event=${event.id}`} size="sm" variant="ghost">Review history</Button>
          </div>
        </Panel>
      ) : null}

      {!sessionActive ? (
        <div className="control-grid">
          <div>
            <Panel style={{ padding: 20 }}>
              <div className="flex wrap items-start justify-between gap-4">
                <div>
                  <div className="eyebrow">Session preflight</div>
                  <h2 style={{ marginTop: 6, fontSize: 21, lineHeight: '27px', letterSpacing: '-.025em', fontWeight: 560 }}>
                    {event.status === 'completed' || event.status === 'interrupted' ? 'Ready to reopen this event' : 'Ready the room, then choose a mode'}
                  </h2>
                  <p className="text-muted" style={{ marginTop: 7, maxWidth: '66ch', fontSize: 12.5, lineHeight: '19px' }}>
                    Rehearsal is isolated: GO moves cues and updates screens, but never sends Resolume commands.
                    Going live unlocks mapped OSC sends. Starting either mode does not start a cue or send a command.
                  </p>
                </div>
                <div style={{ width: 62, height: 62, flex: 'none', borderRadius: 12, border: '1px solid var(--line-strong)', display: 'grid', placeItems: 'center', background: 'rgba(45,212,230,.035)', color: 'var(--accent)' }}>
                  <Radio size={26} />
                </div>
              </div>

              <div className="flex wrap gap-2" style={{ marginTop: 20 }}>
                <Button variant="secondary" onClick={() => startSession('rehearsal')} loading={busy === 'rehearsal'} disabled={!cues.length}>
                  <Play size={14} /> Start rehearsal
                </Button>
                <Button variant="danger" onClick={() => startSession('live')} loading={busy === 'live'} disabled={!cues.length}>
                  <Radio size={14} /> Go live
                </Button>
                {!cues.length ? <span className="input-hint" style={{ alignSelf: 'center' }}>Add at least one cue in the event workspace first.</span> : null}
              </div>

              <div className="hairline" style={{ margin: '18px 0' }} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={event.archived ? 'red' : 'neutral'}>{event.archived ? 'Archived' : 'Local show file'}</Badge>
                <Badge tone={integration?.config?.enabled ? (integration.config.mode === 'mock' ? 'cyan' : 'green') : 'neutral'} dot>
                  {integration?.config?.enabled ? (integration.config.mode === 'mock' ? 'Simulation only' : 'OSC enabled') : 'Integration disabled'}
                </Badge>
                <Badge tone={screenStatus?.running ? 'green' : 'neutral'} dot>{screenStatus?.running ? `Receivers on :${screenStatus.port}` : 'Receiver server stopped'}</Badge>
              </div>
            </Panel>

            <div style={{ marginTop: 15 }}>
              <CueList event={event} runtime={runtime} active={false} onArm={() => {}} busy />
            </div>

            <div className="control-safety-note">
              <ShieldAlert size={15} />
              <p>
                Before going live, walk the room. Confirm the projector input, playback sources, audio routing and
                that every missing media file has been relinked. ShowFlow can track readiness, but cannot see the room.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 13, alignContent: 'start' }}>
            <ReadinessPanel event={event} />
            <Panel style={{ padding: 16 }}>
              <div className="flex items-center gap-2">
                <Cable size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 550 }}>Integration</span>
                <Badge tone={integration?.config?.enabled ? (integration.config.mode === 'mock' ? 'cyan' : 'green') : 'neutral'} style={{ marginLeft: 'auto' }}>
                  {integration?.config?.mode === 'mock' ? 'Mock' : 'OSC'}
                </Badge>
              </div>
              <p className="text-faint" style={{ marginTop: 8, fontSize: 11, lineHeight: '17px' }}>
                {integration?.config?.enabled
                  ? integration.config.mode === 'mock'
                    ? 'Mock mode simulates mapped actions locally. Nothing is sent over the network.'
                    : `Resolume target ${integration.config.host}:${integration.config.port}. UDP is one-way; sends are recorded unverified.`
                  : 'Integration is disabled. GO will still run cues, but mapped Resolume actions will not be transmitted.'}
              </p>
              <Button as={Link} to="/settings?tab=integrations" size="sm" variant="ghost" style={{ marginTop: 8, paddingLeft: 0 }}>
                Integration settings <ChevronRight size={12} />
              </Button>
            </Panel>
            <Panel style={{ padding: 16 }}>
              <div className="flex items-center gap-2">
                <MonitorPlay size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 550 }}>ScreenPilot</span>
                <Badge tone={screenStatus?.running ? 'green' : 'neutral'} dot style={{ marginLeft: 'auto' }}>{screenStatus?.running ? 'Listening' : 'Stopped'}</Badge>
              </div>
              <p className="text-faint" style={{ marginTop: 8, fontSize: 11, lineHeight: '17px' }}>
                {screenStatus?.running
                  ? `${connectedScreens} of ${totalScreens} enabled displays are connected. Receiver acknowledgements confirm browser delivery only.`
                  : 'The LAN receiver server is stopped. GO will still execute locally; no screen content will be sent.'}
              </p>
              <Button as={Link} to="/screens" size="sm" variant="ghost" style={{ marginTop: 8, paddingLeft: 0 }}>
                Manage receivers <ChevronRight size={12} />
              </Button>
            </Panel>
          </div>
        </div>
      ) : (
        <>
          <div className={`session-mode-bar${rehearsal ? ' rehearsal' : ' live'}`}>
            <div className="flex items-center gap-3">
              <span className="session-mode-pulse" />
              <div>
                <div className="eyebrow" style={{ color: rehearsal ? 'var(--warning)' : 'var(--danger)' }}>
                  {rehearsal ? 'Rehearsal in progress — no integration transmission' : 'Live in progress — commands are deliberate'}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--fg-muted)' }}>
                  {rehearsal ? 'GO simulates mapped actions and updates receivers with a rehearsal stamp.' : 'Mapped cue actions transmit only on GO. No command is ever replayed.'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                {formatClock(timer?.elapsedSeconds || 0, { forceHours: false })} ON CUE
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                {progress}% COMPLETE
              </div>
            </div>
          </div>

          <div className="control-grid">
            <div>
              <Panel className={`cue-hero${liveCue ? ' is-live' : ''}`}>
                <div className="cue-hero-top">
                  <div className="flex items-center gap-2">
                    <Badge tone={rehearsal ? 'amber' : 'red'} dot live={Boolean(liveCue)}>
                      {liveCue ? (rehearsal ? 'Rehearsal cue live' : 'Cue live') : 'Standby'}
                    </Badge>
                    {liveCue ? <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>STARTED {formatTimeOfDay(new Date(runtime.cueStartedAt || now).toISOString())}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {liveCue ? <Badge tone={CUE_STATUS_META[runtime.statuses[liveCue.id]]?.tone || 'neutral'}>{CUE_STATUS_META[runtime.statuses[liveCue.id]]?.label || 'Ready'}</Badge> : null}
                    {liveCue?.durationSeconds ? (
                      <span className={`mono cue-timer${timer?.overdue ? ' overdue' : ''}`}>
                        {timer?.overdue ? '+' : ''}{formatClock(Math.abs(timer?.remainingSeconds ?? liveCue.durationSeconds))}
                      </span>
                    ) : (
                      <span className="mono cue-timer">{formatClock(timer?.elapsedSeconds || 0)}</span>
                    )}
                  </div>
                </div>

                {liveCue ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4" style={{ marginTop: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="flex items-center gap-2">
                          <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>CUE {String(cues.findIndex((cue) => cue.id === liveCue.id) + 1).padStart(2, '0')}</span>
                          <span className="eyebrow">{CUE_TYPE_MAP[liveCue.type]?.label}</span>
                          {liveCue.operatorName ? <span className="text-faint" style={{ fontSize: 10.5 }}>· {liveCue.operatorName}</span> : null}
                        </div>
                        <h2 style={{ marginTop: 6, fontSize: 27, lineHeight: '33px', letterSpacing: '-.03em', fontWeight: 560 }}>{liveCue.title}</h2>
                        {liveCue.asset ? (
                          <div className="flex items-center gap-2" style={{ marginTop: 7, fontSize: 11.5, color: liveCue.asset.available ? 'var(--fg-muted)' : 'var(--warning)' }}>
                            {liveCue.asset.available ? <MonitorPlay size={13} /> : <TriangleAlert size={13} />}
                            <span>{liveCue.asset.name}</span>
                            <span className="text-faint">· {liveCue.asset.kind}</span>
                            {liveCue.asset.available ? null : <Badge tone="amber">File missing</Badge>}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={complete} loading={busy === 'complete'}>
                          <Check size={13} /> Mark complete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={skip} loading={busy === 'skip'}>
                          <Ban size={13} /> Skip
                        </Button>
                      </div>
                    </div>

                    {liveCue.notes ? (
                      <div className="cue-note" style={{ marginTop: 15 }}>
                        <span className="eyebrow">Cue note</span>
                        <p>{liveCue.notes}</p>
                      </div>
                    ) : null}
                    {liveCue.fallback ? (
                      <div className="cue-fallback" style={{ marginTop: 9 }}>
                        <OctagonAlert size={13} />
                        <div>
                          <span className="eyebrow" style={{ color: 'var(--warning)' }}>Fallback if this cue fails</span>
                          <p>{liveCue.fallback}</p>
                        </div>
                      </div>
                    ) : null}

                    {currentExecution || lastExecution ? (
                      <div className="cue-execution" style={{ marginTop: 15 }}>
                        <div className="flex items-center gap-2">
                          <span className="eyebrow">Execution state</span>
                          {lastExecution ? <Badge tone={EXECUTION_STATE_META[lastExecution.status]?.tone || 'neutral'} dot>{lastExecution.simulated ? 'Simulated · ' : ''}{EXECUTION_STATE_META[lastExecution.status]?.label || lastExecution.status}</Badge> : null}
                        </div>
                        {lastExecution ? (
                          <>
                            <p style={{ marginTop: 5, fontSize: 11.5, lineHeight: '17px', color: 'var(--fg-muted)' }}>{lastExecution.detail}</p>
                            {lastExecution.path ? <div className="mono" style={{ marginTop: 3, fontSize: 9, color: 'var(--fg-faint)' }}>{lastExecution.path}</div> : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="cue-standby">
                    <div className="cue-standby-mark"><Play size={22} /></div>
                    <div>
                      <h2>No cue is live.</h2>
                      <p>
                        {armedCue
                          ? `Cue ${String(cues.findIndex((cue) => cue.id === armedCue.id) + 1).padStart(2, '0')} “${armedCue.title}” is armed. Press GO when the moment arrives.`
                          : 'Arm a cue from the running order, then press GO.'}
                      </p>
                    </div>
                  </div>
                )}
              </Panel>

              <div className="next-strip">
                <div className="next-strip-label">
                  <span className="eyebrow">Next</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--fg-faint)' }}>ARMED</span>
                </div>
                {armedCue ? (
                  <>
                    <span className="mono next-number">{String(cues.findIndex((cue) => cue.id === armedCue.id) + 1).padStart(2, '0')}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 560, letterSpacing: '-.015em' }} className="truncate">{armedCue.title}</div>
                      <div className="text-faint" style={{ marginTop: 2, fontSize: 10.5 }}>
                        {CUE_TYPE_MAP[armedCue.type]?.label}{armedCue.durationSeconds ? ` · ${formatDurationWords(armedCue.durationSeconds)}` : ''}{armedCue.operatorName ? ` · ${armedCue.operatorName}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => arm(previousCue(cues, armedCue.id)?.id || armedCue.id)} disabled={!previousCue(cues, armedCue.id) || busy}>
                        <ChevronLeft size={13} /> Prev
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => arm(nextAfterArmed?.id || armedCue.id)} disabled={!nextAfterArmed || busy}>
                        Arm next <ChevronRight size={13} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <span className="text-faint" style={{ fontSize: 11.5 }}>No cue armed. Select one below.</span>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <CueList event={event} runtime={runtime} active onArm={arm} busy={Boolean(busy)} />
              </div>
            </div>

            <div className="go-column">
              <Panel className="go-console">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">Transport</span>
                  <span className="flex items-center gap-1 mono" style={{ fontSize: 8.5, color: 'var(--fg-faint)' }}><span className="kbd">Ctrl</span> <span className="kbd">↵</span></span>
                </div>

                <div className="go-target">
                  <span className="eyebrow">GO {rehearsal ? '· rehearsal' : ''}</span>
                  {armedCue ? (
                    <>
                      <div className="go-target-number mono">{String(cues.findIndex((cue) => cue.id === armedCue.id) + 1).padStart(2, '0')}</div>
                      <div className="go-target-title">{armedCue.title}</div>
                      <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{CUE_TYPE_MAP[armedCue.type]?.label} {armedCue.durationSeconds ? `· ${formatDurationWords(armedCue.durationSeconds)}` : ''}</div>
                    </>
                  ) : (
                    <div className="go-target-title" style={{ color: 'var(--fg-faint)' }}>No cue armed</div>
                  )}
                </div>

                <button
                  type="button"
                  className={`go-button${rehearsal ? ' rehearsal' : ''}`}
                  onClick={go}
                  disabled={!armedCue || Boolean(busy)}
                >
                  {busy === 'go' ? <span className="spinner" style={{ borderTopColor: '#031013' }} /> : <Play size={22} fill="currentColor" />}
                  <span>GO</span>
                  <span className="go-button-hint">Invoke armed cue</span>
                </button>

                <div className="flex gap-2" style={{ marginTop: 9 }}>
                  <Button size="sm" variant="secondary" className="grow" onClick={() => arm(nextAfterArmed?.id || armedCue?.id)} disabled={!nextAfterArmed || Boolean(busy)}>
                    <ChevronsRight size={13} /> Arm next
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => arm(previousCue(cues, armedCue?.id)?.id || armedCue?.id)} disabled={!armedCue || !previousCue(cues, armedCue.id) || Boolean(busy)}>
                    <ChevronLeft size={13} />
                  </Button>
                  {rehearsal ? (
                    <Button size="sm" variant="ghost" onClick={resetRehearsal} disabled={Boolean(busy)} title="Reset rehearsal marks">
                      <RotateCcw size={13} />
                    </Button>
                  ) : null}
                </div>

                <div className="go-meta">
                  <div className="flex items-center justify-between gap-2">
                    <span className="eyebrow">Integration</span>
                    <Badge tone={integration?.config?.enabled ? (integration.config.mode === 'mock' ? 'cyan' : 'green') : 'neutral'} dot>
                      {integration?.config?.enabled ? (integration.config.mode === 'mock' ? 'Mock · simulated' : 'OSC · unverified') : 'Off'}
                    </Badge>
                  </div>
                  {rehearsal ? (
                    <p className="go-meta-note">Rehearsal isolation is active. No OSC datagram will be transmitted.</p>
                  ) : integration?.config?.enabled ? (
                    <p className="go-meta-note">
                      {integration.config.mode === 'mock'
                        ? 'Mock actions report simulated completion only. They never touch production equipment.'
                        : `UDP target ${integration.config.host}:${integration.config.port}. A successful send is unverified; Resolume does not acknowledge these messages.`}
                    </p>
                  ) : (
                    <p className="go-meta-note">Integration is disabled. Mapped cues will run visually but send no OSC.</p>
                  )}
                </div>

                <div className="go-meta">
                  <div className="flex items-center justify-between gap-2">
                    <span className="eyebrow">Screens</span>
                    <Badge tone={connectedScreens ? 'green' : 'neutral'} dot>{connectedScreens}/{totalScreens} connected</Badge>
                  </div>
                  <p className="go-meta-note">
                    {screenSync?.message || (screenStatus?.running ? 'Receiver content updates on GO. Acknowledgements confirm browser delivery only.' : 'Receiver server is stopped. No screen content will be sent.')}
                  </p>
                  {screenSync?.tone === 'warning' ? <Badge tone="warning">Verify visually</Badge> : null}
                </div>

                <Button variant="danger" className="btn-block" onClick={() => setEmergencyOpen(true)} style={{ marginTop: 13 }}>
                  <OctagonAlert size={14} /> Emergency fallback
                </Button>
                <p className="go-disclaimer">
                  ShowFlow cannot stop projectors, media players or Resolume. Follow the venue’s emergency procedure.
                </p>
              </Panel>

              <Panel style={{ padding: 14, marginTop: 12 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span className="eyebrow">Session progress</span>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>{progress}%</span>
                </div>
                <ProgressBar value={progress} tone={progress === 100 ? 'positive' : 'accent'} height={3} label="Session progress" />
                <div className="flex items-center justify-between" style={{ marginTop: 10, fontSize: 10.5, color: 'var(--fg-faint)' }}>
                  <span>{cues.filter((cue) => runtime.statuses[cue.id] === 'completed').length} complete</span>
                  <span>{cues.filter((cue) => runtime.statuses[cue.id] === 'skipped').length} skipped</span>
                  <span>{cues.length} total</span>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      <div className="control-foot">
        <span className="flex items-center gap-2"><Clock size={11} /> Local time {formatTimeOfDay(new Date(now).toISOString())}</span>
        <span>No automatic replay · No startup execution · Receiver receipts are not projector confirmation</span>
        <span className="flex items-center gap-2"><Power size={11} /> {event.status.toUpperCase()}</span>
      </div>

      <Modal
        open={emergencyOpen}
        onClose={() => !busy && setEmergencyOpen(false)}
        title="Emergency fallback"
        eyebrow="Live production"
        description="These actions are immediate and do not depend on the cue sequence. Use the venue’s emergency procedure first."
        size="md"
        preventClose={Boolean(busy)}
      >
        <div className="form-grid">
          <div className="panel-inset" style={{ padding: 13, borderColor: 'rgba(251,113,133,.25)' }}>
            <div className="flex items-start gap-2">
              <TriangleAlert size={15} style={{ color: 'var(--danger)', flex: 'none', marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 550 }}>This is not an emergency stop for production equipment.</div>
                <p className="text-faint" style={{ marginTop: 3, fontSize: 11, lineHeight: '17px' }}>
                  ShowFlow can black out connected ScreenPilot browsers and mark this session interrupted. It cannot
                  silence audio, stop a media player, cut stage power or black out a projector directly.
                </p>
              </div>
            </div>
          </div>

          {(liveCue || armedCue)?.fallback ? (
            <div className="cue-fallback">
              <OctagonAlert size={13} />
              <div>
                <span className="eyebrow" style={{ color: 'var(--warning)' }}>Fallback for {(liveCue || armedCue).title}</span>
                <p>{(liveCue || armedCue).fallback}</p>
              </div>
            </div>
          ) : null}

          <Button variant="danger" onClick={blackout} loading={busy === 'blackout'} className="btn-block">
            <MonitorPlay size={14} /> Black out connected receivers
          </Button>
          <Button variant="secondary" onClick={interruptSession} loading={busy === 'interrupt'} className="btn-block">
            <OctagonAlert size={14} /> Mark session interrupted
          </Button>
          <div className="flex justify-between items-center gap-2">
            <p className="input-hint" style={{ maxWidth: '42ch' }}>Interrupting does not stop equipment or replay commands. It only ends ShowFlow’s live state.</p>
            <Button variant="ghost" onClick={() => setEmergencyOpen(false)} disabled={Boolean(busy)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
