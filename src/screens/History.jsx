import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Cable,
  ChevronDown,
  CircleDot,
  Download,
  FolderOpen,
  History as HistoryIcon,
  MonitorPlay,
  NotebookPen,
  Radio,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import { formatFullDate, formatIsoDate, formatTimeOfDay, todayIso } from '@shared/format.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  Select,
  TextInput,
  Textarea,
  cx,
} from '../components/ui.jsx';

const PAGE_SIZE = 50;

const KIND_META = {
  event: { label: 'Events', singular: 'Event', icon: CalendarClock, tone: 'cyan' },
  cue: { label: 'Cues', singular: 'Cue', icon: Radio, tone: 'red' },
  media: { label: 'Media', singular: 'Media', icon: FolderOpen, tone: 'violet' },
  display: { label: 'Displays', singular: 'Display', icon: MonitorPlay, tone: 'green' },
  integration: { label: 'Integrations', singular: 'Integration', icon: Cable, tone: 'amber' },
  crew: { label: 'Crew', singular: 'Crew', icon: Users, tone: 'cyan' },
  backup: { label: 'Backups', singular: 'Backup', icon: HistoryIcon, tone: 'neutral' },
  system: { label: 'System', singular: 'System', icon: CircleDot, tone: 'neutral' },
};

const KIND_OPTIONS = Object.entries(KIND_META).map(([value, meta]) => ({ value, label: meta.label }));

const MODE_META = {
  live: { label: 'Live', tone: 'red' },
  rehearsal: { label: 'Rehearsal', tone: 'amber' },
  system: { label: 'System', tone: 'neutral' },
};

function dayLabel(iso) {
  const day = formatIsoDate(iso);
  if (!day) return 'Unknown date';
  const today = todayIso();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === today) return 'Today';
  if (day === todayIso(yesterday)) return 'Yesterday';
  return formatFullDate(day);
}

function formatDetailValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function groupEntries(items) {
  const groups = [];
  for (const entry of items) {
    const label = dayLabel(entry.createdAt);
    const current = groups[groups.length - 1];
    if (current && current.label === label) current.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

export default function History() {
  const { toast } = useApp();
  const [eventId, setEventId] = useState('');
  const [kind, setKind] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteEventId, setNoteEventId] = useState('');
  const [noteError, setNoteError] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 240);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, error, loading, reload } = useLoader(async () => {
    const [activity, events] = await Promise.all([
      api('activity.list', {
        eventId: eventId || undefined,
        kind: kind || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      api('events.list', { includeArchived: true, limit: 1000 }),
    ]);
    return { activity, events };
  }, [eventId, kind, search, page]);

  const activity = data?.activity;
  const events = data?.events || [];
  const items = useMemo(() => activity?.items || [], [activity?.items]);
  const groups = useMemo(() => groupEntries(items), [items]);
  const filtered = Boolean(eventId || kind || search);
  const totalPages = Math.max(1, Math.ceil((activity?.total || 0) / PAGE_SIZE));
  const modeCounts = useMemo(
    () => items.reduce(
      (counts, entry) => {
        if (entry.mode === 'live' || entry.mode === 'rehearsal') counts[entry.mode] += 1;
        return counts;
      },
      { live: 0, rehearsal: 0 },
    ),
    [items],
  );

  function clearFilters() {
    setEventId('');
    setKind('');
    setSearchInput('');
    setSearch('');
    setPage(0);
  }

  function openNote() {
    setNoteText('');
    setNoteEventId(eventId || '');
    setNoteError('');
    setNoteOpen(true);
  }

  async function saveNote() {
    if (!noteText.trim()) {
      setNoteError('Write a note before recording it.');
      return;
    }
    setSavingNote(true);
    setNoteError('');
    try {
      await api('activity.log', {
        eventId: noteEventId || null,
        kind: 'system',
        message: noteText.trim(),
      });
      setNoteOpen(false);
      toast.success('Note recorded', 'The note is stored in the local history.');
      await reload({ quiet: true });
    } catch (caught) {
      setNoteError(friendlyError(caught, 'The note could not be recorded.'));
    } finally {
      setSavingNote(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Audit trail" title="History" description="Reading the local activity log." />
        <LoadingBlock rows={6} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Audit trail" title="History unavailable" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Audit trail"
        title="History"
        description="A local, append-only record of events, cue calls, media checks, displays, integrations, crew and backups. ShowFlow does not retry or replay anything listed here."
        actions={
          <>
            <Button variant="ghost" onClick={() => reload({ quiet: true })} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </Button>
            <Button variant="secondary" onClick={openNote}><NotebookPen size={14} /> Record note</Button>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="eyebrow">Log entries</div>
          <div className="stat-value">{activity?.total ?? 0}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{filtered ? 'matching the current filters' : 'retained locally'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Live entries on page</div>
          <div className="stat-value" style={{ color: modeCounts.live ? 'var(--danger)' : undefined }}>{modeCounts.live}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>recorded while a show was live</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Rehearsal entries on page</div>
          <div className="stat-value" style={{ color: modeCounts.rehearsal ? 'var(--warning)' : undefined }}>{modeCounts.rehearsal}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>simulated, never transmitted</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Showing</div>
          <div className="stat-value">{items.length}<small> / {activity?.total ?? 0}</small></div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>page {page + 1} of {totalPages}</div>
        </div>
      </div>

      <Panel style={{ marginTop: 16, padding: 13 }}>
        <div className="history-toolbar">
          <div className="history-search">
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--fg-faint)' }} />
            <TextInput
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search messages or operators"
              style={{ paddingLeft: 31 }}
              aria-label="Search history"
            />
          </div>
          <Select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(0);
            }}
            aria-label="Filter by activity kind"
            style={{ width: 170 }}
          >
            <option value="">All categories</option>
            {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select
            value={eventId}
            onChange={(event) => {
              setEventId(event.target.value);
              setPage(0);
            }}
            aria-label="Filter by event"
            style={{ width: 230 }}
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.title}{event.archived ? ' (archived)' : ''}</option>
            ))}
          </Select>
          {filtered ? (
            <button type="button" className="history-clear" onClick={clearFilters}><X size={12} /> Clear</button>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2" style={{ marginTop: 9 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--fg-faint)', letterSpacing: '.06em' }}>
            NEWEST FIRST · {PAGE_SIZE} PER PAGE
          </span>
          <span className="text-faint" style={{ fontSize: 10 }}>
            <Download size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            Export is available through a full backup in Settings
          </span>
        </div>
      </Panel>

      {error ? <div style={{ marginTop: 14 }}><ErrorState error={error} onRetry={reload} /></div> : null}

      <div className="history-feed" aria-live="polite">
        {loading ? <LoadingBlock rows={5} /> : null}
        {!loading && !items.length ? (
          <Panel>
            <EmptyState
              icon={<Activity size={20} />}
              title={filtered ? 'No activity matches those filters' : 'History is empty'}
              description={filtered
                ? 'Try another category, event or search term.'
                : 'ShowFlow records cue calls, media checks, integrations and system changes as they happen.'}
              action={filtered ? <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button> : null}
            />
          </Panel>
        ) : null}

        {!loading ? groups.map((group) => (
          <section key={group.label} className="history-day">
            <div className="history-day-label">
              <span>{group.label}</span>
              <span className="hairline" />
              <span className="mono">{group.items.length} ENTRIES</span>
            </div>
            <div className="history-day-entries">
              {group.items.map((entry) => {
                const meta = KIND_META[entry.kind] || KIND_META.system;
                const Icon = meta.icon;
                const mode = MODE_META[entry.mode] || MODE_META.system;
                const isOpen = expanded === entry.id;
                const detailEntries = entry.detail && typeof entry.detail === 'object' ? Object.entries(entry.detail) : [];
                return (
                  <div key={entry.id} className={cx('history-entry', isOpen && 'is-open')}>
                    <div className={cx('history-entry-icon', `tone-${meta.tone}`)}>
                      <Icon size={14} />
                    </div>
                    <div className="history-entry-body">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="history-entry-message">
                          {entry.eventId ? (
                            <Link to={`/events/${entry.eventId}`} style={{ color: 'var(--fg)' }}>{entry.message}</Link>
                          ) : entry.message}
                        </div>
                        <span className="mono history-entry-time">{formatTimeOfDay(entry.createdAt)}</span>
                      </div>
                      <div className="history-entry-meta">
                        <Badge tone={meta.tone}>{meta.singular}</Badge>
                        {entry.mode !== 'system' ? <Badge tone={mode.tone} dot>{mode.label}</Badge> : null}
                        {entry.eventTitle ? (
                          <span className="truncate" style={{ maxWidth: 260 }}>
                            <Link to={`/events/${entry.eventId}`}>{entry.eventTitle}</Link>
                          </span>
                        ) : null}
                        <span className="text-faint">· {entry.actor}</span>
                        {detailEntries.length ? (
                          <button type="button" className="history-detail-toggle" onClick={() => setExpanded(isOpen ? null : entry.id)} aria-expanded={isOpen}>
                            Detail <ChevronDown size={11} className={isOpen ? 'is-open' : ''} />
                          </button>
                        ) : null}
                      </div>
                      {isOpen && detailEntries.length ? (
                        <dl className="history-detail">
                          {detailEntries.map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd className="mono">{formatDetailValue(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )) : null}
      </div>

      {activity?.total > PAGE_SIZE ? (
        <div className="history-pagination">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0 || loading}
          >
            <ArrowLeft size={13} /> Newer
          </Button>
          <span className="mono">PAGE {page + 1} / {totalPages}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            Older <ArrowRight size={13} />
          </Button>
        </div>
      ) : null}

      <div className="control-safety-note">
        <CircleDot size={15} />
        <p>
          <strong>History is a record, not a replay button.</strong> Restarting ShowFlow never re-sends OSC, reopens a
          session or re-triggers a cue. An entry marked <em>unverified</em> means the message left this computer; it does
          not prove Resolume or a projector acted on it.
        </p>
      </div>

      <Modal
        open={noteOpen}
        onClose={() => !savingNote && setNoteOpen(false)}
        title="Record a production note"
        eyebrow="History"
        description="Useful for handover notes, room checks or decisions that are not tied to a cue. The note is stored locally and attributed to the configured operator."
        size="md"
        preventClose={savingNote}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteOpen(false)} disabled={savingNote}>Cancel</Button>
            <Button variant="primary" onClick={saveNote} loading={savingNote}>Record note</Button>
          </>
        }
      >
        <div className="form-grid">
          {noteError ? <div className="input-error" role="alert">{noteError}</div> : null}
          <Field label="Event" hint="Optional. Attach the note to an event record.">
            <Select value={noteEventId} onChange={(event) => setNoteEventId(event.target.value)}>
              <option value="">No event</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.title}{event.archived ? ' (archived)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Note" required hint="Do not include passwords, pairing codes or other secrets.">
            <Textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={5}
              maxLength={600}
              placeholder="e.g. Spare projector lamp checked and stored in the AV cupboard."
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
