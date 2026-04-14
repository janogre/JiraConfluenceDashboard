import { useState } from 'react';
import { LogIn, Key, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getApiConfig } from '../../services/api';
import type { ApiConfig } from '../../types';
import styles from './Login.module.css';

export function Login() {
  const { loginWithApiKey } = useAuthStore();
  const [visModus, setVisModus] = useState<'valg' | 'apikey'>('valg');
  const [config, setConfig] = useState<ApiConfig>(() =>
    getApiConfig() ?? { jiraBaseUrl: '', confluenceBaseUrl: '', email: '', apiToken: '', anthropicApiKey: '' }
  );
  const [feil, setFeil] = useState<string | null>(null);
  const [laster, setLaster] = useState(false);

  const handleOAuth = () => {
    window.location.href = '/auth/atlassian';
  };

  const handleApiKeyLogin = async () => {
    if (!config.jiraBaseUrl || !config.email || !config.apiToken) {
      setFeil('Fyll inn alle påkrevde felt');
      return;
    }
    setFeil(null);
    setLaster(true);
    try {
      await loginWithApiKey({
        ...config,
        confluenceBaseUrl: config.confluenceBaseUrl || config.jiraBaseUrl,
      });
    } catch {
      setFeil('Innlogging feilet. Sjekk credentials og prøv igjen.');
    } finally {
      setLaster(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/neas-logo.png" alt="NEAS" className={styles.logoImg} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <h1 className={styles.title}>NEAS Dashboard</h1>
          <p className={styles.subtitle}>Jira & Confluence</p>
        </div>

        {visModus === 'valg' && (
          <div className={styles.valgWrapper}>
            <button className={styles.oauthBtn} onClick={handleOAuth}>
              <LogIn size={18} />
              Logg inn med Atlassian
            </button>
            <div className={styles.divider}><span>eller</span></div>
            <button className={styles.apikeyBtn} onClick={() => setVisModus('apikey')}>
              <Key size={16} />
              Bruk API-nøkkel (lokal utvikling)
            </button>
          </div>
        )}

        {visModus === 'apikey' && (
          <div className={styles.form}>
            <button className={styles.tilbakeBtn} onClick={() => setVisModus('valg')}>
              ← Tilbake
            </button>
            <h2 className={styles.formTitle}>API-nøkkel innlogging</h2>

            {feil && (
              <div className={styles.feil}>
                <AlertCircle size={15} />
                {feil}
              </div>
            )}

            <label className={styles.label}>
              Jira Base URL *
              <input
                className={styles.input}
                type="url"
                placeholder="https://din-domene.atlassian.net"
                value={config.jiraBaseUrl}
                onChange={(e) => setConfig((p) => ({ ...p, jiraBaseUrl: e.target.value }))}
              />
            </label>

            <label className={styles.label}>
              Confluence Base URL
              <input
                className={styles.input}
                type="url"
                placeholder="Valgfri — bruker Jira URL som standard"
                value={config.confluenceBaseUrl}
                onChange={(e) => setConfig((p) => ({ ...p, confluenceBaseUrl: e.target.value }))}
              />
            </label>

            <label className={styles.label}>
              E-post *
              <input
                className={styles.input}
                type="email"
                placeholder="din-epost@selskap.no"
                value={config.email}
                onChange={(e) => setConfig((p) => ({ ...p, email: e.target.value }))}
              />
            </label>

            <label className={styles.label}>
              API-token *
              <input
                className={styles.input}
                type="password"
                placeholder="Atlassian API-token"
                value={config.apiToken}
                onChange={(e) => setConfig((p) => ({ ...p, apiToken: e.target.value }))}
              />
            </label>

            <label className={styles.label}>
              Anthropic API-nøkkel (valgfri)
              <input
                className={styles.input}
                type="password"
                placeholder="sk-ant-..."
                value={config.anthropicApiKey ?? ''}
                onChange={(e) => setConfig((p) => ({ ...p, anthropicApiKey: e.target.value }))}
              />
            </label>

            <button className={styles.oauthBtn} onClick={handleApiKeyLogin} disabled={laster}>
              {laster ? 'Logger inn…' : 'Logg inn'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
