import { Component } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AppProvider, BootScreen, useApp } from './context/AppContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Events from './screens/Events.jsx';
import EventEditor from './screens/EventEditor.jsx';
import ControlRoom from './screens/ControlRoom.jsx';
import ScreenPilot from './screens/ScreenPilot.jsx';
import MediaVault from './screens/MediaVault.jsx';
import CrewSync from './screens/CrewSync.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';
import About from './screens/About.jsx';
import Help from './screens/Help.jsx';
import NotFound from './screens/NotFound.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ShowFlow interface error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 'min(460px, 100%)' }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Interface recovery</div>
            <h1 style={{ fontSize: 24, letterSpacing: '-.03em', marginBottom: 8 }}>A screen stopped unexpectedly</h1>
            <p className="text-muted" style={{ lineHeight: '21px' }}>
              Your saved data is intact. ShowFlow never re-sends production commands after an interface error.
              Reload the interface to continue.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
              Reload interface
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Workspace() {
  const { settings } = useApp();
  if (!settings?.onboardingComplete) return <Onboarding />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:eventId" element={<EventEditor />} />
        <Route path="control" element={<ControlRoom />} />
        <Route path="control/:eventId" element={<ControlRoom />} />
        <Route path="screens" element={<ScreenPilot />} />
        <Route path="media" element={<MediaVault />} />
        <Route path="crew" element={<CrewSync />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<Settings />} />
        <Route path="about" element={<About />} />
        <Route path="help" element={<Help />} />
        <Route path="onboarding" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function AppContent() {
  const { loading, bootError, reloadApp } = useApp();
  if (loading) return <BootScreen />;
  if (bootError) return <BootScreen error={bootError} onRetry={reloadApp} />;
  return (
    <HashRouter>
      <Workspace />
    </HashRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AppProvider>
          <AppContent />
        </AppProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
