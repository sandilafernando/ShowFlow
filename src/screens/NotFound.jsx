import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, Radio, SearchX } from 'lucide-react';
import { useDocumentTitle } from '../lib/hooks.js';
import { Button, Panel } from '../components/ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="page">
      <div className="notfound-wrap">
        <Panel className="notfound-panel crosshair">
          <div className="notfound-mark">
            <LogoMark size={54} />
            <SearchX size={22} className="notfound-badge" />
          </div>
          <div className="eyebrow">404 · Route not found</div>
          <h1>This page is not in the running order.</h1>
          <p className="lede">
            The link may be outdated, or the screen may have been renamed. Nothing has been executed, and your saved
            shows are unchanged.
          </p>
          <div className="flex wrap gap-2" style={{ marginTop: 20 }}>
            <Button as={Link} to="/" variant="primary"><ArrowLeft size={14} /> Dashboard</Button>
            <Button as={Link} to="/events" variant="secondary"><Compass size={14} /> Events</Button>
            <Button as={Link} to="/control" variant="ghost"><Radio size={14} /> Control Room</Button>
          </div>
          <div className="notfound-foot mono">
            SHOWFLOW · LOCAL WORKSPACE · NO COMMANDS SENT
          </div>
        </Panel>
      </div>
    </div>
  );
}
