import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutV2 as Layout } from './components/Layout/LayoutV2';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Confluence } from './pages/Confluence/Confluence';
import { Board } from './pages/Board/Board';
import { Todos } from './pages/Todos/Todos';
import { Settings } from './pages/Settings/Settings';
import { Risk } from './pages/Risk/Risk';
import { Digest } from './pages/Digest/Digest';
import { TeamCalendar } from './pages/Calendar/Calendar';
import { MyMetrics } from './pages/MyMetrics/MyMetrics';
import { ProjectWizard } from './pages/ProjectWizard/ProjectWizard';
import { Team } from './pages/Team/Team';
import { Lager } from './pages/Lager/Lager';
import { Login } from './pages/Login/Login';
import { AuthCallback } from './pages/AuthCallback/AuthCallback';
import { useAuthStore } from './store/authStore';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function App() {
  const { authenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Laster…</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* OAuth callback — tilgjengelig uten autentisering */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Resten av appen krever innlogging */}
          {authenticated ? (
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="confluence" element={<Confluence />} />
              <Route path="board" element={<Board />} />
              <Route path="settings" element={<Settings />} />
              <Route path="risk" element={<Risk />} />
              <Route path="digest" element={<Digest />} />
              <Route path="calendar" element={<TeamCalendar />} />
              <Route path="my-metrics" element={<MyMetrics />} />
              <Route path="project-wizard" element={<ProjectWizard />} />
              <Route path="team" element={<Team />} />
              <Route path="lager" element={<Lager />} />
              <Route path="todos" element={<Todos />} />
            </Route>
          ) : (
            <Route path="*" element={<Login />} />
          )}
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
