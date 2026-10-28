import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Cable,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock,
  FolderOpen,
  Keyboard,
  LifeBuoy,
  MonitorPlay,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Users,
  WifiOff,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { friendlyError, useDocumentTitle } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import { Badge, Button, PageHeader, Panel } from '../components/ui.jsx';

const CONTENTS = [
  { id: 'first-show', label: 'Your first show' },
  { id: 'truth', label: 'Operational truth' },
  { id: 'control', label: 'Control Room' },
  { id: 'screens', label: 'ScreenPilot' },
  { id: 'media', label: 'MediaVault' },
  { id: 'crew', label: 'CrewSync' },
  { id: 'integration', label: 'Resolume OSC' },
  { id: 'backups', label: 'Backups & recovery' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'shortcuts', label: 'Keyboard' },
];

const TROUBLESHOOTING = [
  {
    question: 'The receiver server will not start',
    answer:
      'Another process may already be using the selected port. Change the receiver port in Settings → Screens & network, then start the server again in ScreenPilot. Windows Firewall may also block the first launch; allow ShowFlow only on your trusted production network. ShowFlow never starts the server automatically.',
  },
  {
    question: 'A receiver link opens but the display cannot pair',
    answer:
      'Confirm the display is enabled, the pairing code is the current six-digit code, and the receiver is on the same LAN as this computer. Regenerating a code disconnects the old receiver immediately. A browser receipt does not prove the projector is showing the page.',
  },
  {
    question: 'Screen content was sent, but the projector is still blank',
    answer:
      'ShowFlow can only confirm that a receiver browser received the WebSocket message. Check the projector power, selected input, cable, blanking/shutter, scaler and whether the browser window is actually on the projector output. Use the test pattern in ScreenPilot and verify the room visually.',
  },
  {
    question: 'A media file is marked missing',
    answer:
      'MediaVault stores the last indexed path. If the file moved, use Relink for one file or Library tools → Scan folder to match missing filenames. Ambiguous matches are reported, never guessed. ShowFlow does not move, rename or delete the original file.',
  },
  {
    question: 'The Resolume cue says unverified',
    answer:
      'That is expected. Resolume OSC is a one-way UDP transport and does not acknowledge clip connects or layer opacity. A successful send only means the datagram left this computer. Confirm the visual result in Resolume and on the output.',
  },
  {
    question: 'The integration did not send during rehearsal',
    answer:
      'This is intentional. Rehearsal simulates mapped actions locally and never transmits OSC. Only a deliberate GO on an event whose status is LIVE can transmit, and only when the integration is enabled and the cue has a valid mapping.',
  },
  {
    question: 'The app closed during a live show',
    answer:
      'On the next launch, the event is marked interrupted. ShowFlow does not reopen the session, restore the live cue or replay commands. Review History, confirm the physical state of the room, then deliberately prepare the event again.',
  },
  {
    question: 'I restored a backup but the screens still show old data',
    answer:
      'The running interface keeps its pre-restore state until reloaded. Use the Reload ShowFlow prompt after a restore. Reloading does not start a session or send anything to production equipment.',
  },
];

function scrollTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

function Step({ number, title, children }) {
  return (
    <div className="help-step">
      <span className="help-step-number mono">{String(number).padStart(2, '0')}</span>
      <div>
        <div className="help-step-title">{title}</div>
        <p>{children}</p>
      </div>
    </div>
  );
}

function HelpSection({ id, icon: Icon, eyebrow, title, children }) {
  return (
    <section id={id} className="help-section">
      <div className="help-section-head">
        <div className="help-section-icon"><Icon size={16} /></div>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="help-section-body">{children}</div>
    </section>
  );
}

export default function Help() {
  useDocumentTitle('Help');
  const { appInfo, toast } = useApp();
  const [openFaq, setOpenFaq] = useState(0);

  async function openDataFolder() {
    try {
      await api('app.openDataFolder');
    } catch (caught) {
      toast.error('Data folder could not be opened', friendlyError(caught));
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operator handbook"
        title="Help"
        description="A practical guide to preparing, rehearsing and running a show — including the things ShowFlow deliberately cannot do."
        actions={
          <>
            <Button variant="ghost" as={Link} to="/about"><CircleHelp size={14} /> About</Button>
            <Button variant="primary" as={Link} to="/events"><Radio size={14} /> Open events</Button>
          </>
        }
      />

      <Panel className="help-hero crosshair">
        <div className="help-hero-copy">
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>Start with the room, not the software</div>
          <h2>ShowFlow tracks the plan. You remain the show caller.</h2>
          <p>
            The safest workflow is simple: build the running order, walk the room, rehearse with intent, then go live.
            ShowFlow will never start a cue on launch, retry a failed command, or claim that a projector is showing
            something it cannot see.
          </p>
          <div className="flex wrap gap-2" style={{ marginTop: 15 }}>
            <Button size="sm" variant="soft" onClick={() => scrollTo('first-show')}><BookOpen size={13} /> First show checklist</Button>
            <Button size="sm" variant="ghost" as={Link} to="/control"><Radio size={13} /> Control Room <ArrowRight size={12} /></Button>
            <Button size="sm" variant="ghost" as={Link} to="/screens"><MonitorPlay size={13} /> ScreenPilot <ArrowRight size={12} /></Button>
          </div>
        </div>
        <div className="help-hero-facts">
          <div><span className="eyebrow">Version</span><span className="mono">{appInfo?.version || '1.0.0'}</span></div>
          <div><span className="eyebrow">Storage</span><span>Local SQLite</span></div>
          <div><span className="eyebrow">Network</span><span>LAN only, when started</span></div>
          <div><span className="eyebrow">Telemetry</span><span>None</span></div>
        </div>
      </Panel>

      <div className="help-layout">
        <aside className="help-contents" aria-label="Help contents">
          <div className="eyebrow">Contents</div>
          <nav>
            {CONTENTS.map((item) => (
              <button key={item.id} type="button" onClick={() => scrollTo(item.id)}>{item.label}</button>
            ))}
          </nav>
          <div className="help-contents-footer">
            <div className="eyebrow">Data folder</div>
            <p className="mono">{appInfo?.userDataPath || 'Available inside the desktop app'}</p>
            <Button size="sm" variant="ghost" onClick={openDataFolder} style={{ paddingLeft: 0 }}>
              <FolderOpen size={12} /> Open folder
            </Button>
          </div>
        </aside>

        <div className="help-content">
          <HelpSection id="first-show" icon={BookOpen} eyebrow="Preparation" title="From empty workspace to a rehearsed show">
            <p className="help-lede">
              Complete these steps in order. Each one is local until you deliberately start a session or push screen content.
            </p>
            <div className="help-steps">
              <Step number={1} title="Create the event">Add the title, date, venue and a short brief. The running order starts empty.</Step>
              <Step number={2} title="Build the running order">Add cues in performance order with type, duration, notes and an optional fallback instruction.</Step>
              <Step number={3} title="Link media">Index files in MediaVault, then attach the relevant asset to each cue. Fix missing-file warnings before doors.</Step>
              <Step number={4} title="Call the crew">Add the roster in CrewSync, assign roles for this event, and finish the setup checklist.</Step>
              <Step number={5} title="Configure screens">Add displays, start the receiver server, and copy each receiver link to the correct display computer.</Step>
              <Step number={6} title="Rehearse">Open the Control Room and start rehearsal. Rehearsal moves cues and updates screens but never sends integration commands.</Step>
              <Step number={7} title="Check the room">Verify projector input, focus, audio, playback software and screen content visually. Software state is not a room check.</Step>
              <Step number={8} title="Go live deliberately">Start the live session only when the room is ready. Arm a cue, then press GO when the moment arrives.</Step>
            </div>
            <div className="help-callout">
              <ShieldCheck size={15} />
              <p>
                Starting a session does not execute anything. Going live only unlocks deliberate sends: no cue runs
                until you press GO, and no screen changes until a push or GO occurs.
              </p>
            </div>
          </HelpSection>

          <HelpSection id="truth" icon={ShieldAlert} eyebrow="Non-negotiable" title="Operational truth and safety boundaries">
            <div className="help-truth-grid">
              <div className="help-truth-card">
                <Badge tone="cyan">Requested</Badge>
                <p>The operator invoked a cue. ShowFlow recorded the request locally.</p>
              </div>
              <div className="help-truth-card">
                <Badge tone="green">Acknowledged</Badge>
                <p>A receiver browser confirmed receipt. This never means a projector displayed it.</p>
              </div>
              <div className="help-truth-card">
                <Badge tone="amber">Unverified</Badge>
                <p>An OSC datagram was sent. Resolume does not acknowledge these messages.</p>
              </div>
              <div className="help-truth-card">
                <Badge tone="red">Failed</Badge>
                <p>The local action or transport failed. Do not assume the original state was restored.</p>
              </div>
            </div>
            <ul className="help-rules">
              <li><strong>No automatic startup.</strong> Launching ShowFlow starts no cue, session or receiver.</li>
              <li><strong>No replay after restart.</strong> Live events return as interrupted; cues must be invoked again.</li>
              <li><strong>Rehearsal is isolated.</strong> Mapped integration actions are simulated, never transmitted.</li>
              <li><strong>Live sends need a LIVE event.</strong> Rehearsal, standby, archived and completed events cannot transmit.</li>
              <li><strong>Receipts are not output.</strong> A browser acknowledgement is not proof of projector, focus or audio state.</li>
              <li><strong>No hidden retries.</strong> A failed transport is reported, not silently retried.</li>
            </ul>
          </HelpSection>

          <HelpSection id="control" icon={Radio} eyebrow="Operate" title="The Control Room">
            <div className="help-topic-grid">
              <div>
                <h3>Arm & GO</h3>
                <p>Select a cue in the running order to arm it. GO invokes the armed cue and advances the next cue suggestion. Mark complete or skip afterwards so the running order reflects what actually happened.</p>
              </div>
              <div>
                <h3>Rehearsal vs live</h3>
                <p>Rehearsal records simulated execution and adds a rehearsal stamp to screen payloads. Live unlocks mapped integration sends. End the session deliberately; ending does not switch off projectors or media software.</p>
              </div>
              <div>
                <h3>Emergency menu</h3>
                <p>Blackout covers participating receiver browsers with black. Interrupt marks the session interrupted and clears the live cue. Neither action can stop an external player, switch a projector input or guarantee the room is dark.</p>
              </div>
              <div>
                <h3>Screen push on GO</h3>
                <p>GO attempts to push the current cue payload to all enabled receivers. The result reports browser delivery only. If the receiver server is stopped, the cue still executes locally but no screen content is sent.</p>
              </div>
            </div>
            <div className="help-callout is-warning">
              <AlertTriangle size={15} />
              <p>
                Use the emergency actions before improvising. ShowFlow will not guess a recovery command. If a cue fails,
                follow the cue&apos;s fallback note and communicate with the crew.
              </p>
            </div>
          </HelpSection>

          <HelpSection id="screens" icon={MonitorPlay} eyebrow="Deliver" title="ScreenPilot and receiver limits">
            <div className="help-topic-grid">
              <div>
                <h3>Start deliberately</h3>
                <p>The LAN receiver is never started at launch. Start it in ScreenPilot when the display network is ready and stop it when the show is over.</p>
              </div>
              <div>
                <h3>Pair each display</h3>
                <p>Every display has a six-digit pairing code and its own receiver link. Treat the link as a credential; anyone with it can view that display&apos;s cue information on the LAN.</p>
              </div>
              <div>
                <h3>Preview is a routing label</h3>
                <p>Preview and live displays receive the same cue payload when you deliberately push. Preview does not execute the running order by itself.</p>
              </div>
              <div>
                <h3>Verify the room</h3>
                <p>Use test patterns and blackout to diagnose delivery. Then look at every projector. Browser receipt cannot confirm power, input, focus, blanking or audio.</p>
              </div>
            </div>
            <div className="help-table-wrap">
              <table className="help-table">
                <thead><tr><th>Signal</th><th>What it means</th><th>What it does not mean</th></tr></thead>
                <tbody>
                  <tr><td>Receiver connected</td><td>A paired browser has an open WebSocket.</td><td>The projector is on or showing the page.</td></tr>
                  <tr><td>Delivered 2 of 3</td><td>Two browser receivers accepted the message.</td><td>Two projectors displayed the intended image.</td></tr>
                  <tr><td>Last seen</td><td>A previous connection existed.</td><td>The display is currently available.</td></tr>
                </tbody>
              </table>
            </div>
          </HelpSection>

          <HelpSection id="media" icon={FolderOpen} eyebrow="Prepare" title="MediaVault: paths, metadata and missing files">
            <p className="help-lede">
              MediaVault is an index, not a media manager. It records the absolute path and metadata for files that stay
              exactly where they are. Adding, removing or relinking never copies, renames or deletes an original file.
            </p>
            <ul className="help-rules">
              <li>Index individual files or scan a folder. Supported video, audio, image, presentation and document types are recorded.</li>
              <li>Run <strong>Check files</strong> before a show to refresh availability at the recorded paths.</li>
              <li>Relink one missing item, or scan a folder to match filenames. Ambiguous matches are reported and not guessed.</li>
              <li>Metadata export/import transfers the library index only. It does not include media files.</li>
              <li>Backups include MediaVault metadata, never the original media. Archive source files separately.</li>
            </ul>
            <div className="help-callout">
              <CheckCircle2 size={15} />
              <p>A cue linked to a missing file can still run, but dependent playback may fail. Treat a missing-file badge as a pre-show blocker, not a cosmetic warning.</p>
            </div>
          </HelpSection>

          <HelpSection id="crew" icon={Users} eyebrow="Prepare" title="CrewSync: people, not permissions">
            <p className="help-lede">
              CrewSync is a planning directory. It does not create accounts, send messages or grant access to this
              computer. Assignments describe who owns a role for an event; the operator remains responsible for every
              cue.
            </p>
            <div className="help-topic-grid">
              <div>
                <h3>Roster</h3>
                <p>Add names, default roles and contact details. Mark unavailable people inactive so they remain in the record without appearing as active crew.</p>
              </div>
              <div>
                <h3>Call sheets</h3>
                <p>Assign crew to an event and add role-specific notes such as report time, position or radio channel. Deleting a crew member leaves assignments in place but unassigned.</p>
              </div>
              <div>
                <h3>Checklists</h3>
                <p>Setup and shutdown checks are event-specific. Completion is a local record; it does not verify that a physical task was truly performed.</p>
              </div>
            </div>
          </HelpSection>

          <HelpSection id="integration" icon={Cable} eyebrow="Integrate" title="Resolume OSC: verified, one-way, deliberately small">
            <p className="help-lede">
              ShowFlow implements only two operations with Resolume. Both are verified against Resolume&apos;s OSC
              documentation. Anything else must be operated manually.
            </p>
            <div className="help-table-wrap">
              <table className="help-table">
                <thead><tr><th>Operation</th><th>OSC address</th><th>Argument</th><th>Feedback</th></tr></thead>
                <tbody>
                  <tr><td>Connect clip</td><td className="mono">/composition/layers/{'{layer}'}/clips/{'{clip}'}/connect</td><td className="mono">int 1</td><td>None</td></tr>
                  <tr><td>Layer opacity</td><td className="mono">/composition/layers/{'{layer}'}/video/opacity</td><td className="mono">float 0..1</td><td>None</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="help-rules">
              <li><strong>Mock mode is the safe default.</strong> It simulates mapped actions without opening a network connection.</li>
              <li><strong>Test transport only.</strong> The Resolume test resolves the host and verifies the local UDP socket; it sends no datagram and cannot prove Resolume is listening.</li>
              <li><strong>Only LIVE sends.</strong> Rehearsal, standby and archived events are blocked. Enabling integration does not send anything until GO.</li>
              <li><strong>No automatic retries or replay.</strong> A failed send is logged and reported. ShowFlow never repeats it after restart.</li>
              <li><strong>The visual result is authoritative.</strong> Confirm clip changes and opacity on the Resolume output and projector.</li>
            </ul>
          </HelpSection>

          <HelpSection id="backups" icon={RotateCcw} eyebrow="Recover" title="Backups, restore and database integrity">
            <div className="help-topic-grid">
              <div>
                <h3>What a backup contains</h3>
                <p>The local SQLite content: events, cues, MediaVault metadata, crew, displays, settings and activity. It does not contain original media files or external logs.</p>
              </div>
              <div>
                <h3>Automatic backups</h3>
                <p>When enabled, ShowFlow creates at most one automatic backup every 20 hours in the local data folder. Retention can be set from 3 to 30 copies; manual backups are never pruned.</p>
              </div>
              <div>
                <h3>Restore</h3>
                <p>Restore asks for native confirmation and creates a safety backup first. It replaces the database, then requires an interface reload. Reloading does not start a show or send commands.</p>
              </div>
              <div>
                <h3>Integrity</h3>
                <p>Settings → Data & backups can run SQLite&apos;s integrity check. A passing check means the local file is structurally sound, not that its content is correct for tonight&apos;s show.</p>
              </div>
            </div>
            <div className="help-callout is-warning">
              <TriangleAlert size={15} />
              <p>
                Keep a copy of important backups on separate storage. Uninstalling ShowFlow does not delete the user data
                folder, but disk failure, profile damage or accidental deletion can still destroy the only copy.
              </p>
            </div>
          </HelpSection>

          <HelpSection id="troubleshooting" icon={WifiOff} eyebrow="Diagnose" title="Troubleshooting">
            <div className="help-faq">
              {TROUBLESHOOTING.map((item, index) => (
                <div key={item.question} className="help-faq-item">
                  <button
                    type="button"
                    className="help-faq-question"
                    aria-expanded={openFaq === index}
                    onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                  >
                    <span>{item.question}</span>
                    <ChevronDown size={14} className={openFaq === index ? 'is-open' : ''} />
                  </button>
                  {openFaq === index ? <p className="help-faq-answer">{item.answer}</p> : null}
                </div>
              ))}
            </div>
            <div className="help-callout">
              <LifeBuoy size={15} />
              <p>
                When reporting a problem, copy diagnostics from About and note the approximate time. Do not include
                pairing codes, receiver links, media paths or event content in a public report.
              </p>
            </div>
          </HelpSection>

          <HelpSection id="shortcuts" icon={Keyboard} eyebrow="Reference" title="Keyboard & conventions">
            <div className="help-shortcuts">
              <div><span className="kbd">Ctrl</span><span className="kbd">Enter</span><span>GO the armed cue while a session is active</span></div>
              <div><span className="kbd">Esc</span><span>Close the current dialog without applying it</span></div>
              <div><span className="kbd">Tab</span><span>Move focus through controls; dialogs trap focus until closed</span></div>
            </div>
            <div className="help-definition-grid">
              <div><span>Standby</span><p>No session is active. Nothing is executing.</p></div>
              <div><span>Armed</span><p>The next cue that GO will invoke. Arming alone executes nothing.</p></div>
              <div><span>Live</span><p>A session where deliberate sends are permitted. It does not mean a cue is running.</p></div>
              <div><span>Interrupted</span><p>A live event that did not end normally. Nothing is replayed on restart.</p></div>
            </div>
          </HelpSection>

          <div className="help-end">
            <Clock size={15} />
            <span>ShowFlow {appInfo?.version || '1.0.0'} · local workspace · no telemetry or cloud sync</span>
          </div>
        </div>
      </div>
    </div>
  );
}
