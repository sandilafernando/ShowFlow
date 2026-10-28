import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCopy,
  Code2,
  ExternalLink,
  Info,
  LifeBuoy,
  MapPin,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useDocumentTitle } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import {
  AFFILIATION_NOTE,
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  COPYRIGHT_NOTICE,
  CREATOR,
  INSTITUTION,
  LICENCE,
  LOCATION,
  ORGANISATION,
  REPOSITORY_URL,
  SUPPORT_URL,
} from '@shared/branding.js';
import { Badge, Button, Panel, PageHeader } from '../components/ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

const PRINCIPLES = [
  {
    title: 'Deliberate execution',
    body: 'Starting ShowFlow never starts a cue, opens a session or sends a command. Every GO is an operator action.',
  },
  {
    title: 'Honest state',
    body: 'Requested, acknowledged, completed, failed and unknown are kept distinct. A browser receipt is not projector output.',
  },
  {
    title: 'No automatic replay',
    body: 'After a restart or crash, live sessions are restored as interrupted. Nothing is re-sent to screens or Resolume.',
  },
  {
    title: 'Local first',
    body: 'Events, media metadata and crew records live in a local SQLite database. There is no account, telemetry or cloud sync.',
  },
];

export default function About() {
  useDocumentTitle('About');
  const { appInfo, toast } = useApp();
  const [copied, setCopied] = useState(false);

  async function copyDiagnostics() {
    const diagnostics = {
      app: APP_NAME,
      version: appInfo?.version,
      electron: appInfo?.versions?.electron,
      chrome: appInfo?.versions?.chrome,
      node: appInfo?.versions?.node,
      platform: appInfo?.platform,
      arch: appInfo?.arch,
      packaged: appInfo?.isPackaged,
      dataFolder: appInfo?.userDataPath,
      builtAt: appInfo?.buildDate || null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopied(true);
      toast.success('Diagnostics copied', 'The text contains no show data, credentials or file contents.');
      setTimeout(() => setCopied(false), 2400);
    } catch {
      toast.error('Could not copy diagnostics', 'Select the values on this page and copy them manually.');
    }
  }

  async function openExternal(url) {
    try {
      await api('app.openExternal', url);
    } catch (caught) {
      toast.error('Link could not be opened', friendlyError(caught));
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="About this workspace"
        title="ShowFlow"
        description="A local production control desk for the Educational Media Unit — built around deliberate cues and honest delivery state."
        actions={
          <>
            <Button variant="secondary" as={Link} to="/help"><LifeBuoy size={14} /> Help</Button>
            <Button variant="ghost" onClick={copyDiagnostics}>
              {copied ? <Check size={14} /> : <ClipboardCopy size={14} />} {copied ? 'Copied' : 'Copy diagnostics'}
            </Button>
          </>
        }
      />

      <Panel className="about-hero crosshair">
        <div className="about-hero-mark">
          <LogoMark size={92} decorative={false} />
        </div>
        <div className="about-hero-copy">
          <div className="flex wrap items-center gap-2">
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>Offline production software</span>
            <Badge tone="cyan">v{appInfo?.version || '1.0.0'}</Badge>
            <Badge tone="neutral">{LICENCE}</Badge>
          </div>
          <h2>{APP_TAGLINE}</h2>
          <p>{APP_DESCRIPTION}</p>
          <div className="flex wrap items-center gap-2" style={{ marginTop: 14 }}>
            <Badge tone={appInfo?.isPackaged ? 'green' : 'amber'} dot>{appInfo?.isPackaged ? 'Packaged desktop build' : 'Local development build'}</Badge>
            <span className="mono" style={{ fontSize: 9, color: 'var(--fg-faint)' }}>
              {appInfo?.platform?.toUpperCase() || 'PLATFORM'} · {appInfo?.arch || 'ARCH'}
            </span>
          </div>
        </div>
      </Panel>

      <div className="about-grid">
        <div className="about-main">
          <Panel className="about-panel">
            <div className="about-panel-head">
              <Info size={15} />
              <h3>What ShowFlow is</h3>
            </div>
            <p className="about-copy">
              ShowFlow brings the running order, screen delivery, media readiness and crew call sheets into one local
              desktop application. It is designed for school and small-venue productions where the operator needs clear
              state more than automation.
            </p>
            <p className="about-copy">
              The app never pretends to see the room. It can confirm that a browser received a message, that a local
              file exists, or that a database record changed. It cannot confirm that a projector is on, that Resolume
              accepted an OSC packet, or that an audience saw the intended image.
            </p>
          </Panel>

          <Panel className="about-panel">
            <div className="about-panel-head">
              <ShieldCheck size={15} />
              <h3>Operating principles</h3>
            </div>
            <div className="about-principles">
              {PRINCIPLES.map((item) => (
                <div key={item.title} className="about-principle">
                  <span className="about-principle-dot" />
                  <div>
                    <div className="about-principle-title">{item.title}</div>
                    <p>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="about-panel">
            <div className="about-panel-head">
              <Code2 size={15} />
              <h3>Source & licence</h3>
            </div>
            {REPOSITORY_URL ? (
              <p className="about-copy">
                The public repository is available at{' '}
                <button type="button" className="about-inline-link" onClick={() => openExternal(REPOSITORY_URL)}>
                  {REPOSITORY_URL} <ExternalLink size={11} />
                </button>.
              </p>
            ) : (
              <p className="about-copy">
                No public repository URL is configured in this build. ShowFlow does not invent a project address or
                imply a release channel. The MIT licence text is included with the source distribution.
              </p>
            )}
            <p className="about-copy">
              ShowFlow is released under the {LICENCE} licence. The application icon, installer artwork and interface
              are original work created for this project. Third-party libraries remain under their respective licences.
            </p>
            <div className="about-facts">
              <div><span>Licence</span><span className="mono">{LICENCE}</span></div>
              <div><span>Version</span><span className="mono">{appInfo?.version || '1.0.0'}</span></div>
              <div><span>Electron</span><span className="mono">{appInfo?.versions?.electron || '—'}</span></div>
              <div><span>Chromium</span><span className="mono">{appInfo?.versions?.chrome || '—'}</span></div>
              <div><span>Node</span><span className="mono">{appInfo?.versions?.node || '—'}</span></div>
              <div><span>Data folder</span><span className="mono truncate" title={appInfo?.userDataPath || ''}>{appInfo?.userDataPath || '—'}</span></div>
            </div>
          </Panel>
        </div>

        <div className="about-side">
          <Panel className="about-panel">
            <div className="about-panel-head">
              <Users size={15} />
              <h3>Created for</h3>
            </div>
            <div className="about-org">
              <div className="about-org-name">{ORGANISATION}</div>
              <div className="about-org-line"><MapPin size={12} /> {INSTITUTION} · {LOCATION}</div>
              <div className="about-org-line">Created by {CREATOR}</div>
            </div>
            <p className="about-note">{AFFILIATION_NOTE}</p>
          </Panel>

          <Panel className="about-panel">
            <div className="about-panel-head">
              <LifeBuoy size={15} />
              <h3>Support surface</h3>
            </div>
            <p className="about-copy">
              The built-in Help page covers setup, receiver diagnostics, media relinking and the exact limits of the
              Resolume integration.
            </p>
            <div className="about-links">
              <Link to="/help">Open Help <ArrowRight size={12} /></Link>
              <Link to="/settings">Open Settings <ArrowRight size={12} /></Link>
              {SUPPORT_URL ? (
                <button type="button" className="about-inline-link" onClick={() => openExternal(SUPPORT_URL)}>
                  Resolume OSC reference <ExternalLink size={11} />
                </button>
              ) : null}
            </div>
          </Panel>

          <Panel className="about-panel about-build">
            <div className="about-panel-head">
              <BookOpen size={15} />
              <h3>Build information</h3>
            </div>
            <p className="about-note">
              Diagnostics are for troubleshooting only. They contain no event titles, media paths, crew records or
              credentials.
            </p>
            <p className="about-copyright">{COPYRIGHT_NOTICE}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
