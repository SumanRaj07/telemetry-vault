// Application shell: collapsible sidebar, tracking status header, routes.
import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import {
  AppWindow, Code2, Database, FileBarChart, FolderKanban, GitBranch,
  LayoutDashboard, Lightbulb, ListOrdered, PanelLeftClose, PanelLeftOpen,
  Pause, Play, Plug, Settings as SettingsIcon, Timer,
} from 'lucide-react';
import { api } from './api';
import { ToastProvider } from './components/ui';
import type { TrackingStatusInfo } from '../shared/types';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import Coding from './pages/Coding';
import Applications from './pages/Applications';
import Projects from './pages/Projects';
import Repositories from './pages/Repositories';
import FocusGoals from './pages/FocusGoals';
import Insights from './pages/Insights';
import Reports from './pages/Reports';
import DataBackups from './pages/DataBackups';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/timeline', label: 'Activity Timeline', icon: ListOrdered },
  { to: '/coding', label: 'Coding Analytics', icon: Code2 },
  { to: '/applications', label: 'Applications', icon: AppWindow },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/repositories', label: 'Git Repositories', icon: GitBranch },
  { to: '/focus', label: 'Focus & Goals', icon: Timer },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/data', label: 'Data & Backups', icon: Database },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function StatusPill() {
  const [status, setStatus] = useState<TrackingStatusInfo | null>(null);
  const refresh = () => {
    api().tracking.getStatus().then(setStatus).catch(() => undefined);
  };
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, []);
  const dot: Record<string, string> = {
    active: 'bg-success',
    paused: 'bg-warning',
    unavailable: 'bg-danger',
    stopped: 'bg-muted',
  };
  const label: Record<string, string> = {
    active: 'Tracking active',
    paused: 'Tracking paused',
    unavailable: 'Tracking unavailable',
    stopped: 'Tracking stopped',
  };
  const current = status?.status ?? 'stopped';
  const toggle = async () => {
    try {
      if (current === 'paused' || current === 'stopped') await api().tracking.start();
      else await api().tracking.pause();
      refresh();
    } catch {
      // Status refresh on next poll shows the real state.
    }
  };
  return (
    <div className="flex items-center gap-2 bg-white border border-border rounded-full pl-3 pr-1.5 py-1 shadow-sm">
      <span className={`w-2 h-2 rounded-full ${dot[current]} ${current === 'active' ? 'animate-pulse' : ''}`} />
      <span className="text-xs font-medium">
        {label[current]}
        {status?.currentApp ? ` · ${status.currentApp}` : ''}
      </span>
      <button
        onClick={() => void toggle()}
        className="flex items-center gap-1 text-xs font-medium bg-deep text-white rounded-full px-2.5 py-1 hover:bg-primary"
        aria-label={current === 'paused' || current === 'stopped' ? 'Resume tracking' : 'Pause tracking'}
      >
        {current === 'paused' || current === 'stopped' ? <Play size={12} /> : <Pause size={12} />}
        {current === 'paused' || current === 'stopped' ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-full">
      <aside className={`bg-white border-r border-border flex flex-col shrink-0 transition-all ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <span className="w-8 h-8 rounded-lg bg-deep text-white flex items-center justify-center font-bold shrink-0">T</span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">Telemetry Vault</div>
              <div className="text-[11px] text-muted leading-tight">Local-first · private</div>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-light text-deep font-semibold' : 'text-muted hover:text-ink hover:bg-pale'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 px-4 py-3 text-xs text-muted hover:text-ink border-t border-border"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Collapse sidebar</span>}
        </button>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-3 px-5 h-14 border-b border-border bg-white shrink-0">
          <span className="text-sm text-muted hidden md:block">All data stays on this computer. Nothing is uploaded.</span>
          <div className="ml-auto">
            <StatusPill />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-5">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/coding" element={<Coding />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/repositories" element={<Repositories />} />
            <Route path="/focus" element={<FocusGoals />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/data" element={<DataBackups />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </HashRouter>
  );
}
