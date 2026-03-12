import styles from './Layout.module.css';

interface NetworkLogoProps {
  collapsed?: boolean;
}

export function NetworkLogo({ collapsed = false }: NetworkLogoProps) {
  return (
    <div className={styles.logoArea}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className={styles.logoIcon}
      >
        {/* Outer triangle edges — subtle mesh */}
        <line x1="16" y1="4" x2="26" y2="23" stroke="#95c672" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
        <line x1="16" y1="4" x2="6" y2="23" stroke="#95c672" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
        <line x1="6" y1="23" x2="26" y2="23" stroke="#95c672" strokeWidth="1" strokeLinecap="round" opacity="0.3" />

        {/* Spokes from center */}
        <line x1="16" y1="14" x2="16" y2="4" stroke="#95c672" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="16" y1="14" x2="26" y2="23" stroke="#95c672" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="16" y1="14" x2="6" y2="23" stroke="#95c672" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />

        {/* Satellite nodes */}
        <circle cx="16" cy="4" r="2.5" fill="#95c672" opacity="0.85" />
        <circle cx="26" cy="23" r="2.5" fill="#95c672" opacity="0.85" />
        <circle cx="6" cy="23" r="2.5" fill="#95c672" opacity="0.85" />

        {/* Center hub */}
        <circle cx="16" cy="14" r="4" fill="#95c672" />
        <circle cx="16" cy="14" r="2" fill="#0f3d2e" />
      </svg>

      {!collapsed && (
        <span className={styles.logoText}>
          <span className={styles.logoNet}>NET</span>
          <span className={styles.logoWork}>Work</span>
        </span>
      )}
    </div>
  );
}
