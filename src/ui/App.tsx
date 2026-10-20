import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { MoreScreen } from './screens/MoreScreen';

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
          {TABS.filter((t) => t.path !== '/more').map((t) => (
            <Route key={t.path} path={t.path} element={<Placeholder title={t.label} />} />
          ))}
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
