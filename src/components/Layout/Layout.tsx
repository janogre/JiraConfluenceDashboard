import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Kanban,
  CheckSquare,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NetworkLogo } from './NetworkLogo';
import styles from './Layout.module.css';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/confluence', icon: FileText, label: 'Confluence' },
  { path: '/board', icon: Kanban, label: 'Jira Board' },
  { path: '/todos', icon: CheckSquare, label: 'My Todos' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  const getPageTitle = () => {
    const current = navItems.find((item) => item.path === location.pathname);
    return current?.label || 'NETWork';
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button
          className={styles.menuButton}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h1 className={styles.title}>{getPageTitle()}</h1>
      </header>

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <NetworkLogo />
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className={`${styles.main} ${sidebarOpen ? styles.mainWithSidebar : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
