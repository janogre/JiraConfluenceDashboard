import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout/Layout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Confluence } from './pages/Confluence/Confluence';
import { Board } from './pages/Board/Board';
import { Todos } from './pages/Todos/Todos';
import { Settings } from './pages/Settings/Settings';
import { Risk } from './pages/Risk/Risk';
import { Digest } from './pages/Digest/Digest';
import { TeamCalendar } from './pages/Calendar/Calendar';
import { MyMetrics } from './pages/MyMetrics/MyMetrics';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="confluence" element={<Confluence />} />
            <Route path="board" element={<Board />} />
            <Route path="todos" element={<Todos />} />
            <Route path="settings" element={<Settings />} />
            <Route path="risk" element={<Risk />} />
            <Route path="digest" element={<Digest />} />
            <Route path="calendar" element={<TeamCalendar />} />
            <Route path="my-metrics" element={<MyMetrics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
