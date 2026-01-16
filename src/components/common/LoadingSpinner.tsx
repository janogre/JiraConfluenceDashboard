import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`${styles.spinner} ${styles[size]} ${className}`}>
      <div className={styles.ring}></div>
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message = 'Loading...' }: LoadingOverlayProps) {
  return (
    <div className={styles.overlay}>
      <LoadingSpinner size="lg" />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
