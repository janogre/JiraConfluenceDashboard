/**
 * LayoutV2 – klikk-for-å-utvide sidebar (test)
 * For å rulle tilbake: endre App.tsx til å importere Layout i stedet for LayoutV2,
 * og slett LayoutV2.tsx + LayoutV2.module.css.
 */
import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  Kanban,
  CheckSquare,
  Settings,
  AlertTriangle,
  Sparkles,
  Calendar,
  TrendingUp,
  PanelLeftOpen,
  PanelLeftClose,
  Wand2,
} from 'lucide-react';
import { NetworkLogo } from './NetworkLogo';
import styles from './LayoutV2.module.css';

const COLLAPSED = 64;
const EXPANDED = 224;

const navItems = [
  { path: '/',                icon: LayoutDashboard, label: 'Dashboard'       },
  { path: '/project-wizard', icon: Wand2,           label: 'Prosjektwizard'  },
  { path: '/confluence',     icon: FileText,         label: 'Confluence'      },
  { path: '/board',      icon: Kanban,           label: 'Jira Board'     },
  { path: '/todos',      icon: CheckSquare,      label: 'Mine oppgaver'  },
  { path: '/risk',       icon: AlertTriangle,    label: 'Risikopanel'    },
  { path: '/digest',     icon: Sparkles,         label: 'Ukessammendrag' },
  { path: '/calendar',   icon: Calendar,         label: 'Team-kalender'  },
  { path: '/my-metrics', icon: TrendingUp,       label: 'Mine metrics'   },
  { path: '/settings',   icon: Settings,         label: 'Settings'       },
];

const sidebarVariants = {
  open:     { width: EXPANDED },
  closed:   { width: COLLAPSED },
};

const labelVariants = {
  open:   { opacity: 1, maxWidth: 160, transition: { duration: 0.18, delay: 0.05 } },
  closed: { opacity: 0, maxWidth: 0,   transition: { duration: 0.12 } },
};

export function LayoutV2() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const getPageTitle = () => {
    const current = navItems.find((item) => item.path === location.pathname);
    return current?.label || 'NETWork';
  };

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <motion.aside
        className={styles.sidebar}
        variants={sidebarVariants}
        animate={open ? 'open' : 'closed'}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <NetworkLogo collapsed={!open} />

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>
                <item.icon size={20} />
              </span>
              <motion.span
                className={styles.navLabel}
                variants={labelVariants}
                animate={open ? 'open' : 'closed'}
              >
                {item.label}
              </motion.span>
            </NavLink>
          ))}
        </nav>
      </motion.aside>

      {/* ── Right panel ── */}
      <div className={styles.rightPanel}>
        <header className={styles.header}>
          <button
            className={styles.toggleBtn}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Skjul meny' : 'Vis meny'}
          >
            {open ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
          <h1 className={styles.title}>{getPageTitle()}</h1>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
