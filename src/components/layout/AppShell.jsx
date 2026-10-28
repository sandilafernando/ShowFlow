import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  FolderOpen,
  History,
  Info,
  LayoutDashboard,
  LifeBuoy,
  MonitorPlay,
  Radio,
  Settings,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useLoader, useNow } from '../../lib/hooks.js';
import { useApp } from '../../context/AppContext.jsx';
import { LogoMark } from '../Logo.jsx';
import { Badge } from '../ui.jsx';

const NAV = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Operate',
    items: [
      { to: '/control', label: 'Control Room', icon: Radio },
      { to: '/events', label: 'Events', icon: CalendarDays },
      { to: '/screens', label: 'ScreenPilot', icon: MonitorPlay },
    ],
  },
  {
    label: 'Prepare',
    items: [
      { to: '/media', label: 'MediaVault', icon: FolderOpen },
      { to: '/crew', label: 'CrewSync', icon: Users },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/history', label: 'History', icon: History },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/help', label: 'Help', icon: LifeBuoy },
      { to: '/about', label: 'About', icon: Info },
    ],
  },
];

const ROUTE_LABELS = [
  ['/control', 'Control Room'],
  ['/events', 'Events'],
  ['/screens', 'ScreenPilot'],
  ['/media', 'MediaVault'],
  ['/crew', 'CrewSync'],
  ['/history', 'History'],
  ['/settings', 'Settings'],
  ['/help', 'Help'],
  ['/about', 'About'],
];

function routeLabel(pathname) {
  const match = ROUTE_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'Dashboard';
}

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const { appInfo } = useApp();
  const location = useLocation();
  const now = useNow(1000);
  const { data: liveEvents } = useLoader(
    () => api('events.list', { status: 'live', limit: 10 }),
    [location.pathname],
  );

  const live = Array.isArray(liveEvents) ? liveEvents[0] : null;
  const clock = new Date(now);
  const clockText = [clock.getHours(), clock.getMinutes(), clock.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
    .format(clock)
    .toUpperCase();

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <LogoMark size={32} />
          <div>
            <div className="brand-name">ShowFlow</div>
            <div className="brand-sub">Educational Media Unit</div>
          </div>
        </div>
        <nav className="sidebar-scroll">
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavItem key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          {live ? (
            <NavLink
              to={`/control/${live.id}`}
              style={{
                display: 'block',
                padding: '9px 10px',
                marginBottom: 10,
                borderRadius: 7,
                border: '1px solid rgba(251,113,133,.28)',
                background: 'rgba(251,113,133,.055)',
                color: 'var(--fg)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="eyebrow" style={{ color: 'var(--danger)' }}>Live session</span>
                <span className="live-badge" style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--danger)' }} />
              </div>
              <div className="truncate" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--fg-muted)' }}>{live.title}</div>
            </NavLink>
          ) : null}
          <div className="local-chip">
            <span className="dot" />
            Local workspace
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 7 }}>
            <span className="mono" style={{ fontSize: 9.5, color: '#4e5967' }}>v{appInfo?.version || '1.0.0'}</span>
            <span className="mono" style={{ fontSize: 9.5, color: '#4e5967' }}>MIT</span>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <div className="topbar">
          <div className="flex items-center gap-2">
            <span className="eyebrow" style={{ color: '#586473' }}>ShowFlow</span>
            <span className="topbar-sep" />
            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{routeLabel(location.pathname)}</span>
          </div>
          <div className="flex items-center gap-3">
            {live ? (
              <NavLink to={`/control/${live.id}`} style={{ display: 'inline-flex' }}>
                <Badge tone="red" dot live>Live · {live.title}</Badge>
              </NavLink>
            ) : (
              <span className="topbar-idle">
                <span className="dot" />
                Standby
              </span>
            )}
            <span className="mono topbar-clock" title={clock.toLocaleString()}>
              {dateText} · {clockText}
            </span>
          </div>
        </div>
        <div className="page-scroll">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
