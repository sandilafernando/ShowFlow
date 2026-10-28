import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import {
  CHECKLIST_KIND_META,
  CREW_ROLES,
  CREW_ROLE_MAP,
  EVENT_STATUS_META,
} from '@shared/enums.js';
import { formatEventWhen } from '@shared/format.js';
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
  TextInput,
  Textarea,
  cx,
} from '../components/ui.jsx';

const EMPTY_MEMBER = { name: '', role: 'technician', contact: '', active: true };
const EMPTY_ASSIGNMENT = { id: null, operatorId: '', role: 'playback', roleLabel: '', notes: '' };

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function roleLabel(role) {
  return CREW_ROLE_MAP[role]?.label || role;
}

function MemberForm({ form, setForm, error }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="form-grid">
      {error ? <div className="input-error" role="alert">{error}</div> : null}
      <div className="form-grid form-grid-2">
        <Field label="Full name" required>
          <TextInput value={form.name} onChange={update('name')} maxLength={80} placeholder="e.g. Nimal Perera" autoFocus />
        </Field>
        <Field label="Default role">
          <Select value={form.role} onChange={update('role')}>
            {CREW_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Contact" hint="Phone, extension, radio channel or email. Stored locally.">
        <TextInput value={form.contact} onChange={update('contact')} maxLength={160} placeholder="e.g. Radio channel 3" />
      </Field>
      <label className="crew-active-check">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
        />
        <span>
          <span className="label" style={{ color: 'var(--fg)' }}>Active crew member</span>
          <span className="input-hint">Inactive members stay in the record but are marked unavailable for new calls.</span>
        </span>
      </label>
    </div>
  );
}

function AssignmentForm({ form, setForm, operators, error }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="form-grid">
      {error ? <div className="input-error" role="alert">{error}</div> : null}
      <Field label="Crew member" hint="Leave unassigned if the operator is not confirmed yet.">
        <Select value={form.operatorId} onChange={update('operatorId')}>
          <option value="">Unassigned</option>
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id} disabled={!operator.active}>
              {operator.name} · {roleLabel(operator.role)}{operator.active ? '' : ' (inactive)'}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid form-grid-2">
        <Field label="Role for this event">
          <Select value={form.role} onChange={update('role')}>
            {CREW_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </Select>
        </Field>
        {form.role === 'custom' ? (
          <Field label="Custom role label" required>
            <TextInput value={form.roleLabel} onChange={update('roleLabel')} maxLength={60} placeholder="e.g. Follow-spot" />
          </Field>
        ) : (
          <div />
        )}
      </div>
      <Field label="Call notes" hint="Position, report time or anything this person needs to know.">
        <Textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={2000} placeholder="e.g. Backstage left, headset on channel 3, cue 14 entrance." />
      </Field>
    </div>
  );
}

export default function CrewSync() {
  const { toast, confirm } = useApp();
  const [searchParams] = useSearchParams();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER);
  const [memberError, setMemberError] = useState('');
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState(EMPTY_ASSIGNMENT);
  const [assignmentError, setAssignmentError] = useState('');
  const [busy, setBusy] = useState('');

  const requestedEventId = searchParams.get('event') || '';

  const { data, error, loading, reload } = useLoader(async () => {
    const [operators, events] = await Promise.all([
      api('crew.operators'),
      api('events.list', { limit: 300 }),
    ]);
    const availableEvents = events.filter((event) => !event.archived);
    const requested = requestedEventId && availableEvents.some((event) => event.id === requestedEventId)
      ? requestedEventId
      : '';
    const active = availableEvents.find((event) => event.status === 'live' || event.status === 'rehearsal');
    const preferredId = selectedEventId || requested || active?.id || availableEvents[0]?.id || '';
    const event = preferredId ? await api('events.get', preferredId) : null;
    return { operators, events: availableEvents, event, preferredId };
  }, [selectedEventId, requestedEventId]);

  useEffect(() => {
    if (data?.preferredId && data.preferredId !== selectedEventId) {
      setSelectedEventId(data.preferredId);
    }
  }, [data?.preferredId, selectedEventId]);

  const operators = useMemo(() => data?.operators || [], [data?.operators]);
  const events = data?.events || [];
  const event = data?.event || null;

  const filteredOperators = useMemo(() => {
    const needle = rosterSearch.trim().toLowerCase();
    if (!needle) return operators;
    return operators.filter((operator) =>
      [operator.name, operator.contact, roleLabel(operator.role)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [operators, rosterSearch]);

  const activeCrew = operators.filter((operator) => operator.active).length;
  const calls = operators.reduce((total, operator) => total + (operator.assignmentCount || 0), 0);
  const setup = event?.checklists?.filter((item) => item.kind === 'setup') || [];
  const shutdown = event?.checklists?.filter((item) => item.kind === 'shutdown') || [];
  const setupDone = setup.filter((item) => item.done).length;
  const shutdownDone = shutdown.filter((item) => item.done).length;

  function openMemberCreate() {
    setEditingMember(null);
    setMemberForm(EMPTY_MEMBER);
    setMemberError('');
    setMemberOpen(true);
  }

  function openMemberEdit(member) {
    setEditingMember(member);
    setMemberForm({
      name: member.name,
      role: member.role,
      contact: member.contact || '',
      active: member.active,
    });
    setMemberError('');
    setMemberOpen(true);
  }

  async function saveMember() {
    if (!memberForm.name.trim()) {
      setMemberError('A crew member name is required.');
      return;
    }
    setBusy('member');
    setMemberError('');
    try {
      await api('crew.saveOperator', {
        ...(editingMember ? { id: editingMember.id } : {}),
        name: memberForm.name.trim(),
        role: memberForm.role,
        contact: memberForm.contact,
        active: memberForm.active,
      });
      setMemberOpen(false);
      toast.success(editingMember ? 'Crew member updated' : 'Crew member added', memberForm.name.trim());
      await reload({ quiet: true });
    } catch (caught) {
      setMemberError(friendlyError(caught, 'The crew member could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function removeMember(member) {
    const ok = await confirm({
      title: 'Remove this crew member?',
      message: `“${member.name}” will be removed from the CrewSync roster.`,
      detail: member.assignmentCount
        ? `${member.assignmentCount} assignment${member.assignmentCount === 1 ? '' : 's'} will remain but become unassigned.`
        : 'No event assignments reference this person.',
      confirmLabel: 'Remove crew member',
    });
    if (!ok) return;
    setBusy(member.id);
    try {
      await api('crew.removeOperator', member.id);
      toast.success('Crew member removed', `${member.name} was removed. Original event records remain.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not remove crew member', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  function openAssignment(assignment = null) {
    setAssignmentForm(
      assignment
        ? {
            id: assignment.id,
            operatorId: assignment.operatorId || '',
            role: assignment.role,
            roleLabel: assignment.roleLabel || '',
            notes: assignment.notes || '',
          }
        : EMPTY_ASSIGNMENT,
    );
    setAssignmentError('');
    setAssignmentOpen(true);
  }

  async function saveAssignment() {
    if (!event) return;
    if (assignmentForm.role === 'custom' && !assignmentForm.roleLabel.trim()) {
      setAssignmentError('A custom role label is required.');
      return;
    }
    setBusy('assignment');
    setAssignmentError('');
    try {
      await api('crew.saveAssignment', {
        ...(assignmentForm.id ? { id: assignmentForm.id } : {}),
        eventId: event.id,
        operatorId: assignmentForm.operatorId || null,
        role: assignmentForm.role,
        roleLabel: assignmentForm.role === 'custom' ? assignmentForm.roleLabel.trim() : '',
        notes: assignmentForm.notes,
      });
      setAssignmentOpen(false);
      toast.success(assignmentForm.id ? 'Assignment updated' : 'Crew assigned', event.title);
      await reload({ quiet: true });
    } catch (caught) {
      setAssignmentError(friendlyError(caught, 'The assignment could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function removeAssignment(assignment) {
    const ok = await confirm({
      title: 'Remove this assignment?',
      message: `${assignment.operatorName || 'The unassigned role'} will be removed from “${event.title}” as ${assignment.roleLabel || roleLabel(assignment.role)}.`,
      confirmLabel: 'Remove assignment',
    });
    if (!ok) return;
    setBusy(assignment.id);
    try {
      await api('crew.removeAssignment', assignment.id);
      toast.success('Assignment removed');
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not remove assignment', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function addChecklist(kind, title, owner) {
    if (!event || !title.trim()) return;
    setBusy(`checklist-${kind}`);
    try {
      await api('crew.saveChecklist', {
        eventId: event.id,
        kind,
        title: title.trim(),
        owner: owner.trim(),
        done: false,
      });
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Checklist item could not be added', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function toggleChecklist(item) {
    setBusy(item.id);
    try {
      await api('crew.saveChecklist', {
        id: item.id,
        eventId: event.id,
        kind: item.kind,
        title: item.title,
        owner: item.owner,
        done: !item.done,
      });
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Checklist could not be updated', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function removeChecklist(item) {
    setBusy(item.id);
    try {
      await api('crew.removeChecklist', item.id);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Checklist item could not be removed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader eyebrow="People & preparation" title="CrewSync" description="Reading the local crew roster and event assignments." />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="People & preparation" title="CrewSync unavailable" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const eventLocked = Boolean(event?.archived);

  return (
    <div className="page">
      <PageHeader
        eyebrow="People & preparation"
        title="CrewSync"
        description="Keep the production roster, event call sheets and setup checks together. Assignments describe people, not permissions — ShowFlow remains a local single-operator workspace."
        actions={
          <>
            <Button variant="secondary" as={Link} to="/events"><CalendarDays size={14} /> Events</Button>
            <Button variant="primary" onClick={openMemberCreate}><UserPlus size={14} /> Add crew member</Button>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="eyebrow">Active roster</div>
          <div className="stat-value">{activeCrew}<small> / {operators.length}</small></div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>available crew members</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Recorded calls</div>
          <div className="stat-value">{calls}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>assignments across events</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Selected event crew</div>
          <div className="stat-value">{event?.assignments?.length || 0}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{event ? event.title : 'No event selected'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Setup checks</div>
          <div className="stat-value">{setupDone}<small> / {setup.length}</small></div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>shutdown {shutdownDone}/{shutdown.length}</div>
        </div>
      </div>

      <div className="crew-layout">
        <div>
          <Panel className="crew-roster">
            <div className="crew-panel-head">
              <div>
                <div className="eyebrow">Roster</div>
                <div style={{ marginTop: 3, fontSize: 14, fontWeight: 560 }}>Crew directory</div>
              </div>
              <IconButton label="Add crew member" onClick={openMemberCreate}><Plus size={14} /></IconButton>
            </div>

            <div className="crew-roster-search">
              <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--fg-faint)' }} />
              <TextInput
                value={rosterSearch}
                onChange={(inEvent) => setRosterSearch(inEvent.target.value)}
                placeholder="Search name, role or contact"
                style={{ paddingLeft: 30 }}
                aria-label="Search crew roster"
              />
            </div>

            <div className="crew-member-list scroll-thin">
              {filteredOperators.length ? filteredOperators.map((member) => (
                <div key={member.id} className={cx('crew-member', !member.active && 'is-inactive')}>
                  <div className="crew-avatar" aria-hidden="true">{initials(member.name)}</div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span className="truncate" style={{ fontSize: 12.5, fontWeight: 560 }}>{member.name}</span>
                      {!member.active ? <Badge tone="neutral">Inactive</Badge> : null}
                    </div>
                    <div className="text-faint" style={{ marginTop: 2, fontSize: 10.5 }}>
                      {roleLabel(member.role)}
                      {member.contact ? ` · ${member.contact}` : ''}
                    </div>
                    <div className="mono" style={{ marginTop: 2, fontSize: 8.5, color: '#525d6a', letterSpacing: '.05em' }}>
                      {member.assignmentCount} CALL{member.assignmentCount === 1 ? '' : 'S'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label={`Edit ${member.name}`} onClick={() => openMemberEdit(member)}><Pencil size={12} /></IconButton>
                    <IconButton label={`Remove ${member.name}`} tone="danger" onClick={() => removeMember(member)} disabled={Boolean(busy)}>
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                </div>
              )) : (
                <div className="crew-roster-empty">
                  <UserX size={18} />
                  <p>{operators.length ? 'No crew match this search.' : 'No crew members yet. Add the first person to start building call sheets.'}</p>
                  {!operators.length ? <Button size="sm" variant="soft" onClick={openMemberCreate}><UserPlus size={12} /> Add crew</Button> : null}
                </div>
              )}
            </div>
          </Panel>

          <div className="notice-strip" style={{ marginTop: 12 }}>
            <ShieldCheck size={14} />
            <p>Crew records and call sheets are local to this computer. ShowFlow does not send invitations, notifications or crew messages.</p>
          </div>
        </div>

        <div>
          <Panel className="crew-callsheet">
            <div className="crew-panel-head">
              <div>
                <div className="eyebrow">Event call sheet</div>
                <div style={{ marginTop: 3, fontSize: 14, fontWeight: 560 }}>Assignments</div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedEventId}
                  onChange={(inEvent) => setSelectedEventId(inEvent.target.value)}
                  aria-label="Select event"
                  style={{ minWidth: 220 }}
                >
                  <option value="">Select an event…</option>
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>{item.title} · {EVENT_STATUS_META[item.status]?.label || item.status}</option>
                  ))}
                </Select>
                <Button size="sm" variant="secondary" onClick={() => openAssignment()} disabled={!event || eventLocked}>
                  <Plus size={12} /> Assign
                </Button>
              </div>
            </div>

            {event ? (
              <>
                <div className="crew-event-line">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={event.status} meta={EVENT_STATUS_META} />
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{formatEventWhen(event.eventDate, event.startTime)}</span>
                    {event.venue ? <span className="text-faint" style={{ fontSize: 10.5 }}>· {event.venue}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/events/${event.id}`} style={{ fontSize: 10.5 }}>Event workspace</Link>
                    <Link to={`/control/${event.id}`} style={{ fontSize: 10.5 }}>Control Room</Link>
                  </div>
                </div>

                {event.assignments.length ? (
                  <div className="crew-assignment-list">
                    {event.assignments.map((assignment) => (
                      <div key={assignment.id} className={cx('crew-assignment', !assignment.operatorId && 'is-open')}>
                        <div className="crew-avatar small" aria-hidden="true">
                          {assignment.operatorId ? initials(assignment.operatorName) : '—'}
                        </div>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span style={{ fontSize: 12.5, fontWeight: 550 }}>
                              {assignment.operatorName || 'Unassigned'}
                            </span>
                            <Badge tone={assignment.role === 'custom' ? 'violet' : 'cyan'}>
                              {assignment.roleLabel || roleLabel(assignment.role)}
                            </Badge>
                          </div>
                          <div className="text-faint" style={{ marginTop: 2, fontSize: 10.5 }}>
                            {assignment.operatorContact || 'No contact recorded'}
                          </div>
                          {assignment.notes ? <p className="crew-assignment-note">{assignment.notes}</p> : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <IconButton label="Edit assignment" onClick={() => openAssignment(assignment)}><Pencil size={12} /></IconButton>
                          <IconButton label="Remove assignment" tone="danger" onClick={() => removeAssignment(assignment)} disabled={Boolean(busy)}>
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Users size={19} />}
                    title="No crew assigned to this event"
                    description="Add roles to the call sheet so the running order can show who owns each cue."
                    action={<Button size="sm" variant="soft" onClick={() => openAssignment()} disabled={eventLocked}><Plus size={12} /> Assign crew</Button>}
                  />
                )}
              </>
            ) : (
              <EmptyState
                icon={<CalendarDays size={19} />}
                title="Choose an event"
                description={events.length ? 'Select an event to prepare its crew call sheet.' : 'Create an event first, then return to CrewSync to assign the team.'}
                action={!events.length ? <Button as={Link} to="/events?new=1" size="sm" variant="soft"><Plus size={12} /> Create an event</Button> : null}
              />
            )}
          </Panel>

          {event ? (
            <div className="crew-checklist-grid">
              {['setup', 'shutdown'].map((kind) => {
                const items = event.checklists.filter((item) => item.kind === kind);
                const done = items.filter((item) => item.done).length;
                return (
                  <ChecklistPanel
                    key={kind}
                    kind={kind}
                    items={items}
                    done={done}
                    locked={eventLocked}
                    busy={busy}
                    onAdd={addChecklist}
                    onToggle={toggleChecklist}
                    onRemove={removeChecklist}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={memberOpen}
        onClose={() => !busy && setMemberOpen(false)}
        title={editingMember ? 'Edit crew member' : 'Add crew member'}
        eyebrow="CrewSync roster"
        description="This directory is used only for planning and call sheets. It does not create user accounts."
        size="md"
        preventClose={busy === 'member'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMemberOpen(false)} disabled={busy === 'member'}>Cancel</Button>
            <Button variant="primary" onClick={saveMember} loading={busy === 'member'}>{editingMember ? 'Save changes' : 'Add crew member'}</Button>
          </>
        }
      >
        <MemberForm form={memberForm} setForm={setMemberForm} error={memberError} />
      </Modal>

      <Modal
        open={assignmentOpen}
        onClose={() => !busy && setAssignmentOpen(false)}
        title={assignmentForm.id ? 'Edit crew assignment' : 'Assign crew'}
        eyebrow={event?.title || 'CrewSync'}
        description="Assign a person and role. Cue-level operator names are set in the event workspace."
        size="md"
        preventClose={busy === 'assignment'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignmentOpen(false)} disabled={busy === 'assignment'}>Cancel</Button>
            <Button variant="primary" onClick={saveAssignment} loading={busy === 'assignment'}>{assignmentForm.id ? 'Save assignment' : 'Assign crew'}</Button>
          </>
        }
      >
        <AssignmentForm form={assignmentForm} setForm={setAssignmentForm} operators={operators} error={assignmentError} />
      </Modal>
    </div>
  );
}

function ChecklistPanel({ kind, items, done, locked, busy, onAdd, onToggle, onRemove }) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const percentage = items.length ? Math.round((done / items.length) * 100) : 0;

  async function submit(inEvent) {
    inEvent.preventDefault();
    if (!title.trim()) return;
    await onAdd(kind, title, owner);
    setTitle('');
    setOwner('');
  }

  return (
    <Panel className="crew-checklist">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{kind === 'setup' ? 'Before doors' : 'After the show'}</div>
          <div style={{ marginTop: 3, fontSize: 13, fontWeight: 560 }}>{CHECKLIST_KIND_META[kind].label}</div>
        </div>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>{done} / {items.length}</span>
      </div>
      <ProgressBar value={percentage} tone={percentage === 100 && items.length ? 'positive' : 'accent'} height={3} label={CHECKLIST_KIND_META[kind].label} />

      <div className="crew-checklist-items">
        {items.length ? items.map((item) => (
          <div key={item.id} className={cx('crew-checklist-item', item.done && 'is-done')}>
            <button
              type="button"
              className="crew-check"
              role="checkbox"
              aria-checked={item.done}
              aria-label={`${item.done ? 'Reopen' : 'Complete'} ${item.title}`}
              onClick={() => onToggle(item)}
              disabled={locked || Boolean(busy)}
            >
              {item.done ? <Check size={11} /> : null}
            </button>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="crew-check-title">{item.title}</div>
              {item.owner ? <div className="text-faint" style={{ fontSize: 9.5 }}>{item.owner}</div> : null}
            </div>
            <IconButton label={`Remove ${item.title}`} tone="danger" onClick={() => onRemove(item)} disabled={locked || Boolean(busy)}>
              <Trash2 size={11} />
            </IconButton>
          </div>
        )) : (
          <p className="input-hint" style={{ padding: '8px 0' }}>No items yet. Add the checks this crew must complete.</p>
        )}
      </div>

      <form className="crew-check-form" onSubmit={submit}>
        <TextInput value={title} onChange={(inEvent) => setTitle(inEvent.target.value)} placeholder="Add a check…" maxLength={200} disabled={locked} aria-label="New checklist item" />
        <TextInput value={owner} onChange={(inEvent) => setOwner(inEvent.target.value)} placeholder="Owner" maxLength={80} disabled={locked} aria-label="Checklist owner" style={{ maxWidth: 105 }} />
        <Button size="sm" variant="secondary" type="submit" disabled={locked || !title.trim() || Boolean(busy)}>
          <Plus size={12} />
        </Button>
      </form>
      {locked ? <p className="input-hint">Restore this archived event before editing its checks.</p> : null}
    </Panel>
  );
}
