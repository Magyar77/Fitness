import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { MoreScreen } from './screens/MoreScreen';
import { SessionScreen } from './screens/SessionScreen';
import { TodayScreen } from './screens/TodayScreen';

const TABS = [
  { path: '/today', label: 'Today' },
  { path: '/week', label: 'Week' },
  { path: '/log', label: 'Log' },
  { path: '/progress', label: 'Progress' },
  { path: '/more', label: 'More' },
] as const;

function Placeholder({ title }: { title: string }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      <p className="muted">Coming in a later milestone.</p>
    </section>
  );
}

export function App() {
  return (
    <HashRouter>
      <main className="content">
        <Routes>
          <Route path="/today" element={<TodayScreen />} />
          <Route path="/session/:id" element={<SessionScreen />} />
          <Route path="/week" element={<Placeholder title="Week" />} />
          <Route path="/log" element={<Placeholder title="Log" />} />
          <Route path="/progress" element={<Placeholder title="Progress" />} />
          <Route path="/more" element={<MoreScreen />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.path} to={t.path} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </HashRouter>
  );
}
