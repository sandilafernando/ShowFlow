import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Cable,
  CheckCircle2,
  Database,
  ExternalLink,
  FolderOpen,
  HardDrive,
  History,
  MonitorPlay,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import { formatBytes, formatDateTime, formatRelativeTime } from '@shared/format.js';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  Select,
  Switch,
  TabNav,
  TextInput,
  cx,
} from '../components/ui.jsx';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'screens', label: 'Screens & network' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'data', label: 'Data & backups' },
];

const TAB_VALUES = TABS.map((tab) => tab.value);

function SettingsSection({ eyebrow, title, description, children, actions }) {
  return (
    <Panel className="settings-section">
      <div className="settings-section-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="settings-section-body">{children}</div>
    </Panel>
  );
}

function SettingsRow({ icon: Icon, title, children, className = '' }) {
  return (
    <div className={cx('settings-row', className)}>
      {Icon ? <div className="settings-row-icon"><Icon size={15} /></div> : null}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="settings-row-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function Settings() {
  const { settings, setSettings, appInfo, toast, confirm } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab = TAB_VALUES.includes(rawTab) ? rawTab : 'general';

  const { data, error, loading, reload } = useLoader(async () => {
    const [integration, backup, receiver] = await Promise.all([
      api('integrations.get'),
      api('backup.stats'),
      api('displays.serverStatus'),
    ]);
    return { integration, backup, receiver };
  }, []);

  const [general, setGeneral] = useState({ operatorName: '', defaultVenue: '' });
  const [screenPort, setScreenPort] = useState('');
  const [backupForm, setBackupForm] = useState({ autoBackup: true, backupRetention: '8' });
  const [integrationForm, setIntegrationForm] = useState({
    mode: 'mock',
    host: '127.0.0.1',
    port: '7000',
    enabled: false,
  });
  const [busy, setBusy] = useState('');
  const [restored, setRestored] = useState(null);

  useEffect(() => {
    if (!settings) return;
    setGeneral({
      operatorName: settings.operatorName || '',
      defaultVenue: settings.defaultVenue || '',
    });
    setScreenPort(String(settings.receiverPort || ''));
    setBackupForm({
      autoBackup: Boolean(settings.autoBackup),
      backupRetention: String(settings.backupRetention || 8),
    });
  }, [settings]);

  useEffect(() => {
    const config = data?.integration?.config;
    if (!config) return;
    setIntegrationForm({
      mode: config.mode,
      host: config.host,
      port: String(config.port),
      enabled: Boolean(config.enabled),
    });
  }, [data?.integration?.config]);

  function setTab(value) {
    setSearchParams({ tab: value }, { replace: true });
  }

  async function applySettings(patch, successMessage) {
    const result = await api('settings.update', patch);
    setSettings(result.settings);
    if (result.warning) toast.warning('Settings saved with a warning', result.warning);
    else toast.success('Settings saved', successMessage);
    return result;
  }

  async function saveGeneral() {
    setBusy('general');
    try {
      await applySettings(
        { operatorName: general.operatorName.trim(), defaultVenue: general.defaultVenue.trim() },
        'The operator name is used for local activity records.',
      );
    } catch (caught) {
      toast.error('Settings could not be saved', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function savePort() {
    setBusy('port');
    try {
      const result = await applySettings(
        { receiverPort: Number(screenPort) },
        data?.receiver?.running
          ? `The receiver server is restarting on port ${result.settings.receiverPort}.`
          : 'The new port will be used the next time the receiver server starts.',
      );
      await reload({ quiet: true });
      return result;
    } catch (caught) {
      toast.error('Receiver port could not be saved', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function saveBackupSettings() {
    setBusy('backup-settings');
    try {
      await applySettings(
        { autoBackup: backupForm.autoBackup, backupRetention: Number(backupForm.backupRetention) },
        'Automatic backups are created into the local ShowFlow data folder.',
      );
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Backup settings could not be saved', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function saveIntegration() {
    setBusy('integration');
    try {
      await api('integrations.save', {
        mode: integrationForm.mode,
        host: integrationForm.host.trim(),
        port: Number(integrationForm.port),
        enabled: integrationForm.enabled,
      });
      toast.success('Integration saved', 'No command is sent by saving. Sends happen only on a deliberate GO in a LIVE event.');
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Integration could not be saved', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function testIntegration() {
    setBusy('test');
    try {
      const result = await api('integrations.test');
      if (result.ok) {
        toast.success(
          result.simulated ? 'Mock integration is ready' : 'Transport test passed',
          result.detail || (result.simulated ? 'Nothing was sent to production equipment.' : 'No OSC datagram was sent.'),
        );
      } else {
        toast.error('Integration test failed', result.detail || 'The configured target could not be reached.');
      }
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Integration test failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function openDocumentation(url) {
    if (!url) return;
    try {
      await api('app.openExternal', url);
    } catch (caught) {
      toast.error('Documentation link could not be opened', friendlyError(caught));
    }
  }

  async function createBackup() {
    setBusy('backup');
    try {
      const result = await api('backup.create');
      if (result.canceled) return;
      toast.success('Backup created', `${formatBytes(result.sizeBytes)} written. Keep a copy off this computer for disaster recovery.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Backup could not be created', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function restoreBackup() {
    const ok = await confirm({
      title: 'Restore a ShowFlow backup?',
      message: 'ShowFlow will ask you to choose a backup and confirm the replacement inside a native dialog.',
      detail: 'Restoring replaces the local database. A safety backup is created first. Media files, logs outside the database and backups are not deleted.',
      confirmLabel: 'Choose backup',
      tone: 'warning',
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const result = await api('backup.restore');
      if (result.canceled) return;
      setRestored(result);
      toast.success('Backup restored', 'Reload the interface to read the restored data.');
    } catch (caught) {
      toast.error('Restore failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function checkIntegrity() {
    setBusy('integrity');
    try {
      const result = await api('backup.integrity');
      if (String(result.integrity).toLowerCase() === 'ok') {
        toast.success('Database integrity check passed', `${formatBytes(result.fileSize)} · last saved ${formatRelativeTime(result.lastSaveAt)}.`);
      } else {
        toast.warning('Integrity check returned a warning', String(result.integrity));
      }
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Integrity check failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function openDataFolder() {
    try {
      await api('app.openDataFolder');
    } catch (caught) {
      toast.error('Data folder could not be opened', friendlyError(caught));
    }
  }

  if (!settings) return null;

  const integration = data?.integration;
  const config = integration?.config;
  const backup = data?.backup;
  const receiver = data?.receiver;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="Local preferences, the ScreenPilot receiver, the verified Resolume OSC surface and database backups. Nothing is applied to production equipment from this screen."
        actions={
          <>
            <Button variant="ghost" as={Link} to="/help"><ShieldCheck size={14} /> Safety guide</Button>
            <Button variant="secondary" as={Link} to="/control"><MonitorPlay size={14} /> Control Room</Button>
          </>
        }
      />

      <div className="settings-tabs">
        <TabNav tabs={TABS} value={tab} onChange={setTab} ariaLabel="Settings sections" />
        <span className="mono" style={{ fontSize: 9, color: 'var(--fg-faint)', letterSpacing: '.06em' }}>
          SAVED LOCALLY · NO CLOUD SYNC
        </span>
      </div>

      {loading ? <LoadingBlock rows={5} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      {!loading && !error && tab === 'general' ? (
        <div className="settings-stack">
          <SettingsSection
            eyebrow="Identity"
            title="Operator & venue"
            description="The operator name is attached to local history entries. The default venue prefills new events."
            actions={<Button variant="primary" size="sm" onClick={saveGeneral} loading={busy === 'general'}><Save size={13} /> Save</Button>}
          >
            <div className="form-grid form-grid-2">
              <Field label="Operator name" hint="e.g. the show caller or duty technician.">
                <TextInput
                  value={general.operatorName}
                  onChange={(event) => setGeneral((current) => ({ ...current, operatorName: event.target.value }))}
                  maxLength={80}
                  placeholder="Operator"
                />
              </Field>
              <Field label="Default venue" hint="Prefilled when creating a new event.">
                <TextInput
                  value={general.defaultVenue}
                  onChange={(event) => setGeneral((current) => ({ ...current, defaultVenue: event.target.value }))}
                  maxLength={160}
                  placeholder="e.g. College Auditorium"
                />
              </Field>
            </div>
          </SettingsSection>

          <SettingsSection
            eyebrow="This installation"
            title="Application details"
            description="ShowFlow stores its database under the Electron user data folder. Uninstalling the app does not delete that folder."
          >
            <SettingsRow icon={HardDrive} title="Local data folder">
              <p className="settings-path mono">{appInfo?.userDataPath || 'Unavailable'}</p>
              <Button size="sm" variant="ghost" onClick={openDataFolder} style={{ marginTop: 6, paddingLeft: 0 }}>
                <FolderOpen size={12} /> Open folder
              </Button>
            </SettingsRow>
            <SettingsRow icon={ShieldCheck} title="Privacy & network">
              <p className="settings-note">
                No telemetry, analytics or cloud account. The app opens a LAN receiver only when you start it in
                ScreenPilot, and sends OSC only for a mapped cue invoked during a LIVE session.
              </p>
            </SettingsRow>
            <SettingsRow icon={Server} title="Build">
              <div className="settings-facts">
                <span>Version</span><span className="mono">{appInfo?.version || '1.0.0'}</span>
                <span>Electron</span><span className="mono">{appInfo?.versions?.electron || '—'}</span>
                <span>Platform</span><span className="mono">{appInfo?.platform || '—'} / {appInfo?.arch || '—'}</span>
              </div>
            </SettingsRow>
          </SettingsSection>
        </div>
      ) : null}

      {!loading && !error && tab === 'screens' ? (
        <div className="settings-stack">
          <SettingsSection
            eyebrow="ScreenPilot"
            title="LAN receiver service"
            description="Receivers connect to this computer over the production LAN. The service is never started automatically and is stopped when the app closes."
            actions={<Button variant="primary" size="sm" onClick={savePort} loading={busy === 'port'}><Save size={13} /> Save port</Button>}
          >
            <div className="settings-split">
              <div className="form-grid">
                <Field
                  label="Receiver port"
                  required
                  hint="Valid range 1024–65535. Changing the port restarts a running receiver service."
                >
                  <TextInput
                    type="number"
                    min={1024}
                    max={65535}
                    value={screenPort}
                    onChange={(event) => setScreenPort(event.target.value)}
                  />
                </Field>
                <div className={cx('settings-state-card', receiver?.running && 'is-on')}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Server size={15} />
                      <span style={{ fontSize: 12.5, fontWeight: 560 }}>Receiver service</span>
                    </div>
                    <Badge tone={receiver?.running ? 'green' : 'neutral'} dot>{receiver?.running ? 'Listening' : 'Stopped'}</Badge>
                  </div>
                  <p className="settings-note">
                    {receiver?.running
                      ? `Listening on port ${receiver.port}${receiver.localBaseUrl ? ` · ${receiver.localBaseUrl}` : ''}.`
                      : 'Start it deliberately in ScreenPilot when the display network is ready.'}
                  </p>
                  <Button as={Link} to="/screens" size="sm" variant="soft" style={{ marginTop: 9 }}>
                    Manage receivers <ArrowRight size={12} />
                  </Button>
                </div>
              </div>

              <div className="settings-aside">
                <div className="settings-aside-title"><Wifi size={14} /> Network boundaries</div>
                <ul className="settings-list">
                  <li>The receiver binds to the local machine&apos;s LAN interfaces and requires a six-digit display pairing code.</li>
                  <li>Anyone holding a receiver link can view that display&apos;s cue information on the network.</li>
                  <li>A browser acknowledgement means the message arrived at the browser. It cannot confirm projector power, input, focus or audio.</li>
                  <li>Windows Firewall may prompt the first time the receiver starts. Allow it only on trusted production networks.</li>
                </ul>
              </div>
            </div>
          </SettingsSection>

          <div className="notice-strip is-warning">
            <TriangleAlert size={14} />
            <p>ShowFlow cannot secure a compromised LAN. Use a dedicated production network or a trusted hotspot, and do not expose the receiver port to the internet.</p>
          </div>
        </div>
      ) : null}

      {!loading && !error && tab === 'integrations' ? (
        <div className="settings-stack">
          <SettingsSection
            eyebrow="Production software"
            title="Resolume OSC integration"
            description="Only two verified Resolume operations are implemented. OSC over UDP is one-way, so every successful send is recorded as unverified."
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={testIntegration} loading={busy === 'test'} disabled={Boolean(busy)}>
                  <RefreshCw size={13} /> Test transport
                </Button>
                <Button variant="primary" size="sm" onClick={saveIntegration} loading={busy === 'integration'} disabled={Boolean(busy)}>
                  <Save size={13} /> Save
                </Button>
              </>
            }
          >
            <div className="settings-split">
              <div className="form-grid">
                <div className="form-grid form-grid-2">
                  <Field label="Mode" hint="Mock never opens a network connection.">
                    <Select
                      value={integrationForm.mode}
                      onChange={(event) => setIntegrationForm((current) => ({ ...current, mode: event.target.value }))}
                    >
                      {integration?.modes?.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Integration state" hint="Disabled blocks every send, even during a LIVE show.">
                    <div className="settings-switch-wrap">
                      <Switch
                        checked={integrationForm.enabled}
                        onChange={(enabled) => setIntegrationForm((current) => ({ ...current, enabled }))}
                        label={integrationForm.enabled ? 'Enabled' : 'Disabled'}
                      />
                    </div>
                  </Field>
                </div>

                {integrationForm.mode === 'resolume' ? (
                  <div className="form-grid form-grid-2">
                    <Field label="Target host" required hint="IP address or hostname. No scheme.">
                      <TextInput
                        value={integrationForm.host}
                        onChange={(event) => setIntegrationForm((current) => ({ ...current, host: event.target.value }))}
                        placeholder="127.0.0.1"
                        maxLength={253}
                      />
                    </Field>
                    <Field label="OSC port" required hint="Resolume defaults to 7000.">
                      <TextInput
                        type="number"
                        min={1}
                        max={65535}
                        value={integrationForm.port}
                        onChange={(event) => setIntegrationForm((current) => ({ ...current, port: event.target.value }))}
                      />
                    </Field>
                  </div>
                ) : (
                  <div className="settings-state-card">
                    <div className="flex items-center gap-2">
                      <Cable size={14} />
                      <span style={{ fontSize: 12.5, fontWeight: 560 }}>Mock mode</span>
                      <Badge tone="cyan">Simulation only</Badge>
                    </div>
                    <p className="settings-note">
                      Mapped actions are simulated locally. The control room reports them as simulated; no datagram is sent.
                    </p>
                  </div>
                )}

                <div className="settings-truth">
                  <div className="settings-truth-title"><ShieldCheck size={14} /> Execution truth</div>
                  <p>
                    A successful send means the datagram was handed to the local network stack. Resolume does not
                    acknowledge these messages, so ShowFlow reports <strong>unverified</strong>, never acknowledged.
                    Rehearsal never transmits, and no command is replayed after a restart.
                  </p>
                </div>
              </div>

              <div className="settings-aside">
                <div className="settings-aside-title"><Server size={14} /> Current configuration</div>
                <div className="settings-facts">
                  <span>Mode</span><span>{config?.mode === 'resolume' ? 'Resolume OSC' : 'Mock'}</span>
                  <span>State</span><span>{config?.enabled ? 'Enabled' : 'Disabled'}</span>
                  <span>Target</span><span className="mono">{config?.mode === 'resolume' ? `${config.host}:${config.port}` : 'local simulation'}</span>
                  <span>Transport</span><span>{integration?.transport || 'OSC over UDP (one-way)'}</span>
                </div>

                {config?.lastTest ? (
                  <div className={cx('settings-test-result', config.lastTest.ok ? 'is-pass' : 'is-fail')}>
                    <div className="flex items-center gap-2">
                      {config.lastTest.ok ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}
                      <span>{config.lastTest.ok ? (config.lastTest.simulated ? 'Mock ready' : 'Transport ready') : 'Test failed'}</span>
                      <span className="mono" style={{ marginLeft: 'auto', fontSize: 8.5 }}>{formatRelativeTime(config.lastTest.ranAt)}</span>
                    </div>
                    <p>{config.lastTest.detail || 'No detail recorded.'}</p>
                    {config.lastTest.acknowledged ? <Badge tone="cyan">Simulated acknowledgement</Badge> : null}
                  </div>
                ) : (
                  <p className="input-hint">No integration test has been run yet.</p>
                )}

                {integration?.documentationUrl ? (
                  <Button size="sm" variant="ghost" onClick={() => openDocumentation(integration.documentationUrl)} style={{ paddingLeft: 0, marginTop: 8 }}>
                    <ExternalLink size={12} /> Resolume OSC documentation
                  </Button>
                ) : null}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            eyebrow="Supported surface"
            title="Verified capabilities & limits"
            description="ShowFlow intentionally implements a small Resolume surface. Anything not listed here is unsupported and must be operated manually."
          >
            <div className="settings-capabilities">
              <div className="settings-capabilities-head">
                <span>Operation</span><span>OSC address</span><span>Argument</span><span>Acknowledgement</span>
              </div>
              {(integration?.capabilities || []).map((capability) => (
                <div key={capability.id} className="settings-capability">
                  <span style={{ fontWeight: 550 }}>{capability.label}</span>
                  <span className="mono">{capability.address}</span>
                  <span className="mono">{capability.argument}</span>
                  <span><Badge tone="neutral">None · unverified</Badge></span>
                </div>
              ))}
            </div>
            <ul className="settings-list" style={{ marginTop: 14 }}>
              {(integration?.notes || []).map((note) => <li key={note}>{note}</li>)}
            </ul>
            {integration?.planned?.length ? (
              <div className="settings-planned">
                <span className="eyebrow">Planned, not implemented</span>
                {integration.planned.map((item) => (
                  <Badge key={item.value} tone="neutral">{item.label} · {item.status}</Badge>
                ))}
              </div>
            ) : null}
          </SettingsSection>
        </div>
      ) : null}

      {!loading && !error && tab === 'data' ? (
        <div className="settings-stack">
          <SettingsSection
            eyebrow="Local database"
            title="Health & storage"
            description="The database is a single SQLite file under the application user data folder. Integrity is checked locally."
            actions={
              <Button variant="secondary" size="sm" onClick={checkIntegrity} loading={busy === 'integrity'} disabled={Boolean(busy)}>
                <ShieldCheck size={13} /> Check integrity
              </Button>
            }
          >
            <div className="settings-health-grid">
              <div className="settings-health-stat">
                <span className="eyebrow">Integrity</span>
                <span className={cx('settings-health-value', String(backup?.integrity).toLowerCase() === 'ok' ? 'is-good' : 'is-warn')}>
                  {backup?.integrity || 'Unknown'}
                </span>
                <span className="text-faint">PRAGMA integrity_check</span>
              </div>
              <div className="settings-health-stat">
                <span className="eyebrow">Database size</span>
                <span className="settings-health-value mono">{formatBytes(backup?.fileSize || 0)}</span>
                <span className="text-faint">single local file</span>
              </div>
              <div className="settings-health-stat">
                <span className="eyebrow">Last saved</span>
                <span className="settings-health-value">{backup?.lastSaveAt ? formatRelativeTime(backup.lastSaveAt) : '—'}</span>
                <span className="text-faint">{backup?.lastSaveAt ? formatDateTime(backup.lastSaveAt) : 'No save recorded'}</span>
              </div>
              <div className="settings-health-stat">
                <span className="eyebrow">Automatic backups</span>
                <span className="settings-health-value">{backup?.autoBackupCount ?? 0}</span>
                <span className="text-faint">{formatBytes(backup?.autoBackupBytes || 0)} retained</span>
              </div>
            </div>

            <div className="settings-facts" style={{ marginTop: 15 }}>
              <span>Events</span><span className="mono">{backup?.counts?.events ?? 0}</span>
              <span>Cues</span><span className="mono">{backup?.counts?.cues ?? 0}</span>
              <span>Media records</span><span className="mono">{backup?.counts?.media_assets ?? 0}</span>
              <span>Crew</span><span className="mono">{backup?.counts?.operators ?? 0}</span>
              <span>Displays</span><span className="mono">{backup?.counts?.displays ?? 0}</span>
              <span>Activity entries</span><span className="mono">{backup?.counts?.activity ?? 0}</span>
            </div>
            <p className="settings-path mono" style={{ marginTop: 10 }}>{backup?.filePath || appInfo?.userDataPath || '—'}</p>
          </SettingsSection>

          <SettingsSection
            eyebrow="Backup policy"
            title="Automatic backups"
            description="Automatic backups are written to the local ShowFlow data folder. They do not include original media files."
            actions={<Button variant="primary" size="sm" onClick={saveBackupSettings} loading={busy === 'backup-settings'}><Save size={13} /> Save</Button>}
          >
            <div className="form-grid form-grid-2">
              <div className="settings-state-card">
                <Switch
                  checked={backupForm.autoBackup}
                  onChange={(autoBackup) => setBackupForm((current) => ({ ...current, autoBackup }))}
                  label="Create automatic backups"
                  description="At most one automatic backup is created every 20 hours while the app is in use."
                />
              </div>
              <Field label="Retention" hint="Keep between 3 and 30 automatic backups. Manual backups are never pruned.">
                <TextInput
                  type="number"
                  min={3}
                  max={30}
                  value={backupForm.backupRetention}
                  onChange={(event) => setBackupForm((current) => ({ ...current, backupRetention: event.target.value }))}
                />
              </Field>
            </div>

            <div className="settings-backup-actions">
              <Button variant="secondary" onClick={createBackup} loading={busy === 'backup'} disabled={Boolean(busy)}>
                <History size={13} /> Create backup…
              </Button>
              <Button variant="secondary" onClick={restoreBackup} loading={busy === 'restore'} disabled={Boolean(busy)}>
                <RotateCcw size={13} /> Restore backup…
              </Button>
              <Button variant="ghost" onClick={openDataFolder} disabled={Boolean(busy)}>
                <FolderOpen size={13} /> Open data folder
              </Button>
            </div>
            <div className="notice-strip is-warning" style={{ marginTop: 4 }}>
              <TriangleAlert size={14} />
              <p>
                Restoring replaces the local database. A safety backup is created first, but the restored data must be
                reviewed before the next show. Original media files are never changed.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            eyebrow="On this computer"
            title="Recent automatic backups"
            description="Newest first. Paths are shown so they can be copied to offline storage."
          >
            {backup?.autoBackups?.length ? (
              <div className="settings-backup-list">
                {backup.autoBackups.map((item) => (
                  <div key={item.path} className="settings-backup-row">
                    <Database size={13} className="text-faint" />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="mono truncate" style={{ fontSize: 10 }}>{item.name}</div>
                      <div className="text-faint" style={{ fontSize: 9.5 }}>{formatRelativeTime(item.modifiedAt)} · {formatBytes(item.sizeBytes)}</div>
                    </div>
                    <span className="mono text-faint" style={{ fontSize: 8.5 }}>{formatDateTime(item.modifiedAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="input-hint">No automatic backups yet. Create one manually before making significant changes.</p>
            )}
          </SettingsSection>
        </div>
      ) : null}

      <div className="control-safety-note">
        <ShieldCheck size={15} />
        <p>
          <strong>Settings never execute a show.</strong> Saving an integration or changing the receiver port sends no
          cue, starts no session and replays nothing. All operational actions remain deliberate inside the Control Room.
        </p>
      </div>

      <Modal
        open={Boolean(restored)}
        onClose={() => {}}
        title="Backup restored"
        eyebrow="Reload required"
        description="The local database was replaced. The current interface is still showing pre-restore data."
        size="sm"
        preventClose
        footer={<Button variant="primary" onClick={() => window.location.reload()}>Reload ShowFlow</Button>}
      >
        <p className="text-muted" style={{ lineHeight: '20px' }}>
          Reload now to read the restored events, settings, crew and integrations. ShowFlow will not start a session,
          send OSC or replay a cue after reloading.
        </p>
        {restored?.receiverWarning ? (
          <div className="input-error" style={{ marginTop: 12 }}>{restored.receiverWarning}</div>
        ) : null}
      </Modal>
    </div>
  );
}
