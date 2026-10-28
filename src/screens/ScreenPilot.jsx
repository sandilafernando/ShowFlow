import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Monitor,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader, useNow } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import {
  CUE_TYPE_MAP,
  DISPLAY_LAYOUTS,
  DISPLAY_PURPOSE_META,
} from '@shared/enums.js';
import { formatDurationWords, formatRelativeTime, formatTimeOfDay } from '@shared/format.js';
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
  SectionHeading,
  Select,
  Switch,
  Textarea,
  TextInput,
} from '../components/ui.jsx';

const EMPTY_DISPLAY = {
  name: '',
  purpose: 'live',
  width: '1920',
  height: '1080',
  layout: 'full',
  notes: '',
  enabled: true,
};

const RESOLUTION_PRESETS = [
  { label: '1080p · 1920 × 1080', width: '1920', height: '1080' },
  { label: '4K UHD · 3840 × 2160', width: '3840', height: '2160' },
  { label: '720p · 1280 × 720', width: '1280', height: '720' },
  { label: 'WUXGA · 1920 × 1200', width: '1920', height: '1200' },
  { label: 'Portrait · 1080 × 1920', width: '1080', height: '1920' },
];

const TEST_PATTERNS = [
  { value: 'bars', label: 'Colour bars' },
  { value: 'grid', label: 'Alignment grid' },
  { value: 'white', label: 'White field' },
  { value: 'black', label: 'Black field' },
  { value: 'label', label: 'Display label' },
];

function DisplayForm({ form, setForm, error }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const presetValue = `${form.width}x${form.height}`;
  return (
    <div className="form-grid">
      {error ? <div className="input-error" role="alert">{error}</div> : null}
      <div className="form-grid form-grid-2">
        <Field label="Display name" required hint="A name the operator will recognise in the room.">
          <TextInput value={form.name} onChange={update('name')} maxLength={60} placeholder="e.g. Stage left projector" autoFocus />
        </Field>
        <Field label="Routing purpose" hint="Live and preview are routing labels. Both receive the same deliberately pushed cue content.">
          <Select value={form.purpose} onChange={update('purpose')}>
            <option value="live">Live output</option>
            <option value="preview">Preview</option>
          </Select>
        </Field>
      </div>

      <div className="form-grid form-grid-3">
        <Field label="Resolution preset">
          <Select
            value={RESOLUTION_PRESETS.some((preset) => `${preset.width}x${preset.height}` === presetValue) ? presetValue : 'custom'}
            onChange={(event) => {
              if (event.target.value === 'custom') return;
              const [width, height] = event.target.value.split('x');
              setForm((current) => ({ ...current, width, height }));
            }}
          >
            {RESOLUTION_PRESETS.map((preset) => (
              <option key={preset.label} value={`${preset.width}x${preset.height}`}>{preset.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </Select>
        </Field>
        <Field label="Width" required>
          <TextInput type="number" min={320} max={7680} value={form.width} onChange={update('width')} />
        </Field>
        <Field label="Height" required>
          <TextInput type="number" min={200} max={4320} value={form.height} onChange={update('height')} />
        </Field>
      </div>

      <Field label="Receiver layout" hint="The receiver reflows to fit this layout on the display device.">
        <Select value={form.layout} onChange={update('layout')}>
          {DISPLAY_LAYOUTS.map((layout) => <option key={layout.value} value={layout.value}>{layout.label} — {layout.description}</option>)}
        </Select>
      </Field>

      <Field label="Display notes" hint="Cabling, input, projector location or anything the crew should know.">
        <Textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={1000} placeholder="e.g. HDMI 2 on the auditorium projector. Check keystone before doors." />
      </Field>

      <div className="panel-inset" style={{ padding: 13 }}>
        <Switch
          checked={form.enabled}
          onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
          label="Accept receiver connections"
          description="Disabled displays keep their saved config but are excluded from pushes and cannot pair."
        />
      </div>
    </div>
  );
}

function DisplayCard({ display, onEdit, onLinks, onRegenerate, onDelete, onToggle, onOpen, onCopy, now, busy }) {
  const connected = display.connected;
  const ack = display.connection?.lastAcknowledged;
  return (
    <Panel className={`pilot-display${connected ? ' is-connected' : ''}${display.enabled ? '' : ' is-disabled'}`}>
      <div className="pilot-display-head">
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <div className={`pilot-display-icon${display.purpose === 'preview' ? ' preview' : ''}`}>
            {display.purpose === 'preview' ? <Eye size={15} /> : <MonitorPlay size={15} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 13, fontWeight: 570 }}>{display.name}</div>
            <div className="mono" style={{ marginTop: 2, fontSize: 8.5, color: 'var(--fg-faint)', letterSpacing: '.06em' }}>
              {display.width} × {display.height} · {display.layout.replaceAll('_', ' ').toUpperCase()}
            </div>
          </div>
        </div>
        <Badge tone={DISPLAY_PURPOSE_META[display.purpose]?.tone || 'neutral'}>
          {DISPLAY_PURPOSE_META[display.purpose]?.label || display.purpose}
        </Badge>
      </div>

      <div className="pilot-display-state">
        <span className={`pilot-connection${connected ? ' on' : ''}`}>
          <span className="dot" />
          {connected ? 'Receiver connected' : display.lastSeen ? 'Last seen' : 'Never connected'}
          {!connected && display.lastSeen ? <span className="mono" style={{ color: 'var(--fg-faint)' }}> · {formatRelativeTime(display.lastSeen, now)}</span> : null}
        </span>
        {!display.enabled ? <Badge tone="neutral">Disabled</Badge> : null}
      </div>

      <div className="pilot-code-row">
        <div>
          <div className="eyebrow">Pairing code</div>
          <div className="mono pilot-code">{display.pairingCode}</div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label={`Copy pairing code for ${display.name}`} onClick={() => onCopy(display.pairingCode, 'Pairing code copied')}>
            <Copy size={13} />
          </IconButton>
          <IconButton label={`Regenerate pairing code for ${display.name}`} onClick={() => onRegenerate(display)} disabled={Boolean(busy)}>
            <RefreshCw size={13} />
          </IconButton>
        </div>
      </div>

      <div className="pilot-display-meta">
        <div>
          <span className="eyebrow">Browser receipt</span>
          <span className="text-faint">{ack ? `${formatTimeOfDay(ack.receivedAt)} · receipt only` : 'No receipt in this session'}</span>
        </div>
        <div>
          <span className="eyebrow">Remote address</span>
          <span className="mono text-faint">{display.connection?.remoteAddress || '—'}</span>
        </div>
        {display.notes ? <p className="text-faint" style={{ lineHeight: '17px' }}>{display.notes}</p> : null}
      </div>

      <div className="pilot-display-actions">
        <Button size="sm" variant="soft" onClick={() => onLinks(display)}>
          <Link2 size={12} /> Receiver link
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onOpen(display)} disabled={!connected} title={!connected ? 'Connect a receiver before opening it here' : 'Open this display on this computer'}>
          <ExternalLink size={12} /> Open
        </Button>
        <div style={{ marginLeft: 'auto' }} className="flex items-center gap-1">
          <IconButton label={`Edit ${display.name}`} onClick={() => onEdit(display)}><Pencil size={13} /></IconButton>
          <IconButton label={display.enabled ? `Disable ${display.name}` : `Enable ${display.name}`} onClick={() => onToggle(display)}>
            <Power size={13} />
          </IconButton>
          <IconButton label={`Delete ${display.name}`} tone="danger" onClick={() => onDelete(display)}><Trash2 size={13} /></IconButton>
        </div>
      </div>
    </Panel>
  );
}

export default function ScreenPilot() {
  const { toast, confirm } = useApp();
  const now = useNow(15000);
  const [server, setServer] = useState(null);
  const [items, setItems] = useState([]);
  const [activeEventId, setActiveEventId] = useState('');
  const [busy, setBusy] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DISPLAY);
  const [formError, setFormError] = useState('');
  const [linksOpen, setLinksOpen] = useState(false);
  const [links, setLinks] = useState(null);
  const [linksFor, setLinksFor] = useState(null);
  const [testTarget, setTestTarget] = useState('');
  const [testPattern, setTestPattern] = useState('bars');
  const [pushResult, setPushResult] = useState(null);

  const { data, error, loading, reload } = useLoader(async () => {
    const [displays, events] = await Promise.all([
      api('displays.list'),
      api('events.list', { limit: 300 }),
    ]);
    const active = events.filter((event) => event.status === 'live' || event.status === 'rehearsal');
    const chosen = active.find((event) => event.id === activeEventId) || active[0] || null;
    const activeEvent = chosen ? await api('events.get', chosen.id) : null;
    return { displays, events, active, activeEvent };
  }, [activeEventId]);

  useEffect(() => {
    if (!data?.displays) return;
    setServer(data.displays.server);
    setItems(data.displays.items);
  }, [data]);

  useEffect(() => {
    if (!activeEventId && data?.activeEvent?.id) setActiveEventId(data.activeEvent.id);
  }, [activeEventId, data?.activeEvent?.id]);

  useEffect(() => {
    if (!window.showflow?.displays?.onServerStatus) return undefined;
    const unsubscribe = window.showflow.displays.onServerStatus((status) => {
      setServer(status);
      setItems((current) => current.map((display) => {
        const connection = status.connections.find((entry) => entry.displayId === display.id) || null;
        return {
          ...display,
          connected: Boolean(connection),
          lastSeen: connection?.lastSeen || display.lastSeen,
          connection,
        };
      }));
    });
    return () => unsubscribe?.();
  }, []);

  const activeEvent = data?.activeEvent || null;
  const activeEvents = data?.active || [];
  const liveCue = useMemo(() => {
    if (!activeEvent?.liveCueId) return null;
    return activeEvent.cues.find((cue) => cue.id === activeEvent.liveCueId) || null;
  }, [activeEvent]);
  const nextCue = useMemo(() => {
    if (!activeEvent) return null;
    const armed = activeEvent.armedCueId
      ? activeEvent.cues.find((cue) => cue.id === activeEvent.armedCueId)
      : null;
    if (armed && armed.id !== liveCue?.id) return armed;
    if (!liveCue) return armed || activeEvent.cues[0] || null;
    const index = activeEvent.cues.findIndex((cue) => cue.id === liveCue.id);
    return activeEvent.cues[index + 1] || null;
  }, [activeEvent, liveCue]);
  const enabled = items.filter((display) => display.enabled);
  const connected = enabled.filter((display) => display.connected);
  const previewCount = enabled.filter((display) => display.purpose === 'preview').length;
  const liveCount = enabled.filter((display) => display.purpose === 'live').length;
  const running = Boolean(server?.running);

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message, 'Copied to the clipboard.');
    } catch {
      toast.error('Could not copy automatically', 'Select the value and copy it manually.');
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_DISPLAY);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(display) {
    setEditing(display);
    setForm({
      name: display.name,
      purpose: display.purpose,
      width: String(display.width),
      height: String(display.height),
      layout: display.layout,
      notes: display.notes || '',
      enabled: display.enabled,
    });
    setFormError('');
    setFormOpen(true);
  }

  async function saveDisplay() {
    if (!form.name.trim()) {
      setFormError('A display name is required.');
      return;
    }
    setBusy('save-display');
    setFormError('');
    try {
      await api('displays.save', {
        ...(editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        purpose: form.purpose,
        width: Number(form.width),
        height: Number(form.height),
        layout: form.layout,
        notes: form.notes,
        enabled: form.enabled,
      });
      setFormOpen(false);
      toast.success(editing ? 'Display updated' : 'Display added', editing ? form.name : 'Copy a receiver link to the display device when you are ready.');
      await reload({ quiet: true });
    } catch (caught) {
      setFormError(friendlyError(caught, 'The display could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function toggleDisplay(display) {
    setBusy(display.id);
    try {
      await api('displays.save', {
        id: display.id,
        name: display.name,
        purpose: display.purpose,
        width: display.width,
        height: display.height,
        layout: display.layout,
        notes: display.notes,
        enabled: !display.enabled,
      });
      toast.success(display.enabled ? 'Display disabled' : 'Display enabled', display.name);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not update display', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function deleteDisplay(display) {
    const ok = await confirm({
      title: 'Delete this display?',
      message: `“${display.name}” will be removed and any connected receiver will be disconnected.`,
      detail: 'This changes ShowFlow configuration only. It does not affect a projector, computer or browser on the network.',
      confirmLabel: 'Delete display',
    });
    if (!ok) return;
    setBusy(display.id);
    try {
      await api('displays.remove', display.id);
      toast.success('Display deleted', display.name);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not delete display', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function regenerate(display) {
    const ok = await confirm({
      title: 'Regenerate the pairing code?',
      message: `Any receiver currently connected as “${display.name}” will be disconnected. A new six-digit code will be required.`,
      detail: 'This does not stop the display device or change its physical input.',
      confirmLabel: 'Regenerate code',
      tone: 'warning',
    });
    if (!ok) return;
    setBusy(display.id);
    try {
      const updated = await api('displays.regenerateCode', display.id);
      toast.success('Pairing code regenerated', `The new code for ${display.name} is ${updated.pairingCode}.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Could not regenerate code', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function openLinks(display) {
    setLinksFor(display || null);
    setLinks(null);
    setLinksOpen(true);
    try {
      const result = await api('displays.links', display ? { displayId: display.id } : {});
      setLinks(result);
    } catch (caught) {
      setLinks({ error: friendlyError(caught) });
    }
  }

  async function openReceiver(display) {
    setBusy(display.id);
    try {
      await api('displays.openReceiver', display.id);
    } catch (caught) {
      toast.error('Receiver could not be opened', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function startServer() {
    setBusy('server');
    try {
      const status = await api('displays.serverStart');
      setServer(status);
      toast.success('Receiver server started', `Listening on port ${status.port}. Receivers can now pair with their links.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Receiver server could not start', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function stopServer() {
    const ok = await confirm({
      title: 'Stop the receiver server?',
      message: 'Every paired receiver will be disconnected and no cue content can be delivered until the server is started again.',
      detail: 'Projectors and display computers are not switched off. Their browsers will show a disconnected overlay.',
      confirmLabel: 'Stop server',
      tone: 'warning',
    });
    if (!ok) return;
    setBusy('server');
    try {
      const status = await api('displays.serverStop');
      setServer(status);
      toast.success('Receiver server stopped', 'Connected receivers were disconnected.');
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Receiver server could not stop', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function push(targetLabel) {
    if (!activeEvent) {
      toast.warning('No active session', 'Start a rehearsal or live session in the Control Room before pushing screen content.');
      return;
    }
    setBusy(`push-${targetLabel}`);
    setPushResult(null);
    try {
      const target = targetLabel === 'all' ? { all: true } : { purpose: targetLabel };
      const result = await api('displays.push', { eventId: activeEvent.id, target });
      const message = result.targets === 0
        ? 'No enabled displays match that routing purpose.'
        : `${result.delivered.length} of ${result.targets} receiver${result.targets === 1 ? '' : 's'} received the content${result.offline.length ? ` · ${result.offline.length} offline` : ''}. Browser receipt only — verify the projector output.`;
      setPushResult({ tone: result.delivered.length ? 'positive' : 'warning', message });
      if (result.delivered.length) {
        toast.success('Screen content sent', message);
      } else {
        toast.warning('No receiver accepted the content', message);
      }
      await reload({ quiet: true });
    } catch (caught) {
      const message = friendlyError(caught);
      setPushResult({ tone: 'warning', message });
      toast.error('Screen content not sent', message);
    } finally {
      setBusy('');
    }
  }

  async function sendTest() {
    setBusy('test');
    try {
      const result = await api('displays.test', {
        ...(testTarget ? { displayId: testTarget } : {}),
        pattern: testPattern,
      });
      toast.success(
        'Test pattern sent',
        result.targets === 0
          ? 'No enabled displays were targeted.'
          : `${result.delivered.length} of ${result.targets} receiver${result.targets === 1 ? '' : 's'} received the test. Confirm it visually.`,
      );
    } catch (caught) {
      toast.error('Test pattern not sent', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function blackout() {
    const ok = await confirm({
      title: 'Black out receivers?',
      message: 'Every targeted ShowFlow receiver browser will be covered with black until content is sent again.',
      detail: 'This does not black out a projector directly, change its input or stop playback software. Verify the room visually.',
      confirmLabel: 'Send blackout',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('blackout');
    try {
      const result = await api('displays.blackout', testTarget ? { displayId: testTarget } : {});
      toast.warning(
        'Blackout sent',
        result.targets === 0
          ? 'No enabled displays were targeted.'
          : `${result.delivered.length} of ${result.targets} receiver${result.targets === 1 ? '' : 's'} received the blackout. Verify the projector output.`,
      );
    } catch (caught) {
      toast.error('Blackout not sent', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader eyebrow="Screen delivery" title="ScreenPilot" description="Reading receiver configuration and the local network service." />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Screen delivery" title="ScreenPilot unavailable" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Screen delivery"
        title="ScreenPilot"
        description="Pair LAN receivers, route preview and live displays, and keep delivery receipts honest. A receiver acknowledgement confirms browser receipt only — never projector output."
        actions={
          <>
            <Button variant="secondary" onClick={() => openLinks(null)}><Link2 size={14} /> Server addresses</Button>
            <Button variant="primary" onClick={openCreate}><Plus size={14} /> Add display</Button>
          </>
        }
      />

      <Panel className={`pilot-hero${running ? ' is-running' : ''}`}>
        <div className="pilot-hero-main">
          <div className="flex items-start gap-4">
            <div className={`pilot-server-icon${running ? ' on' : ''}`}>
              <Server size={23} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="flex wrap items-center gap-2">
                <span className={`pilot-status-dot${running ? ' on' : ''}`} />
                <span className="eyebrow" style={{ color: running ? 'var(--positive)' : 'var(--fg-faint)' }}>
                  {running ? 'Receiver service online' : 'Receiver service stopped'}
                </span>
                {running ? <Badge tone="green" dot>Listening</Badge> : <Badge tone="neutral">Offline</Badge>}
              </div>
              <h2 style={{ marginTop: 7, fontSize: 20, lineHeight: '25px', letterSpacing: '-.025em', fontWeight: 560 }}>
                {running ? `Screen delivery on port ${server.port}` : 'No receivers can connect yet'}
              </h2>
              <p className="text-muted" style={{ marginTop: 5, fontSize: 12, lineHeight: '18px', maxWidth: '70ch' }}>
                {running
                  ? 'This local HTTP and WebSocket service is bound to your LAN. Only paired receivers with a valid display code can view cue information.'
                  : 'The receiver server is never started automatically. Start it deliberately when the production network is ready.'}
              </p>
              {running && server.localBaseUrl ? (
                <div className="flex wrap items-center gap-2" style={{ marginTop: 10 }}>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>{server.localBaseUrl}</span>
                  <IconButton label="Copy local receiver server address" onClick={() => copyText(server.localBaseUrl, 'Server address copied')}>
                    <Copy size={12} />
                  </IconButton>
                  {server.lanBaseUrls?.length ? (
                    <span className="mono text-faint" style={{ fontSize: 9 }}>{server.lanBaseUrls.length} LAN address{server.lanBaseUrls.length === 1 ? '' : 'es'}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex wrap items-center gap-2" style={{ marginTop: 16 }}>
            {running ? (
              <Button variant="secondary" onClick={stopServer} loading={busy === 'server'} disabled={Boolean(busy)}>
                <Square size={13} /> Stop receiver server
              </Button>
            ) : (
              <Button variant="primary" onClick={startServer} loading={busy === 'server'} disabled={Boolean(busy)}>
                <Play size={13} /> Start receiver server
              </Button>
            )}
            <Button variant="ghost" onClick={() => reload({ quiet: true })} disabled={Boolean(busy)}>
              <RefreshCw size={13} /> Refresh status
            </Button>
            <Button variant="ghost" as={Link} to="/settings"><Power size={13} /> Receiver port</Button>
          </div>
        </div>

        <div className="pilot-hero-stats">
          <div className="pilot-stat">
            <span className="eyebrow">Connected</span>
            <span className="pilot-stat-value">{connected.length}<small> / {enabled.length}</small></span>
            <span className="text-faint">enabled receivers</span>
          </div>
          <div className="pilot-stat">
            <span className="eyebrow">Live outputs</span>
            <span className="pilot-stat-value">{liveCount}</span>
            <span className="text-faint">routing purpose</span>
          </div>
          <div className="pilot-stat">
            <span className="eyebrow">Preview</span>
            <span className="pilot-stat-value">{previewCount}</span>
            <span className="text-faint">routing purpose</span>
          </div>
          <div className="pilot-stat">
            <span className="eyebrow">Server</span>
            <span className="pilot-stat-value">{running ? server.port : '—'}</span>
            <span className="text-faint">{running ? 'TCP port' : 'not listening'}</span>
          </div>
        </div>
      </Panel>

      <div className={`notice-strip${running ? '' : ' is-warning'}`} style={{ marginTop: 12 }}>
        {running ? <ShieldCheck size={14} /> : <WifiOff size={14} />}
        <p>
          {running
            ? 'Anyone with a receiver link can view that display’s cue information on the production network. Share links only with the display computers.'
            : 'Start the server only on a trusted production network. ShowFlow refuses unpaired receivers, but it cannot secure a compromised LAN.'}
        </p>
      </div>

      <div className="page-section">
        <SectionHeading
          eyebrow="Delivery"
          title="Send the active cue state"
          description="Pushing is deliberate. Screen content can only be sent while an event is in rehearsal or live."
          actions={<Button as={Link} to="/control" variant="ghost" size="sm">Control Room <ArrowRight size={13} /></Button>}
        />
        <div className="pilot-delivery-grid">
          <Panel className="pilot-session">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="eyebrow">Active session</div>
                {activeEvents.length ? (
                  <Select
                    value={activeEvent?.id || ''}
                    onChange={(event) => {
                      setActiveEventId(event.target.value);
                      setPushResult(null);
                    }}
                    style={{ marginTop: 7, minWidth: 270 }}
                    aria-label="Active session to send"
                  >
                    {activeEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title} — {event.status.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-faint)' }}>No rehearsal or live session</div>
                )}
              </div>
              {activeEvent ? (
                <Badge tone={activeEvent.status === 'live' ? 'red' : 'amber'} dot live={activeEvent.status === 'live'}>
                  {activeEvent.status === 'live' ? 'Live session' : 'Rehearsal · not live'}
                </Badge>
              ) : null}
            </div>

            {activeEvent ? (
              <>
                <div className={`pilot-preview${activeEvent.status === 'rehearsal' ? ' rehearsal' : ''}`}>
                  <div className="pilot-preview-top">
                    <span className="eyebrow">{activeEvent.status === 'rehearsal' ? 'Rehearsal payload' : 'Live payload'}</span>
                    <span className="mono" style={{ fontSize: 8.5, color: 'var(--fg-faint)' }}>{activeEvent.title}</span>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div style={{ minWidth: 0 }}>
                      <div className="eyebrow" style={{ color: liveCue ? 'var(--accent)' : 'var(--fg-faint)' }}>
                        {liveCue ? `Current · ${CUE_TYPE_MAP[liveCue.type]?.label || liveCue.type}` : 'Standby'}
                      </div>
                      <div className="pilot-preview-title">{liveCue?.title || 'No cue is live'}</div>
                      {liveCue?.durationSeconds ? <div className="text-faint" style={{ fontSize: 10.5 }}>{formatDurationWords(liveCue.durationSeconds)}</div> : null}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="eyebrow">Up next</div>
                      <div style={{ marginTop: 5, fontSize: 13, color: 'var(--fg-muted)' }}>{nextCue?.title || 'End of running order'}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2" style={{ marginTop: 13 }}>
                  <Button variant="soft" onClick={() => push('preview')} loading={busy === 'push-preview'} disabled={Boolean(busy) || !running}>
                    <Eye size={13} /> Preview screens
                  </Button>
                  <Button variant={activeEvent.status === 'live' ? 'danger' : 'secondary'} onClick={() => push('live')} loading={busy === 'push-live'} disabled={Boolean(busy) || !running}>
                    <Send size={13} /> Live screens
                  </Button>
                  <Button variant="ghost" onClick={() => push('all')} loading={busy === 'push-all'} disabled={Boolean(busy) || !running}>
                    All screens
                  </Button>
                </div>
                {!running ? <p className="input-hint" style={{ marginTop: 7 }}>Start the receiver server to enable delivery.</p> : null}
              </>
            ) : (
              <div className="pilot-no-session">
                <Radio size={19} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 550 }}>Prepare an event first</div>
                  <p className="text-faint" style={{ marginTop: 2, fontSize: 11.5, lineHeight: '17px' }}>
                    ScreenPilot only mirrors a deliberate rehearsal or live session. It never invents cue content or replays an old message.
                  </p>
                  <Button as={Link} to="/control" size="sm" variant="soft" style={{ marginTop: 10 }}>
                    Open Control Room <ArrowRight size={12} />
                  </Button>
                </div>
              </div>
            )}

            {pushResult ? (
              <div className={`pilot-result ${pushResult.tone || 'neutral'}`} role="status">
                {pushResult.tone === 'positive' ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
                <p>{pushResult.message}</p>
              </div>
            ) : null}
          </Panel>

          <Panel className="pilot-test-panel">
            <div className="eyebrow">Receiver diagnostics</div>
            <h3 style={{ marginTop: 5, fontSize: 14, fontWeight: 560 }}>Test pattern & blackout</h3>
            <p className="text-faint" style={{ marginTop: 3, fontSize: 11, lineHeight: '17px' }}>
              These actions go straight to receivers and do not change the running order. A test confirms browser receipt, not projector focus or input.
            </p>

            <div className="form-grid" style={{ marginTop: 14, gap: 10 }}>
              <Field label="Target display">
                <Select value={testTarget} onChange={(event) => setTestTarget(event.target.value)}>
                  <option value="">All enabled displays</option>
                  {enabled.map((display) => (
                    <option key={display.id} value={display.id}>{display.name} · {display.purpose}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Test pattern">
                <Select value={testPattern} onChange={(event) => setTestPattern(event.target.value)}>
                  {TEST_PATTERNS.map((pattern) => <option key={pattern.value} value={pattern.value}>{pattern.label}</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 11 }}>
              <Button size="sm" variant="secondary" onClick={sendTest} loading={busy === 'test'} disabled={Boolean(busy) || !running || !enabled.length}>
                <Monitor size={13} /> Send test
              </Button>
              <Button size="sm" variant="danger" onClick={blackout} loading={busy === 'blackout'} disabled={Boolean(busy) || !running || !enabled.length}>
                <Square size={12} /> Blackout
              </Button>
            </div>
            <div className="hairline" style={{ margin: '14px 0' }} />
            <div className="pilot-diagnostics">
              <div>
                <span className="eyebrow">Receiver links</span>
                <span>{server?.lanBaseUrls?.length ? `${server.lanBaseUrls.length} LAN address${server.lanBaseUrls.length === 1 ? '' : 'es'} available` : 'Start the server for links'}</span>
              </div>
              <div>
                <span className="eyebrow">Transport</span>
                <span>HTTP receiver + WebSocket</span>
              </div>
              <div>
                <span className="eyebrow">Acknowledgement</span>
                <span>Browser receipt only</span>
              </div>
            </div>
            <p className="input-hint" style={{ marginTop: 10 }}>
              The <span className="mono">/health</span> endpoint is available on the receiver server for LAN diagnostics. Open it from the display network if needed.
            </p>
          </Panel>
        </div>
      </div>

      <div className="page-section">
        <SectionHeading
          eyebrow={`${items.length} configured display${items.length === 1 ? '' : 's'}`}
          title="Receivers"
          description="Preview and live are routing labels for deliberate pushes; both receive the same cue payload. Last seen is not proof that the projector is on."
          actions={<Button size="sm" variant="secondary" onClick={openCreate}><Plus size={13} /> Add display</Button>}
        />
        {items.length ? (
          <div className="pilot-display-grid">
            {items.map((display) => (
              <DisplayCard
                key={display.id}
                display={display}
                now={now}
                busy={busy}
                onEdit={openEdit}
                onLinks={openLinks}
                onRegenerate={regenerate}
                onDelete={deleteDisplay}
                onToggle={toggleDisplay}
                onOpen={openReceiver}
                onCopy={copyText}
              />
            ))}
          </div>
        ) : (
          <Panel>
            <EmptyState
              icon={<MonitorPlay size={20} />}
              title="No displays configured"
              description="Add the projector or display computer, then copy its receiver link to a browser on the production network."
              action={<Button size="sm" variant="soft" onClick={openCreate}><Plus size={13} /> Add the first display</Button>}
            />
          </Panel>
        )}
      </div>

      <div className="control-safety-note">
        <ShieldCheck size={15} />
        <p>
          <strong>What ScreenPilot can and cannot confirm.</strong> A receiver acknowledgement means the browser received a message.
          It does not prove the projector is powered, on the correct input, in focus, unmuted or showing the intended output.
          A human must verify every display in the room.
        </p>
      </div>

      <Modal
        open={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editing ? 'Edit display' : 'Add display'}
        eyebrow="ScreenPilot configuration"
        description="Display settings describe the physical output. Pairing still requires the six-digit receiver link."
        size="lg"
        preventClose={Boolean(busy)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={Boolean(busy)}>Cancel</Button>
            <Button variant="primary" onClick={saveDisplay} loading={busy === 'save-display'}>
              {editing ? 'Save display' : 'Add display'}
            </Button>
          </>
        }
      >
        <DisplayForm form={form} setForm={setForm} error={formError} />
      </Modal>

      <Modal
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
        title={linksFor ? `Receiver link · ${linksFor.name}` : 'Receiver server addresses'}
        eyebrow="ScreenPilot"
        description="Open this link in a browser on the display computer. Treat the link as a credential for that display."
        size="lg"
      >
        {links?.error ? <div className="input-error" role="alert">{links.error}</div> : null}
        {!links ? <LoadingBlock rows={3} /> : null}
        {links && !links.error ? (
          <div className="form-grid">
            {links.links?.length ? links.links.map((link) => {
              const url = link.receiverUrl || link.healthUrl;
              return (
                <div key={link.url} className="pilot-link-row">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <Wifi size={13} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 12, fontWeight: 550 }}>{link.label}</span>
                      {link.receiverUrl ? <Badge tone="green">Paired link</Badge> : <Badge tone="neutral">Health only</Badge>}
                    </div>
                    <div className="mono truncate" style={{ marginTop: 5, fontSize: 10, color: 'var(--fg-muted)' }} title={url}>{url}</div>
                    <div className="mono truncate" style={{ marginTop: 2, fontSize: 8.5, color: '#505b68' }} title={link.healthUrl}>{link.healthUrl}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={link.receiverUrl ? 'Copy receiver link for the display device' : 'Copy health URL'}
                      onClick={() => copyText(url, link.receiverUrl ? 'Receiver link copied — paste it into the display browser' : 'Health URL copied')}
                    >
                      <Copy size={13} />
                    </IconButton>
                  </div>
                </div>
              );
            }) : (
              <EmptyState
                icon={<WifiOff size={19} />}
                title="The receiver server is stopped"
                description="Start the receiver server first. ShowFlow never starts it automatically."
                action={<Button size="sm" variant="primary" onClick={startServer} loading={busy === 'server'}><Play size={12} /> Start receiver server</Button>}
              />
            )}
            {links.display ? (
              <div className="flex flex-wrap items-center justify-between gap-3" style={{ paddingTop: 6 }}>
                <div>
                  <div className="eyebrow">Pairing code</div>
                  <div className="mono" style={{ marginTop: 3, fontSize: 17, letterSpacing: '.14em' }}>{links.display.pairingCode}</div>
                </div>
                <Button size="sm" variant="soft" onClick={() => copyText(links.display.pairingCode, 'Pairing code copied')}>
                  <Copy size={12} /> Copy code
                </Button>
              </div>
            ) : null}
            {links.note ? <p className="input-hint">{links.note}</p> : null}
            <div className="notice-strip is-warning">
              <TriangleAlert size={14} />
              <p>Never post receiver links in a public channel. The link grants access to cue information for that display on the local network.</p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
