import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { ProfileProvider, useProfile } from './profile';
import { MoreScreen } from './screens/MoreScreen';
import { SessionScreen } from './screens/SessionScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WeekScreen } from './screens/WeekScreen';
import { WorkoutsScreen } from './screens/WorkoutsScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { BuilderScreen } from './screens/BuilderScreen';
import { ImportScreen } from './screens/ImportScreen';
import { WorkoutEditor } from './workouts/WorkoutEditor';

const TABS = [
  { path: '/today', label: 'Today' },
  { path: '/week', label: 'Week' },
  { path: '/log', label: 'Workouts' },
  { path: '/progress', label: 'Progress' },
  { path: '/more', label: 'More' },
] as const;

/** First run shows the welcome; afterwards the tabs. */
function Shell() {
  const { profile } = useProfile();
  if (!profile.onboarded) {
    return (
      <main className="content">
        <ErrorBoundary>
          <WelcomeScreen />
        </ErrorBoundary>
      </main>
    );
  }
  return (
    <>
      <main className="content">
        <ErrorBoundary>
          <Routes>
            <Route path="/today" element={<TodayScreen />} />
            <Route path="/session/:id" element={<SessionScreen />} />
            <Route path="/week" element={<WeekScreen />} />
            <Route path="/log" element={<WorkoutsScreen />} />
            <Route path="/workouts/:code" element={<WorkoutEditor />} />
            <Route path="/program/:code" element={<WorkoutEditor mode="program" />} />
            <Route path="/library" element={<LibraryScreen />} />
            <Route path="/build" element={<BuilderScreen />} />
            <Route path="/import" element={<ImportScreen />} />
            <Route path="/progress" element={<ProgressScreen />} />
            <Route path="/more" element={<MoreScreen />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.path} to={t.path} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <ProfileProvider>
        <Shell />
      </ProfileProvider>
    </HashRouter>
  );
}
