import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Cable,
  CircleDot,
  Clock,
  FolderOpen,
  History as HistoryIcon,
  MonitorPlay,
  Plus,
  Radio,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import { EVENT_STATUS_META } from '@shared/enums.js';
import { formatEventWhen, formatRelativeTime, todayIso } from '@shared/format.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
} from '../components/ui.jsx';

const ACTIVITY_ICONS = {
  event: CalendarClock,
  cue: Radio,
  media: FolderOpen,
  display: MonitorPlay,
  integration: Cable,
  crew: Users,
  backup: HistoryIcon,
  system: CircleDot,
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function dateLine() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function readinessTone(percentage) {
  if (percentage >= 100) return 'positive';
  if (percentage >= 60) return 'warning';
  return 'danger';
}

export default function Dashboard() {
  const { settings } = useApp();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoader(async () => {
    const [summary, live] = await Promise.all([
      api('dashboard.summary'),
      api('events.list', { status: 'live', limit: 5 }),
    ]);
    return { summary, live };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <PageHeader eyebrow="Overview" title="Loading control desk" description="Reading the local ShowFlow database." />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Overview" title="Dashboard" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const summary = data.summary;
  const live = data.live?.[0] || null;
  const counts = summary.counts;
  const readiness = summary.readiness;
  const setupPercentage = readiness?.setupTotal
    ? Math.round((readiness.setupDone / readiness.setupTotal) * 100)
    : 0;
  const firstName = (settings?.operatorName || 'Operator').split(' ')[0];

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Control desk · ${dateLine()}`}
        title={`${greeting()}, ${firstName}.`}
        description="One local workspace for the running order, every screen, media readiness and the crew on the floor."
        actions={
          <>
            <Button as={Link} to="/events" variant="secondary">
              <Plus size={14} /> New event
            </Button>
            <Button as={Link} to={live ? `/control/${live.id}` : '/control'} variant="primary">
              <Radio size={14} /> {live ? 'Return to live show' : 'Open Control Room'}
            </Button>
          </>
        }
      />

      {live ? (
        <Panel className="crosshair" style={{ padding: '19px 22px', borderColor: 'rgba(251,113,133,.28)', background: 'linear-gradient(90deg, rgba(251,113,133,.055), rgba(9,11,14,.8) 55%)' }}>
          <div className="flex wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid rgba(251,113,133,.3)', background: 'rgba(251,113,133,.08)', display: 'grid', placeItems: 'center', color: 'var(--danger)' }}>
                <Radio size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="red" dot live>Live now</Badge>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{formatEventWhen(live.eventDate, live.startTime)}</span>
                </div>
                <div style={{ marginTop: 5, fontSize: 17, fontWeight: 580, letterSpacing: '-.02em' }}>{live.title}</div>
                <div className="text-faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {live.venue || 'No venue set'} · {live.stats.cueCount} cues
                </div>
              </div>
            </div>
            <Button as={Link} to={`/control/${live.id}`} variant="danger">
              Open live control <ArrowRight size={14} />
            </Button>
          </div>
        </Panel>
      ) : (
        <Panel className="crosshair" style={{ padding: '19px 22px' }}>
          <div className="flex wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid var(--line-strong)', display: 'grid', placeItems: 'center', color: 'var(--accent)', background: 'rgba(45,212,230,.04)' }}>
                <Radio size={18} />
              </div>
              <div>
                <div className="eyebrow">Operational state</div>
                <div style={{ marginTop: 4, fontSize: 15, fontWeight: 560 }}>Standby — no show is live</div>
                <div className="text-faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                  Nothing is being executed automatically. Choose an event when you are ready to rehearse or go live.
                </div>
              </div>
            </div>
            <Button as={Link} to="/control" variant="soft">
              Prepare a session <ArrowRight size={14} />
            </Button>
          </div>
        </Panel>
      )}

      <div className="stat-grid" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="eyebrow">Upcoming</div>
          <div className="stat-value">{counts.upcomingEvents}<small> events</small></div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{counts.activeEvents} active in workspace</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Media readiness</div>
          <div className="stat-value" style={{ color: counts.missingMedia ? 'var(--warning)' : undefined }}>
            {counts.media - counts.missingMedia}<small> / {counts.media}</small>
          </div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>
            {counts.missingMedia ? `${counts.missingMedia} file${counts.missingMedia === 1 ? '' : 's'} missing` : 'All indexed files available'}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">ScreenPilot</div>
          <div className="stat-value">{summary.displays.connected}<small> / {summary.displays.total}</small></div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>
            {summary.receiver.running ? `Receiver server on :${summary.receiver.port}` : 'Server stopped'}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Active crew</div>
          <div className="stat-value">{counts.crew}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{counts.archivedEvents} archived event{counts.archivedEvents === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="grid-sidebar grid-2" style={{ marginTop: 24 }}>
        <div>
          <SectionHeading
            eyebrow="Schedule"
            title="Next on the running order"
            actions={<Button as={Link} to="/events" variant="ghost" size="sm">All events <ArrowRight size={13} /></Button>}
          />
          <Panel style={{ overflow: 'hidden' }}>
            {summary.upcoming.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Cues</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {summary.upcoming.map((event) => (
                      <tr key={event.id} className="row-click" onClick={() => navigate(`/events/${event.id}`)}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg)' }}>{formatEventWhen(event.eventDate, event.startTime)}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 540 }}>{event.title}</div>
                          <div style={{ marginTop: 1, fontSize: 10.5, color: 'var(--fg-faint)' }}>{event.venue || 'Venue not set'}</div>
                        </td>
                        <td><StatusBadge status={event.status} meta={EVENT_STATUS_META} /></td>
                        <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>{event.stats.cueCount}</td>
                        <td style={{ width: 30, textAlign: 'right' }}><ArrowRight size={13} className="text-faint" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<CalendarClock size={19} />}
                title="No upcoming events"
                description="Create an event to define a running order, assign crew and prepare screens."
                action={<Button as={Link} to="/events" size="sm" variant="soft"><Plus size={13} /> Create the first event</Button>}
              />
            )}
          </Panel>

          <div className="page-section">
            <SectionHeading
              eyebrow="Show preparation"
              title="Readiness for the next show"
              actions={readiness ? <Button as={Link} to={`/events/${readiness.eventId}`} variant="ghost" size="sm">Open event <ArrowRight size={13} /></Button> : null}
            />
            <Panel style={{ padding: 18 }}>
              {readiness ? (
                <>
                  <div className="flex wrap items-start justify-between gap-3">
                    <div>
                      <div className="eyebrow">Next event</div>
                      <div style={{ marginTop: 5, fontSize: 15, fontWeight: 560 }}>{readiness.eventTitle}</div>
                      <div className="text-faint" style={{ marginTop: 2, fontSize: 11.5 }}>
                        {formatEventWhen(readiness.eventDate, readiness.startTime)} · {readiness.cueCount} cue{readiness.cueCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    {readiness.missingAssets ? (
                      <Badge tone="amber" dot>{readiness.missingAssets} missing asset{readiness.missingAssets === 1 ? '' : 's'}</Badge>
                    ) : (
                      <Badge tone="green" dot>Media available</Badge>
                    )}
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span className="eyebrow">Setup checklist</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
                        {readiness.setupDone} / {readiness.setupTotal || 0}
                      </span>
                    </div>
                    <ProgressBar value={setupPercentage} tone={readinessTone(setupPercentage)} label="Setup checklist progress" />
                  </div>

                  <div className="flex wrap gap-2" style={{ marginTop: 16 }}>
                    <Button as={Link} to={`/control/${readiness.eventId}`} size="sm" variant="soft">
                      <Radio size={13} /> Prepare control room
                    </Button>
                    <Button as={Link} to={`/events/${readiness.eventId}`} size="sm" variant="ghost">
                      Review running order
                    </Button>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<Clock size={18} />}
                  title="Nothing scheduled yet"
                  description="The readiness panel will appear when an event is on the calendar."
                  action={<Button as={Link} to="/events" size="sm" variant="ghost">Plan an event</Button>}
                />
              )}
            </Panel>
          </div>
        </div>

        <div>
          <SectionHeading
            eyebrow="System"
            title="Integration & signs"
          />
          <Panel style={{ padding: 16 }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 33, height: 33, flex: 'none', display: 'grid', placeItems: 'center', border: '1px solid var(--line-strong)', borderRadius: 8, color: summary.integration.enabled ? 'var(--accent)' : 'var(--fg-faint)', background: 'rgba(255,255,255,.018)' }}>
                <Cable size={16} />
              </div>
              <div className="grow">
                <div style={{ fontSize: 12.5, fontWeight: 550 }}>
                  {summary.integration.mode === 'mock' ? 'Mock integration' : 'Resolume OSC'}
                </div>
                <div style={{ marginTop: 1, fontSize: 10.5, color: 'var(--fg-faint)' }}>
                  {summary.integration.enabled
                    ? summary.integration.mode === 'mock'
                      ? 'Simulation only · no network traffic'
                      : `${summary.integration.host}:${summary.integration.port} · one-way UDP`
                    : 'Disabled · no commands will be sent'}
                </div>
              </div>
              <Badge tone={summary.integration.enabled ? (summary.integration.mode === 'mock' ? 'cyan' : 'green') : 'neutral'} dot>
                {summary.integration.enabled ? (summary.integration.mode === 'mock' ? 'Simulated' : 'Ready') : 'Off'}
              </Badge>
            </div>
            <div className="hairline" style={{ margin: '13px 0' }} />
            <div className="flex items-center justify-between gap-3">
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 550 }}>LAN receivers</div>
                <div style={{ marginTop: 1, fontSize: 10.5, color: 'var(--fg-faint)' }}>
                  {summary.receiver.running ? `Listening on port ${summary.receiver.port}` : 'Receiver server is stopped'}
                </div>
              </div>
              <Badge tone={summary.receiver.running ? 'green' : 'neutral'} dot>{summary.receiver.running ? 'On' : 'Off'}</Badge>
            </div>
            <div className="flex gap-2" style={{ marginTop: 14 }}>
              <Button as={Link} to="/screens" size="sm" variant="secondary" className="grow"><MonitorPlay size={13} /> ScreenPilot</Button>
              <Button as={Link} to="/settings" size="sm" variant="ghost">Configure</Button>
            </div>
          </Panel>

          <div className="page-section">
            <SectionHeading
              eyebrow="Audit"
              title="Recent activity"
              actions={<Button as={Link} to="/history" variant="ghost" size="sm">History <ArrowRight size={13} /></Button>}
            />
            <Panel style={{ padding: '6px 0' }}>
              {summary.activity.length ? (
                summary.activity.map((entry) => {
                  const Icon = ACTIVITY_ICONS[entry.kind] || CircleDot;
                  return (
                    <div key={entry.id} style={{ display: 'flex', gap: 10, padding: '10px 15px', borderBottom: '1px solid var(--line-soft)' }}>
                      <Icon size={13} style={{ flex: 'none', marginTop: 3, color: entry.kind === 'integration' ? 'var(--accent)' : 'var(--fg-faint)' }} />
                      <div className="grow">
                        <div style={{ fontSize: 11.5, lineHeight: '17px', color: 'var(--fg-muted)' }}>{entry.message}</div>
                        <div className="mono" style={{ marginTop: 2, fontSize: 8.5, color: '#515c69', letterSpacing: '.04em' }}>
                          {formatRelativeTime(entry.createdAt).toUpperCase()} · {entry.actor}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState icon={<HistoryIcon size={17} />} title="No activity yet" description="ShowFlow will record events, cue execution, media checks and settings changes here." />
              )}
            </Panel>
            {counts.missingMedia > 0 ? (
              <div className="flex items-start gap-2" style={{ marginTop: 12, padding: '10px 12px', border: '1px solid rgba(251,191,36,.22)', borderRadius: 7, background: 'rgba(251,191,36,.04)', color: 'var(--warning)', fontSize: 11 }}>
                <TriangleAlert size={14} style={{ flex: 'none', marginTop: 1 }} />
                <span className="text-muted">
                  {counts.missingMedia} media file{counts.missingMedia === 1 ? ' is' : 's are'} missing.{' '}
                  <Link to="/media" style={{ color: 'var(--warning)' }}>Review MediaVault</Link>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', fontSize: 10.5, color: '#59636f' }}>
        <span className="mono">DATABASE INTEGRITY · LOCAL · {todayIso()}</span>
        <span>Last refreshed {formatRelativeTime(summary.generatedAt)}</span>
      </div>
    </div>
  );
}
