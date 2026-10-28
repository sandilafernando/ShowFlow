import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarDays,
  Copy,
  FileUp,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import { EVENT_STATUS_META, EVENT_STATUS_VALUES } from '@shared/enums.js';
import { formatEventWhen, todayIso } from '@shared/format.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  Select,
  StatusBadge,
  Switch,
  TextInput,
  Textarea,
} from '../components/ui.jsx';

const EMPTY_FORM = {
  title: '',
  eventDate: todayIso(),
  startTime: '',
  venue: '',
  description: '',
};

function EventForm({ form, setForm, error }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="form-grid">
      {error ? <div className="input-error" role="alert">{error}</div> : null}
      <Field label="Event title" required hint="Use the name the crew will recognise on the running order.">
        <TextInput value={form.title} onChange={update('title')} placeholder="e.g. Annual Prize Giving" maxLength={160} autoFocus />
      </Field>
      <div className="form-grid form-grid-2">
        <Field label="Date" required>
          <TextInput type="date" value={form.eventDate} onChange={update('eventDate')} />
        </Field>
        <Field label="Start time" hint="24-hour time. Optional.">
          <TextInput type="time" value={form.startTime} onChange={update('startTime')} />
        </Field>
      </div>
      <Field label="Venue">
        <TextInput value={form.venue} onChange={update('venue')} placeholder="e.g. College Auditorium" maxLength={160} />
      </Field>
      <Field label="Description" hint="A short brief for the production team.">
        <Textarea value={form.description} onChange={update('description')} rows={3} placeholder="What is this event, and what should the crew know first?" maxLength={4000} />
      </Field>
    </div>
  );
}

export default function Events() {
  const { settings, toast, confirm } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data: events, error, loading, reload } = useLoader(
    () => api('events.list', { search, status: status || undefined, includeArchived, limit: 500 }),
    [search, status, includeArchived],
  );

  useEffect(() => {
    if (createOpen) {
      setForm((current) => ({ ...current, venue: current.venue || settings?.defaultVenue || '' }));
      setSearchParams({}, { replace: true });
    }
  }, [createOpen, settings?.defaultVenue, setSearchParams]);

  const counts = useMemo(() => {
    const list = events || [];
    return {
      total: list.length,
      active: list.filter((event) => !event.archived).length,
      archived: list.filter((event) => event.archived).length,
    };
  }, [events]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, venue: settings?.defaultVenue || '' });
    setFormError('');
    setCreateOpen(true);
  }

  async function createEvent() {
    if (!form.title.trim()) {
      setFormError('Event title is required.');
      return;
    }
    if (!form.eventDate) {
      setFormError('Event date is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const event = await api('events.create', form);
      setCreateOpen(false);
      toast.success('Event created', `${event.title} is ready for cues and crew.`);
      navigate(`/events/${event.id}`);
    } catch (caught) {
      setFormError(friendlyError(caught, 'The event could not be created.'));
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(event) {
    setBusyId(event.id);
    try {
      const copy = await api('events.duplicate', event.id);
      toast.success('Event duplicated', `Created “${copy.title}”.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not duplicate event', friendlyError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(event, archived) {
    const ok = await confirm({
      title: archived ? 'Archive this event?' : 'Restore this event?',
      message: archived
        ? `“${event.title}” will be removed from the active schedule. Its data is preserved and it can be restored later.`
        : `“${event.title}” will return to the active schedule.`,
      confirmLabel: archived ? 'Archive event' : 'Restore event',
      tone: archived ? 'warning' : 'default',
    });
    if (!ok) return;
    setBusyId(event.id);
    try {
      await api('events.archive', { eventId: event.id, archived });
      toast.success(archived ? 'Event archived' : 'Event restored', event.title);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Archive action failed', friendlyError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(event) {
    const ok = await confirm({
      title: 'Delete this event permanently?',
      message: `“${event.title}” and its cues, assignments and checklists will be deleted from the local database.`,
      detail: 'MediaVault files and original media on disk are not deleted. A backup can restore this event if one exists.',
      confirmLabel: 'Delete event',
    });
    if (!ok) return;
    setBusyId(event.id);
    try {
      await api('events.remove', event.id);
      toast.success('Event deleted', event.title);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not delete event', friendlyError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function importPlan() {
    setBusyId('import');
    try {
      const result = await api('events.importPlan');
      if (result.canceled) return;
      const warnings = result.warnings?.length ? ` ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} recorded.` : '';
      toast.success('Event plan imported', `${result.event.title} was created from ${result.source}.${warnings}`);
      navigate(`/events/${result.event.id}`);
    } catch (caught) {
      toast.error('Import failed', friendlyError(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Production calendar"
        title="Events"
        description="Build the running order, assign the crew and keep production notes in one place. Archived events remain recoverable."
        actions={
          <>
            <Button variant="secondary" onClick={importPlan} loading={busyId === 'import'}>
              <FileUp size={14} /> Import plan
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus size={14} /> New event
            </Button>
          </>
        }
      />

      <div className="flex wrap items-center justify-between gap-3" style={{ marginBottom: 14 }}>
        <div className="flex wrap items-center gap-2 grow">
          <div style={{ position: 'relative', minWidth: 240, flex: '0 1 340px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--fg-faint)' }} />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, venue or description"
              style={{ paddingLeft: 31 }}
              aria-label="Search events"
            />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" style={{ width: 170 }}>
            <option value="">All statuses</option>
            {EVENT_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>{EVENT_STATUS_META[value].label}</option>
            ))}
          </Select>
          <Switch checked={includeArchived} onChange={setIncludeArchived} label="Include archived" />
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)', letterSpacing: '.06em' }}>
          {counts.total} SHOWN · {counts.active} ACTIVE{counts.archived ? ` · ${counts.archived} ARCHIVED` : ''}
        </div>
      </div>

      {loading ? <LoadingBlock rows={5} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      {!loading && !error ? (
        <Panel style={{ overflow: 'hidden' }}>
          {events?.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Date</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th style={{ width: 72, textAlign: 'right' }}>Cues</th>
                    <th style={{ width: 72, textAlign: 'right' }}>Crew</th>
                    <th style={{ width: 110 }}>Media</th>
                    <th style={{ width: 126, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Link to={`/events/${event.id}`} className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>
                          {formatEventWhen(event.eventDate, event.startTime)}
                        </Link>
                      </td>
                      <td onClick={() => navigate(`/events/${event.id}`)} className="row-click">
                        <div className="flex items-center gap-2">
                          <span style={{ fontWeight: 550 }}>{event.title}</span>
                          {event.archived ? <Badge tone="neutral">Archived</Badge> : null}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--fg-faint)' }}>
                          {event.venue || 'Venue not set'}
                          {event.description ? ` · ${event.description.slice(0, 72)}${event.description.length > 72 ? '…' : ''}` : ''}
                        </div>
                      </td>
                      <td><StatusBadge status={event.status} meta={EVENT_STATUS_META} /></td>
                      <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>{event.stats.cueCount}</td>
                      <td className="mono" style={{ textAlign: 'right', fontSize: 11 }}>{event.stats.assignmentCount}</td>
                      <td>
                        {event.stats.missingMediaCount ? (
                          <Badge tone="amber" dot>{event.stats.missingMediaCount} missing</Badge>
                        ) : event.stats.cueCount ? (
                          <Badge tone="green" dot>Ready</Badge>
                        ) : (
                          <Badge tone="neutral">Not linked</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Duplicate ${event.title}`}
                            onClick={() => duplicate(event)}
                            disabled={busyId === event.id}
                          >
                            <Copy size={13} />
                          </IconButton>
                          <IconButton
                            label={event.archived ? `Restore ${event.title}` : `Archive ${event.title}`}
                            onClick={() => setArchived(event, !event.archived)}
                            disabled={busyId === event.id || event.status === 'live'}
                          >
                            {event.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                          </IconButton>
                          <IconButton
                            label={`Delete ${event.title}`}
                            tone="danger"
                            onClick={() => remove(event)}
                            disabled={busyId === event.id || event.status === 'live'}
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<CalendarDays size={20} />}
              title={search || status || includeArchived ? 'No events match those filters' : 'No events in the workspace'}
              description={
                search || status || includeArchived
                  ? 'Try a different search, status filter or include archived events.'
                  : 'Create an event to start building a running order, or import a ShowFlow event plan.'
              }
              action={
                <Button variant="soft" size="sm" onClick={openCreate}>
                  <Plus size={13} /> Create event
                </Button>
              }
            />
          )}
        </Panel>
      ) : null}

      <div className="flex wrap items-center justify-between gap-2" style={{ marginTop: 14 }}>
        <p className="input-hint" style={{ maxWidth: '70ch' }}>
          Deleting an event never deletes original media files. Live events cannot be archived, deleted or edited until the session ends.
        </p>
        <span className="flex items-center gap-2 text-faint" style={{ fontSize: 10.5 }}>
          <CalendarClock size={12} /> {settings?.defaultVenue ? `Default venue: ${settings.defaultVenue}` : 'No default venue set'}
        </span>
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          if (!saving) setCreateOpen(false);
        }}
        title="New event"
        eyebrow="Production calendar"
        description="Start with the basics. Cues, crew assignments and checklists are added in the event workspace."
        size="lg"
        preventClose={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={createEvent} loading={saving}>Create event</Button>
          </>
        }
      >
        <EventForm form={form} setForm={setForm} error={formError} />
      </Modal>
    </div>
  );
}
