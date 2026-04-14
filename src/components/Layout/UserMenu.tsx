import { useState } from 'react';
import { LogOut, ChevronDown, Cloud } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import styles from './UserMenu.module.css';

export function UserMenu() {
  const { authMode, cloudName, availableClouds, cloudId, logout, selectCloud } = useAuthStore();
  const [open, setOpen] = useState(false);

  if (!authMode) return null;

  const visNavn = authMode === 'oauth' ? (cloudName ?? 'Atlassian') : 'API-nøkkel';

  return (
    <div className={styles.wrapper}>
      <button className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        <Cloud size={15} />
        <span className={styles.navn}>{visNavn}</span>
        <ChevronDown size={13} className={open ? styles.chevronOpen : undefined} />
      </button>

      {open && (
        <div className={styles.dropdown}>
          {authMode === 'oauth' && availableClouds.length > 1 && (
            <>
              <div className={styles.seksjonTittel}>Bytt instans</div>
              {availableClouds.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.item} ${c.id === cloudId ? styles.itemAktiv : ''}`}
                  onClick={() => { selectCloud(c.id); setOpen(false); }}
                >
                  {c.name}
                </button>
              ))}
              <div className={styles.divider} />
            </>
          )}
          <button
            className={`${styles.item} ${styles.loggUtItem}`}
            onClick={() => { logout(); setOpen(false); }}
          >
            <LogOut size={14} />
            Logg ut
          </button>
        </div>
      )}
    </div>
  );
}
