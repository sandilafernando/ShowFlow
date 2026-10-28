import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Cable,
  Check,
  MonitorPlay,
  ShieldCheck,
  Radio,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { Button, Field, TextInput, Switch } from '../components/ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

const FEATURES = [
  {
    icon: Radio,
    title: 'Cue with intent',
    text: 'A running order, GO / NEXT discipline and an honest record of every execution state.',
  },
  {
    icon: MonitorPlay,
    title: 'Know every screen',
    text: 'Pair LAN receivers, distinguish preview from live, and verify what the projector is showing.',
  },
  {
    icon: Cable,
    title: 'Nothing assumed',
    text: 'OSC is one-way. ShowFlow labels a sent datagram unverified — never acknowledged.',
  },
];

export default function Onboarding() {
  const { completeSetup, toast } = useApp();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [form, setForm] = useState({
    operatorName: '',
    defaultVenue: '',
    receiverPort: '41730',
  });
  const [error, setError] = useState('');

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function finish() {
    if (!understood) return;
    setSaving(true);
    setError('');
    try {
      const port = Number(form.receiverPort);
      if (!form.operatorName.trim()) {
        setError('Add the name that should appear as the operator in ShowFlow history.');
        setStep(1);
        setSaving(false);
        return;
      }
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        setError('Receiver port must be between 1024 and 65535.');
        setStep(1);
        setSaving(false);
        return;
      }
      await completeSetup({
        operatorName: form.operatorName.trim(),
        defaultVenue: form.defaultVenue.trim(),
        receiverPort: port,
        onboardingComplete: true,
      });
      toast.success('Workspace ready', 'ShowFlow is set up for local, offline operation.');
    } catch (caught) {
      setError(caught.message);
      setSaving(false);
    }
  }

  function next() {
    setError('');
    if (step === 1 && !form.operatorName.trim()) {
      setError('An operator name is required so show logs identify who is calling cues.');
      return;
    }
    const port = Number(form.receiverPort);
    if (step === 1 && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      setError('Receiver port must be between 1024 and 65535.');
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  }

  return (
    <div className="onboarding">
      <div className="onboarding-grid" aria-hidden="true" />
      <div className="onboarding-glow" aria-hidden="true" />
      <div className="onboarding-brand">
        <LogoMark size={29} />
        <span>ShowFlow</span>
        <span className="onboarding-brand-sep" />
        <span className="eyebrow" style={{ letterSpacing: '.1em' }}>Local production control</span>
      </div>

      <div className="onboarding-content">
        <motion.div
          className="onboarding-story"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="eyebrow">Educational Media Unit · Maris Stella College</div>
          <h1 className="onboarding-title">
            Every cue.<br />
            Every screen.<br />
            <span>Every show.</span>
          </h1>
          <p className="onboarding-lede">
            A focused desktop control room for live productions. Your events, media index and crew
            plans stay on this computer. No cloud account, no automatic execution, no invented status.
          </p>

          <div className="onboarding-features">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div className="onboarding-feature" key={feature.title} style={{ animationDelay: `${120 + index * 70}ms` }}>
                  <div className="onboarding-feature-icon"><Icon size={16} strokeWidth={1.7} /></div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 560 }}>{feature.title}</div>
                    <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: '17px', color: 'var(--fg-faint)' }}>{feature.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          className="onboarding-panel"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="onboarding-steps" aria-label="Setup progress">
            {[0, 1, 2].map((index) => (
              <span key={index} className={index <= step ? 'active' : ''} />
            ))}
            <span className="onboarding-step-label mono">0{step + 1} / 03</span>
          </div>

          {step === 0 ? (
            <div>
              <div className="eyebrow">First launch</div>
              <h2 className="onboarding-panel-title">Set up the control room</h2>
              <p className="onboarding-panel-copy">
                ShowFlow is already installed. This short setup records who is operating and where
                your local receiver server should listen. You can change all of it later in Settings.
              </p>

              <div className="onboarding-local-note">
                <WifiOff size={16} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 550, color: 'var(--fg)' }}>Offline by default</div>
                  <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: '17px', color: 'var(--fg-faint)' }}>
                    Setup does not download anything or create an online account. Internet access is not
                    required to run a show.
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center" style={{ marginTop: 24 }}>
                <span className="mono" style={{ fontSize: 9.5, color: '#4e5967' }}>STEP 01 · IDENTITY</span>
                <Button variant="primary" onClick={next}>
                  Begin setup <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <div className="eyebrow">Step 02 · Local identity</div>
              <h2 className="onboarding-panel-title">Who is calling this show?</h2>
              <p className="onboarding-panel-copy">
                These details identify the operator in the show log and pre-fill new events. They are
                stored only in the local ShowFlow database.
              </p>

              <div className="fieldset" style={{ marginTop: 20 }}>
                <Field label="Operator name" hint="Shown in History and activity records.">
                  <TextInput
                    value={form.operatorName}
                    onChange={update('operatorName')}
                    placeholder="e.g. Sandila Fernando"
                    autoFocus
                    maxLength={80}
                  />
                </Field>
                <Field label="Default venue" hint="Optional. Used as the starting venue for new events.">
                  <TextInput
                    value={form.defaultVenue}
                    onChange={update('defaultVenue')}
                    placeholder="e.g. College Auditorium"
                    maxLength={160}
                  />
                </Field>
                <Field
                  label="ScreenPilot receiver port"
                  hint="Used only when you explicitly start the LAN receiver server. 1024–65535."
                >
                  <TextInput
                    value={form.receiverPort}
                    onChange={update('receiverPort')}
                    inputMode="numeric"
                    placeholder="41730"
                  />
                </Field>
              </div>

              {error ? <div className="input-error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}

              <div className="flex justify-between items-center" style={{ marginTop: 22 }}>
                <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft size={14} /> Back</Button>
                <Button variant="primary" onClick={next}>Continue <ArrowRight size={14} /></Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="eyebrow">Step 03 · Operating discipline</div>
              <h2 className="onboarding-panel-title">What ShowFlow will never do</h2>
              <p className="onboarding-panel-copy">
                Honest control matters more than a reassuring dashboard. Read these limits once — they
                define how the app behaves during a show.
              </p>

              <div className="onboarding-rules">
                <div>
                  <ShieldCheck size={16} />
                  <p><strong>No automatic execution.</strong> Restarting ShowFlow never replays a cue or reconnects a clip. A live event interrupted by shutdown is marked interrupted.</p>
                </div>
                <div>
                  <Radio size={16} />
                  <p><strong>OSC is one-way.</strong> A successful Resolume send is recorded as sent — unverified. ShowFlow cannot confirm that Resolume, a projector or a media player acted on it.</p>
                </div>
                <div>
                  <MonitorPlay size={16} />
                  <p><strong>Receiver acknowledgements are browser receipts.</strong> They confirm that a ScreenPilot browser received content, not that the projector displayed it. Always verify visually.</p>
                </div>
              </div>

              <div className="onboarding-summary">
                <div>
                  <span className="eyebrow">Operator</span>
                  <div style={{ marginTop: 4 }}>{form.operatorName || 'Not set'}</div>
                </div>
                <div>
                  <span className="eyebrow">Venue</span>
                  <div style={{ marginTop: 4 }}>{form.defaultVenue || 'No default'}</div>
                </div>
                <div>
                  <span className="eyebrow">Receiver</span>
                  <div className="mono" style={{ marginTop: 4 }}>:{form.receiverPort || '41730'}</div>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <Switch
                  checked={understood}
                  onChange={setUnderstood}
                  label="I understand these operating limits"
                  description="ShowFlow reports what it can actually verify, not what we hope happened."
                />
              </div>

              {error ? <div className="input-error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}

              <div className="flex justify-between items-center" style={{ marginTop: 22 }}>
                <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</Button>
                <Button variant="primary" onClick={finish} disabled={!understood} loading={saving}>
                  Enter ShowFlow <Check size={14} />
                </Button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>

      <div className="onboarding-foot">
        <span>ShowFlow v1.0 · Offline-first · Windows</span>
        <span className="flex items-center gap-2"><span className="dot" style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--positive)' }} /> Local database ready</span>
      </div>
    </div>
  );
}
