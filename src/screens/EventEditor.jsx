import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  FileDown,
  FolderOpen,
  Link2,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  Radio,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import {
  CHECKLIST_KIND_META,
  CUE_TYPES,
  CUE_TYPE_MAP,
  CREW_ROLES,
  CREW_ROLE_MAP,
  EVENT_STATUS_META,
  RESOLUME_ACTIONS,
} from '@shared/enums.js';
import {
  formatDate,
  formatDurationWords,
  formatEventWhen,
  formatTime,
} from '@shared/format.js';
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
  ProgressBar,
  Select,
  StatusBadge,
  TabNav,
  Textarea,
  TextInput,
  cx,
} from '../components/ui.jsx';

const EVENT_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'order', label: 'Running order' },
  { value: 'crew', label: 'Crew' },
  { value: 'checks', label: 'Checklists' },
  { value: 'notes', label: 'Notes' },
];

const EMPTY_CUE = {
  title: '',
  type: 'video',
  durationSeconds: '0',
  operatorId: '',
  assetId: '',
  notes: '',
  fallback: '',
  resolumeAction: 'none',
  resolumeLayer: '1',
  resolumeClip: '1',
  resolumeValue: '1',
};

function CueForm({ form, setForm, operators, media, error }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="form-grid">
      {error ? <div className="input-error" role="alert">{error}</div> : null}
      <div className="form-grid form-grid-2">
        <Field label="Cue title" required>
          <TextInput value={form.title} onChange={update('title')} placeholder="e.g. Opening film — house lights down" maxLength={160} autoFocus />
        </Field>
        <Field label="Cue type">
          <Select value={form.type} onChange={update('type')}>
            {CUE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="form-grid form-grid-3">
        <Field label="Duration" hint="Seconds. 0 means no timer.">
          <TextInput type="number" min={0} max={86400} value={form.durationSeconds} onChange={update('durationSeconds')} />
        </Field>
        <Field label="Operator">
          <Select value={form.operatorId} onChange={update('operatorId')}>
            <option value="">Unassigned</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>{operator.name} — {CREW_ROLE_MAP[operator.role]?.label || operator.role}</option>
            ))}
          </Select>
        </Field>
        <Field label="Linked media">
          <Select value={form.assetId} onChange={update('assetId')}>
            <option value="">No media</option>
            {media.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}{asset.available ? '' : ' — missing'}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Cue notes" hint="What should the operator know at the moment of GO?">
        <Textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={3000} placeholder="Instructions, timing or context." />
      </Field>
      <Field label="Fallback / manual instruction" hint="What to do if this cue cannot run as planned.">
        <Textarea value={form.fallback} onChange={update('fallback')} rows={2} maxLength={3000} placeholder="e.g. Hold slide, announce from stage." />
      </Field>

      <div className="panel-inset" style={{ padding: 13 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Resolume mapping · optional</div>
        <Field label="Action" hint="Only verified Resolume OSC actions are supported. UDP sends are never acknowledged.">
          <Select value={form.resolumeAction} onChange={update('resolumeAction')}>
            {RESOLUME_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
          </Select>
        </Field>
        {form.resolumeAction !== 'none' ? (
          <div className="form-grid form-grid-3" style={{ marginTop: 12 }}>
            <Field label="Layer">
              <TextInput type="number" min={1} max={999} value={form.resolumeLayer} onChange={update('resolumeLayer')} />
            </Field>
            {form.resolumeAction === 'clip_connect' ? (
              <Field label="Clip">
                <TextInput type="number" min={1} max={9999} value={form.resolumeClip} onChange={update('resolumeClip')} />
              </Field>
            ) : (
              <Field label="Opacity" hint="0 to 1">
                <TextInput type="number" min={0} max={1} step="0.01" value={form.resolumeValue} onChange={update('resolumeValue')} />
              </Field>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Overview({ event, onTab, onControl, onExport, onEdit }) {
  const setup = event.checklists.filter((item) => item.kind === 'setup');
  const shutdown = event.checklists.filter((item) => item.kind === 'shutdown');
  const setupPercent = setup.length ? Math.round((setup.filter((item) => item.done).length / setup.length) * 100) : 0;
  const shutdownPercent = shutdown.length ? Math.round((shutdown.filter((item) => item.done).length / shutdown.length) * 100) : 0;
  const missing = event.readiness.missingCueAssets;

  return (
    <div className="grid-sidebar grid-2" style={{ alignItems: 'start' }}>
      <div>
        <Panel style={{ padding: 20 }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Show brief</div>
              <p style={{ marginTop: 8, maxWidth: '72ch', color: event.description ? 'var(--fg-muted)' : 'var(--fg-faint)', lineHeight: '21px', fontSize: 13 }}>
                {event.description || 'No description yet. Add a short brief so every operator understands the shape of the show.'}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={13} /> Edit details</Button>
          </div>

          <div className="hairline" style={{ margin: '18px 0' }} />

          <div className="grid-3" style={{ gap: 18 }}>
            <div>
              <div className="eyebrow">Schedule</div>
              <div style={{ marginTop: 6, fontSize: 12.5 }}>{formatEventWhen(event.eventDate, event.startTime)}</div>
              <div className="text-faint" style={{ marginTop: 2, fontSize: 10.5 }}>{event.startTime ? `Doors / start ${formatTime(event.startTime)}` : 'No start time set'}</div>
            </div>
            <div>
              <div className="eyebrow">Venue</div>
              <div style={{ marginTop: 6, fontSize: 12.5 }} className="flex items-center gap-1"><MapPin size={12} /> {event.venue || 'Not set'}</div>
              <div className="text-faint" style={{ marginTop: 2, fontSize: 10.5 }}>Local production</div>
            </div>
            <div>
              <div className="eyebrow">Running order</div>
              <div className="mono" style={{ marginTop: 6, fontSize: 12.5 }}>{event.cues.length} cues</div>
              <div className="text-faint" style={{ marginTop: 2, fontSize: 10.5 }}>{event.readiness.linkedAssets} linked media</div>
            </div>
          </div>

          <div className="hairline" style={{ margin: '18px 0' }} />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={onControl} disabled={event.archived}>
              <Radio size={13} /> Open Control Room
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onTab('order')}><ListChecks size={13} /> Review running order</Button>
            <Button variant="ghost" size="sm" onClick={onExport}><Download size={13} /> Export run sheet</Button>
          </div>
        </Panel>

        <Panel style={{ marginTop: 14, overflow: 'hidden' }}>
          <div className="flex items-center justify-between gap-3" style={{ padding: '14px 17px', borderBottom: '1px solid var(--line)' }}>
            <div>
              <div className="eyebrow">Sequence</div>
              <div style={{ marginTop: 3, fontSize: 13, fontWeight: 560 }}>First cues in the running order</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onTab('order')}>Full order <ChevronRight size={13} /></Button>
          </div>
          {event.cues.length ? (
            event.cues.slice(0, 6).map((cue, index) => (
              <div key={cue.id} className="flex items-center gap-3" style={{ padding: '10px 17px', borderBottom: index < Math.min(5, event.cues.length - 1) ? '1px solid var(--line-soft)' : 0 }}>
                <span className="mono" style={{ width: 28, color: 'var(--fg-faint)', fontSize: 10 }}>{String(index + 1).padStart(2, '0')}</span>
                <span style={{ width: 3, height: 22, borderRadius: 99, background: CUE_TYPE_MAP[cue.type]?.value === 'audio' ? 'var(--violet)' : 'var(--accent)', opacity: 0.55 }} />
                <div className="grow">
                  <div style={{ fontSize: 12.5, fontWeight: 520 }}>{cue.title}</div>
                  <div style={{ marginTop: 1, fontSize: 10, color: 'var(--fg-faint)' }}>{CUE_TYPE_MAP[cue.type]?.label} {cue.asset ? `· ${cue.asset.name}` : ''}</div>
                </div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{cue.durationSeconds ? formatDurationWords(cue.durationSeconds) : '—'}</span>
              </div>
            ))
          ) : (
            <EmptyState icon={<ListChecks size={18} />} title="No cues yet" description="Add the first cue before rehearsal or live mode." action={<Button size="sm" variant="soft" onClick={() => onTab('order')}><Plus size={13} /> Build running order</Button>} />
          )}
        </Panel>
      </div>

      <div>
        <Panel style={{ padding: 17 }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Readiness</div>
              <div style={{ marginTop: 3, fontSize: 13, fontWeight: 560 }}>Before the doors open</div>
            </div>
            {missing.length ? <Badge tone="amber" dot>{missing.length} missing</Badge> : <Badge tone="green" dot>Clear</Badge>}
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 13 }}>
            <div>
              <div className="flex justify-between" style={{ marginBottom: 5 }}>
                <span style={{ fontSize: 11.5 }}>Setup checklist</span>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{setup.filter((item) => item.done).length}/{setup.length}</span>
              </div>
              <ProgressBar value={setupPercent} tone={setupPercent === 100 ? 'positive' : 'accent'} label="Setup checklist" />
            </div>
            <div>
              <div className="flex justify-between" style={{ marginBottom: 5 }}>
                <span style={{ fontSize: 11.5 }}>Shutdown checklist</span>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{shutdown.filter((item) => item.done).length}/{shutdown.length}</span>
              </div>
              <ProgressBar value={shutdownPercent} tone={shutdownPercent === 100 ? 'positive' : 'accent'} label="Shutdown checklist" />
            </div>
          </div>

          {missing.length ? (
            <div style={{ marginTop: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 7, color: 'var(--warning)' }}>Cue media unavailable</div>
              {missing.slice(0, 5).map((item) => (
                <div key={item.cueId} className="flex items-center gap-2" style={{ padding: '5px 0', fontSize: 11 }}>
                  <TriangleAlert size={12} style={{ color: 'var(--warning)', flex: 'none' }} />
                  <span className="text-muted truncate">{item.assetName}</span>
                  <span className="text-faint truncate" style={{ marginLeft: 'auto', fontSize: 10 }}>{item.cueTitle}</span>
                </div>
              ))}
              <Button as={Link} to="/media?filter=missing" size="sm" variant="ghost" style={{ marginTop: 5, paddingLeft: 0 }}>
                Open MediaVault <ChevronRight size={12} />
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2" style={{ marginTop: 16, padding: '10px 11px', borderRadius: 7, background: 'rgba(74,222,128,.04)', border: '1px solid rgba(74,222,128,.15)', fontSize: 10.5, color: 'var(--fg-muted)' }}>
              <Check size={13} style={{ color: 'var(--positive)', flex: 'none', marginTop: 1 }} />
              All linked cue media is available at its indexed path. Verify playback before the show.
            </div>
          )}
        </Panel>

        <Panel style={{ marginTop: 14, padding: 17 }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Crew</div>
              <div style={{ marginTop: 3, fontSize: 13, fontWeight: 560 }}>Assigned to this event</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onTab('crew')}>Manage</Button>
          </div>
          <div style={{ marginTop: 12 }}>
            {event.assignments.length ? event.assignments.slice(0, 6).map((assignment) => (
              <div key={assignment.id} className="flex items-center gap-2" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ width: 23, height: 23, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.035)', border: '1px solid var(--line)', color: 'var(--fg-faint)' }}>
                  <UserRound size={11} />
                </div>
                <div className="grow">
                  <div style={{ fontSize: 11.5 }}>{assignment.operatorName || 'Unassigned'}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{assignment.roleLabel || CREW_ROLE_MAP[assignment.role]?.label || assignment.role}</div>
                </div>
              </div>
            )) : (
              <div className="text-faint" style={{ fontSize: 11.5, padding: '8px 0' }}>No crew assigned yet.</div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function EventEditor() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = EVENT_TABS.some((item) => item.value === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const [busy, setBusy] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [cueOpen, setCueOpen] = useState(false);
  const [cueEditing, setCueEditing] = useState(null);
  const [cueForm, setCueForm] = useState(EMPTY_CUE);
  const [cueError, setCueError] = useState('');
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentEditing, setAssignmentEditing] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({ operatorId: '', role: 'playback', roleLabel: '', notes: '' });
  const [assignmentError, setAssignmentError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState({ notes: '', technicalNotes: '' });
  const [checkDraft, setCheckDraft] = useState({ setup: '', shutdown: '' });

  const { data, error, loading, reload } = useLoader(
    async () => {
      const [event, operators, media] = await Promise.all([
        api('events.get', eventId),
        api('crew.operators'),
        api('media.list', { limit: 5000 }),
      ]);
      return { event, operators, media: media.items };
    },
    [eventId],
  );

  const event = data?.event;
  const operators = useMemo(() => data?.operators || [], [data?.operators]);
  const media = data?.media || [];

  useEffect(() => {
    if (event) {
      setNotesDraft({ notes: event.notes, technicalNotes: event.technicalNotes });
    }
  }, [event]);

  const locked = event?.status === 'live';
  const archived = event?.archived;

  const availableOperators = useMemo(() => operators.filter((operator) => operator.active || event?.assignments.some((assignment) => assignment.operatorId === operator.id)), [operators, event?.assignments]);

  function setTab(next) {
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  }

  async function refresh(quiet = true) {
    await reload({ quiet });
  }

  function openEdit() {
    setEditForm({
      title: event.title,
      eventDate: event.eventDate,
      startTime: event.startTime,
      venue: event.venue,
      description: event.description,
    });
    setEditError('');
    setEditOpen(true);
  }

  async function saveEvent() {
    if (!editForm.title.trim()) {
      setEditError('Event title is required.');
      return;
    }
    setBusy('event');
    setEditError('');
    try {
      await api('events.update', event.id, {
        ...editForm,
        notes: event.notes,
        technicalNotes: event.technicalNotes,
      });
      setEditOpen(false);
      toast.success('Event updated');
      await refresh();
    } catch (caught) {
      setEditError(friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  function openCue(cue = null) {
    setCueEditing(cue);
    setCueError('');
    setCueForm(
      cue
        ? {
            title: cue.title,
            type: cue.type,
            durationSeconds: String(cue.durationSeconds ?? 0),
            operatorId: cue.operatorId || '',
            assetId: cue.assetId || '',
            notes: cue.notes || '',
            fallback: cue.fallback || '',
            resolumeAction: cue.resolumeAction || 'none',
            resolumeLayer: cue.resolumeLayer ? String(cue.resolumeLayer) : '1',
            resolumeClip: cue.resolumeClip ? String(cue.resolumeClip) : '1',
            resolumeValue: cue.resolumeValue !== null && cue.resolumeValue !== undefined ? String(cue.resolumeValue) : '1',
          }
        : { ...EMPTY_CUE },
    );
    setCueOpen(true);
  }

  async function saveCue() {
    if (!cueForm.title.trim()) {
      setCueError('Cue title is required.');
      return;
    }
    setBusy('cue');
    setCueError('');
    try {
      const payload = {
        ...cueForm,
        durationSeconds: Number(cueForm.durationSeconds) || 0,
        operatorId: cueForm.operatorId || null,
        assetId: cueForm.assetId || null,
        resolumeAction: cueForm.resolumeAction,
        resolumeLayer: cueForm.resolumeAction === 'none' ? null : Number(cueForm.resolumeLayer),
        resolumeClip: cueForm.resolumeAction === 'clip_connect' ? Number(cueForm.resolumeClip) : null,
        resolumeValue: cueForm.resolumeAction === 'layer_opacity' ? Number(cueForm.resolumeValue) : null,
      };
      if (cueEditing) await api('cues.update', { id: cueEditing.id, cue: payload });
      else await api('cues.create', { eventId: event.id, cue: payload });
      setCueOpen(false);
      toast.success(cueEditing ? 'Cue updated' : 'Cue added', cueForm.title);
      await refresh();
    } catch (caught) {
      setCueError(friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function deleteCue(cue) {
    const ok = await confirm({
      title: 'Delete this cue?',
      message: `“${cue.title}” will be removed from the running order.`,
      confirmLabel: 'Delete cue',
    });
    if (!ok) return;
    setBusy(`cue-${cue.id}`);
    try {
      await api('cues.remove', cue.id);
      toast.success('Cue removed', cue.title);
      await refresh();
    } catch (caught) {
      toast.error('Could not remove cue', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function moveCue(cue, direction) {
    const index = event.cues.findIndex((item) => item.id === cue.id);
    const target = index + direction;
    if (target < 0 || target >= event.cues.length) return;
    const ordered = [...event.cues];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy(`reorder-${cue.id}`);
    try {
      await api('cues.reorder', { eventId: event.id, orderedIds: ordered.map((item) => item.id) });
      await refresh();
    } catch (caught) {
      toast.error('Could not reorder cues', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  function openAssignment(assignment = null) {
    setAssignmentEditing(assignment);
    setAssignmentError('');
    setAssignmentForm(
      assignment
        ? { operatorId: assignment.operatorId || '', role: assignment.role, roleLabel: assignment.roleLabel || '', notes: assignment.notes || '' }
        : { operatorId: '', role: 'playback', roleLabel: '', notes: '' },
    );
    setAssignmentOpen(true);
  }

  async function saveAssignment() {
    setBusy('assignment');
    setAssignmentError('');
    try {
      await api('crew.saveAssignment', {
        id: assignmentEditing?.id || null,
        eventId: event.id,
        operatorId: assignmentForm.operatorId || null,
        role: assignmentForm.role,
        roleLabel: assignmentForm.role === 'custom' ? assignmentForm.roleLabel : '',
        notes: assignmentForm.notes,
      });
      setAssignmentOpen(false);
      toast.success(assignmentEditing ? 'Assignment updated' : 'Crew assigned');
      await refresh();
    } catch (caught) {
      setAssignmentError(friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function deleteAssignment(assignment) {
    const ok = await confirm({
      title: 'Remove this assignment?',
      message: `${assignment.operatorName || 'The unassigned role'} will no longer be assigned to “${event.title}”.`,
      confirmLabel: 'Remove assignment',
    });
    if (!ok) return;
    setBusy(`assignment-${assignment.id}`);
    try {
      await api('crew.removeAssignment', assignment.id);
      await refresh();
    } catch (caught) {
      toast.error('Could not remove assignment', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function addChecklistItem(kind) {
    const title = checkDraft[kind].trim();
    if (!title) return;
    setBusy(`check-${kind}`);
    try {
      await api('crew.saveChecklist', { eventId: event.id, kind, title, owner: '', done: false });
      setCheckDraft((current) => ({ ...current, [kind]: '' }));
      await refresh();
    } catch (caught) {
      toast.error('Could not add checklist item', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function toggleChecklistItem(item) {
    setBusy(`check-${item.id}`);
    try {
      await api('crew.saveChecklist', {
        id: item.id,
        eventId: event.id,
        kind: item.kind,
        title: item.title,
        owner: item.owner,
        done: !item.done,
      });
      await refresh();
    } catch (caught) {
      toast.error('Could not update checklist', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function deleteChecklistItem(item) {
    setBusy(`check-${item.id}`);
    try {
      await api('crew.removeChecklist', item.id);
      await refresh();
    } catch (caught) {
      toast.error('Could not remove checklist item', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function saveNotes() {
    setBusy('notes');
    try {
      await api('events.update', event.id, {
        title: event.title,
        description: event.description,
        venue: event.venue,
        eventDate: event.eventDate,
        startTime: event.startTime,
        notes: notesDraft.notes,
        technicalNotes: notesDraft.technicalNotes,
      });
      toast.success('Notes saved');
      await refresh();
    } catch (caught) {
      toast.error('Could not save notes', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function exportSheet(format) {
    setBusy(`export-${format}`);
    try {
      const result = await api('events.exportSheet', { eventId: event.id, format });
      if (!result.canceled) {
        setExportOpen(false);
        toast.success('Run sheet exported', result.path);
      }
    } catch (caught) {
      toast.error('Export failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function exportPlan() {
    setBusy('plan');
    try {
      const result = await api('events.exportPlan', event.id);
      if (!result.canceled) {
        toast.success('Event plan exported', result.warnings?.length ? `${result.warnings.length} warnings included in the file.` : result.path);
      }
    } catch (caught) {
      toast.error('Plan export failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader eyebrow="Event workspace" title="Loading event" />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Event workspace" title="Event unavailable" actions={<Button as={Link} to="/events" variant="ghost"><ArrowLeft size={14} /> All events</Button>} />
        <ErrorState error={error} onRetry={() => reload()} />
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="page">
      <div style={{ marginBottom: 14 }}>
        <Link to="/events" className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
          <ArrowLeft size={12} /> Events
        </Link>
      </div>

      <PageHeader
        eyebrow={`Event workspace${archived ? ' · archived' : ''}`}
        title={event.title}
        description={`${formatEventWhen(event.eventDate, event.startTime)}${event.venue ? ` · ${event.venue}` : ''}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(true)} disabled={!event.cues.length}>
              <FileDown size={14} /> Run sheet
            </Button>
            <Button variant="ghost" onClick={exportPlan} loading={busy === 'plan'} disabled={archived}>
              <Download size={14} /> Plan
            </Button>
            <Button variant="primary" onClick={() => navigate(`/control/${event.id}`)} disabled={archived}>
              <Radio size={14} /> Control Room
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12 }}>
          <StatusBadge status={event.status} meta={EVENT_STATUS_META} />
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)', letterSpacing: '.05em' }}>
            {event.cues.length} CUES · {event.assignments.length} CREW · {event.readiness.missingAssets ? `${event.readiness.missingAssets} MISSING` : 'MEDIA READY'}
          </span>
          {archived ? <Badge tone="neutral">Archived</Badge> : null}
          {locked ? <Badge tone="red" dot>Editing locked while live</Badge> : null}
        </div>
      </PageHeader>

      <TabNav
        tabs={EVENT_TABS.map((item) => ({
          ...item,
          count: item.value === 'order' ? event.cues.length : item.value === 'crew' ? event.assignments.length : item.value === 'checks' ? event.checklists.length : undefined,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: 20 }}>
        {tab === 'overview' ? (
          <Overview
            event={event}
            onTab={setTab}
            onControl={() => navigate(`/control/${event.id}`)}
            onExport={() => setExportOpen(true)}
            onEdit={openEdit}
          />
        ) : null}

        {tab === 'order' ? (
          <div>
            <div className="flex wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
              <div>
                <div className="eyebrow">Running order</div>
                <div style={{ marginTop: 3, fontSize: 13, color: 'var(--fg-muted)' }}>
                  {locked ? 'Cue edits are locked while this event is live. End the session to make changes.' : 'Cues run in this order. Use the arrows to adjust position.'}
                </div>
              </div>
              <Button size="sm" variant="soft" onClick={() => openCue()} disabled={locked || archived}>
                <Plus size={13} /> Add cue
              </Button>
            </div>

            <Panel style={{ overflow: 'hidden' }}>
              {event.cues.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 54 }}>#</th>
                        <th>Cue</th>
                        <th style={{ width: 108 }}>Type</th>
                        <th style={{ width: 100 }}>Duration</th>
                        <th style={{ width: 140 }}>Operator</th>
                        <th style={{ width: 150 }}>Media</th>
                        <th style={{ width: 78 }}>Resolume</th>
                        <th style={{ width: 122, textAlign: 'right' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {event.cues.map((cue, index) => (
                        <tr key={cue.id}>
                          <td className="mono" style={{ color: 'var(--fg-faint)', fontSize: 10.5 }}>{String(index + 1).padStart(2, '0')}</td>
                          <td>
                            <div style={{ fontWeight: 530 }}>{cue.title}</div>
                            {cue.notes ? <div className="truncate" style={{ maxWidth: 340, fontSize: 10, color: 'var(--fg-faint)', marginTop: 1 }}>{cue.notes}</div> : null}
                          </td>
                          <td><Badge tone={cue.type === 'audio' ? 'violet' : 'neutral'}>{CUE_TYPE_MAP[cue.type]?.label || cue.type}</Badge></td>
                          <td className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>{cue.durationSeconds ? formatDurationWords(cue.durationSeconds) : '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{cue.operatorName || 'Unassigned'}</td>
                          <td>
                            {cue.asset ? (
                              <span className={cx('flex items-center gap-1', !cue.asset.available && 'text-warning')} style={{ fontSize: 10.5 }}>
                                {cue.asset.available ? <FolderOpen size={11} /> : <TriangleAlert size={11} />}
                                <span className="truncate" style={{ maxWidth: 120 }}>{cue.asset.name}</span>
                              </span>
                            ) : <span className="text-faint" style={{ fontSize: 10.5 }}>—</span>}
                          </td>
                          <td>{cue.resolumeAction === 'none' ? <span className="text-faint">—</span> : <Badge tone="cyan">{cue.resolumeAction === 'clip_connect' ? 'Clip' : 'Opacity'}</Badge>}</td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <IconButton label="Move cue up" onClick={() => moveCue(cue, -1)} disabled={index === 0 || locked || archived || busy.startsWith('reorder')}>
                                <ArrowUp size={13} />
                              </IconButton>
                              <IconButton label="Move cue down" onClick={() => moveCue(cue, 1)} disabled={index === event.cues.length - 1 || locked || archived || busy.startsWith('reorder')}>
                                <ArrowDown size={13} />
                              </IconButton>
                              <IconButton label={`Edit ${cue.title}`} onClick={() => openCue(cue)} disabled={locked || archived}>
                                <Pencil size={13} />
                              </IconButton>
                              <IconButton label={`Delete ${cue.title}`} tone="danger" onClick={() => deleteCue(cue)} disabled={locked || archived || busy === `cue-${cue.id}`}>
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
                  icon={<ListChecks size={20} />}
                  title="The running order is empty"
                  description="Add cues in performance order. Each cue can link media, an operator, a duration and an optional Resolume action."
                  action={<Button size="sm" variant="soft" onClick={() => openCue()} disabled={locked || archived}><Plus size={13} /> Add the first cue</Button>}
                />
              )}
            </Panel>
            {archived ? <p className="input-hint" style={{ marginTop: 10 }}>Restore this archived event from the Events list before editing its running order.</p> : null}
          </div>
        ) : null}

        {tab === 'crew' ? (
          <div>
            <div className="flex wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
              <div>
                <div className="eyebrow">CrewSync</div>
                <div style={{ marginTop: 3, fontSize: 13, color: 'var(--fg-muted)' }}>Assign roles for this event. Crew members are managed in CrewSync.</div>
              </div>
              <div className="flex gap-2">
                <Button as={Link} to="/crew" size="sm" variant="ghost"><Users size={13} /> Crew roster</Button>
                <Button size="sm" variant="soft" onClick={() => openAssignment()} disabled={archived}><Plus size={13} /> Assign role</Button>
              </div>
            </div>

            <Panel style={{ overflow: 'hidden' }}>
              {event.assignments.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 180 }}>Role</th>
                        <th>Crew member</th>
                        <th>Contact</th>
                        <th>Notes</th>
                        <th style={{ width: 96, textAlign: 'right' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {event.assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td><Badge tone="cyan">{assignment.roleLabel || CREW_ROLE_MAP[assignment.role]?.label || assignment.role}</Badge></td>
                          <td style={{ fontWeight: 520 }}>{assignment.operatorName || <span className="text-faint">Unassigned</span>}</td>
                          <td className="text-muted" style={{ fontSize: 11 }}>{assignment.operatorContact || '—'}</td>
                          <td className="text-muted" style={{ fontSize: 11 }}>{assignment.notes || '—'}</td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <IconButton label="Edit assignment" onClick={() => openAssignment(assignment)} disabled={archived}>
                                <Pencil size={13} />
                              </IconButton>
                              <IconButton label="Remove assignment" tone="danger" onClick={() => deleteAssignment(assignment)} disabled={archived || busy === `assignment-${assignment.id}`}>
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
                <EmptyState icon={<Users size={20} />} title="No crew assigned" description="Assign a show caller, playback operator, display operator and stage roles so responsibilities are explicit." action={<Button size="sm" variant="soft" onClick={() => openAssignment()} disabled={archived}><Plus size={13} /> Assign the first role</Button>} />
              )}
            </Panel>
          </div>
        ) : null}

        {tab === 'checks' ? (
          <div>
            <div className="flex wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
              <div>
                <div className="eyebrow">Operational checks</div>
                <div style={{ marginTop: 3, fontSize: 13, color: 'var(--fg-muted)' }}>Checklist changes are allowed during a live show and are recorded in local history.</div>
              </div>
            </div>
            <div className="grid-2">
              {['setup', 'shutdown'].map((kind) => {
                const items = event.checklists.filter((item) => item.kind === kind);
                const done = items.filter((item) => item.done).length;
                return (
                  <Panel key={kind} style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ClipboardList size={15} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: 13, fontWeight: 560 }}>{CHECKLIST_KIND_META[kind].label}</span>
                        </div>
                        <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{done}/{items.length}</span>
                      </div>
                      <div style={{ marginTop: 10 }}><ProgressBar value={items.length ? Math.round((done / items.length) * 100) : 0} tone={done === items.length && items.length ? 'positive' : 'accent'} height={3} /></div>
                    </div>
                    <div>
                      {items.length ? items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2" style={{ padding: '9px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                          <button
                            type="button"
                            onClick={() => toggleChecklistItem(item)}
                            disabled={busy === `check-${item.id}`}
                            aria-pressed={item.done}
                            style={{
                              width: 17, height: 17, flex: 'none', borderRadius: 4,
                              border: `1px solid ${item.done ? 'var(--positive)' : 'var(--line-strong)'}`,
                              background: item.done ? 'rgba(74,222,128,.12)' : 'transparent',
                              color: 'var(--positive)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                            }}
                          >
                            {item.done ? <Check size={11} /> : null}
                          </button>
                          <span className="grow" style={{ fontSize: 11.5, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--fg-faint)' : 'var(--fg)' }}>
                            {item.title}
                            {item.owner ? <span className="text-faint" style={{ fontSize: 10 }}> · {item.owner}</span> : null}
                          </span>
                          <IconButton label={`Remove ${item.title}`} tone="danger" onClick={() => deleteChecklistItem(item)} disabled={busy === `check-${item.id}`}>
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      )) : (
                        <div className="text-faint" style={{ padding: '18px 16px', fontSize: 11.5 }}>No items yet. Add the first check below.</div>
                      )}
                    </div>
                    <div className="flex gap-2" style={{ padding: 11, borderTop: '1px solid var(--line-soft)' }}>
                      <TextInput
                        value={checkDraft[kind]}
                        onChange={(eventChange) => setCheckDraft((current) => ({ ...current, [kind]: eventChange.target.value }))}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === 'Enter') addChecklistItem(kind);
                        }}
                        placeholder={kind === 'setup' ? 'Add a setup check…' : 'Add a shutdown check…'}
                        aria-label={`Add ${kind} checklist item`}
                      />
                      <Button variant="secondary" size="sm" onClick={() => addChecklistItem(kind)} loading={busy === `check-${kind}`} disabled={!checkDraft[kind].trim()}>
                        <Plus size={13} />
                      </Button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </div>
        ) : null}

        {tab === 'notes' ? (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Panel style={{ padding: 18 }}>
              <div className="eyebrow">Production notes</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)' }}>Context, staging notes and decisions for the whole crew.</div>
              <Textarea
                value={notesDraft.notes}
                onChange={(eventChange) => setNotesDraft((current) => ({ ...current, notes: eventChange.target.value }))}
                rows={14}
                maxLength={8000}
                placeholder="Write production notes…"
                style={{ marginTop: 13 }}
              />
            </Panel>
            <div>
              <Panel style={{ padding: 18 }}>
                <div className="eyebrow">Technical notes</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)' }}>Projector positions, audio routing, playback quirks, power and cabling.</div>
                <Textarea
                  value={notesDraft.technicalNotes}
                  onChange={(eventChange) => setNotesDraft((current) => ({ ...current, technicalNotes: eventChange.target.value }))}
                  rows={14}
                  maxLength={8000}
                  placeholder="Write technical notes…"
                  style={{ marginTop: 13 }}
                />
              </Panel>
              <div className="flex justify-end" style={{ marginTop: 10 }}>
                <Button variant="primary" onClick={saveNotes} loading={busy === 'notes'} disabled={archived}>
                  <Check size={14} /> Save notes
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={editOpen}
        onClose={() => !busy && setEditOpen(false)}
        title="Edit event details"
        eyebrow="Event workspace"
        size="lg"
        preventClose={busy === 'event'}
        footer={<><Button variant="ghost" onClick={() => setEditOpen(false)} disabled={busy === 'event'}>Cancel</Button><Button variant="primary" onClick={saveEvent} loading={busy === 'event'}>Save event</Button></>}
      >
        {editForm ? (
          <div className="form-grid">
            {editError ? <div className="input-error" role="alert">{editError}</div> : null}
            <Field label="Event title" required>
              <TextInput value={editForm.title} onChange={(eventChange) => setEditForm((current) => ({ ...current, title: eventChange.target.value }))} maxLength={160} />
            </Field>
            <div className="form-grid form-grid-2">
              <Field label="Date" required>
                <TextInput type="date" value={editForm.eventDate} onChange={(eventChange) => setEditForm((current) => ({ ...current, eventDate: eventChange.target.value }))} />
              </Field>
              <Field label="Start time">
                <TextInput type="time" value={editForm.startTime} onChange={(eventChange) => setEditForm((current) => ({ ...current, startTime: eventChange.target.value }))} />
              </Field>
            </div>
            <Field label="Venue">
              <TextInput value={editForm.venue} onChange={(eventChange) => setEditForm((current) => ({ ...current, venue: eventChange.target.value }))} maxLength={160} />
            </Field>
            <Field label="Description">
              <Textarea value={editForm.description} onChange={(eventChange) => setEditForm((current) => ({ ...current, description: eventChange.target.value }))} rows={4} maxLength={4000} />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={cueOpen}
        onClose={() => !busy && setCueOpen(false)}
        title={cueEditing ? 'Edit cue' : 'Add cue'}
        eyebrow="Running order"
        size="lg"
        preventClose={busy === 'cue'}
        footer={<><Button variant="ghost" onClick={() => setCueOpen(false)} disabled={busy === 'cue'}>Cancel</Button><Button variant="primary" onClick={saveCue} loading={busy === 'cue'}>{cueEditing ? 'Save cue' : 'Add cue'}</Button></>}
      >
        <CueForm form={cueForm} setForm={setCueForm} operators={operators} media={media} error={cueError} />
      </Modal>

      <Modal
        open={assignmentOpen}
        onClose={() => !busy && setAssignmentOpen(false)}
        title={assignmentEditing ? 'Edit crew assignment' : 'Assign a role'}
        eyebrow="CrewSync"
        preventClose={busy === 'assignment'}
        footer={<><Button variant="ghost" onClick={() => setAssignmentOpen(false)} disabled={busy === 'assignment'}>Cancel</Button><Button variant="primary" onClick={saveAssignment} loading={busy === 'assignment'}>{assignmentEditing ? 'Save assignment' : 'Assign role'}</Button></>}
      >
        <div className="form-grid">
          {assignmentError ? <div className="input-error" role="alert">{assignmentError}</div> : null}
          <Field label="Role">
            <Select value={assignmentForm.role} onChange={(eventChange) => setAssignmentForm((current) => ({ ...current, role: eventChange.target.value }))}>
              {CREW_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </Select>
          </Field>
          {assignmentForm.role === 'custom' ? (
            <Field label="Custom role label" required>
              <TextInput value={assignmentForm.roleLabel} onChange={(eventChange) => setAssignmentForm((current) => ({ ...current, roleLabel: eventChange.target.value }))} maxLength={60} placeholder="e.g. Lyrics operator" />
            </Field>
          ) : null}
          <Field label="Crew member" hint="Crew members are shared across events and managed in CrewSync.">
            <Select value={assignmentForm.operatorId} onChange={(eventChange) => setAssignmentForm((current) => ({ ...current, operatorId: eventChange.target.value }))}>
              <option value="">Leave unassigned</option>
              {availableOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name} — {CREW_ROLE_MAP[operator.role]?.label || operator.role}</option>)}
            </Select>
          </Field>
          <Field label="Assignment notes">
            <Textarea value={assignmentForm.notes} onChange={(eventChange) => setAssignmentForm((current) => ({ ...current, notes: eventChange.target.value }))} rows={3} maxLength={2000} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={exportOpen}
        onClose={() => !busy && setExportOpen(false)}
        title="Export run sheet"
        eyebrow="Paper backup"
        description="A printable run sheet contains the cue order, timings, operators, media references and fallback notes. Choose a format."
        size="sm"
      >
        <div className="form-grid">
          <button type="button" className="panel-inset" onClick={() => exportSheet('html')} style={{ padding: 14, textAlign: 'left', cursor: 'pointer' }} disabled={busy === 'export-html'}>
            <div className="flex items-center gap-3">
              <FileDown size={17} style={{ color: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 550 }}>HTML run sheet</div>
                <div className="text-faint" style={{ fontSize: 11 }}>Print-ready and styled for a paper backup.</div>
              </div>
              {busy === 'export-html' ? <span className="spinner" style={{ marginLeft: 'auto' }} /> : <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
            </div>
          </button>
          <button type="button" className="panel-inset" onClick={() => exportSheet('txt')} style={{ padding: 14, textAlign: 'left', cursor: 'pointer' }} disabled={busy === 'export-txt'}>
            <div className="flex items-center gap-3">
              <ClipboardList size={17} style={{ color: 'var(--fg-muted)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 550 }}>Plain text run sheet</div>
                <div className="text-faint" style={{ fontSize: 11 }}>Portable text for any device or printer.</div>
              </div>
              {busy === 'export-txt' ? <span className="spinner" style={{ marginLeft: 'auto' }} /> : <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
            </div>
          </button>
          <p className="input-hint">Export does not transmit anything off this computer. The file is saved wherever you choose.</p>
        </div>
      </Modal>

      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginTop: 22 }}>
        <p className="flex items-center gap-1 input-hint"><Link2 size={11} /> Media is referenced by local path. Original files are never moved or deleted.</p>
        <span className="mono" style={{ fontSize: 9, color: '#505b68' }}>UPDATED {formatDate(event.updatedAt?.slice(0, 10), { alwaysYear: true }).toUpperCase()}</span>
      </div>
    </div>
  );
}
