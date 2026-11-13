import { useState, useMemo } from 'react';
import { Save, Check, AlertCircle, LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardContent, Button, Input } from '../../components/common';
import { getApiConfig, saveApiKeyToProxy } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { getAllProjectComponents } from '../../services/jiraService';
import { loadTeamConfig, saveTeamConfig, TEAM_NAMES } from '../../store/teamStore';
import type { TeamConfig, TeamName } from '../../store/teamStore';
import { lagretKravnivaa, lagreKravnivaa, KRAVNIVAAER, type Kravnivaa } from '../../config/jiraStructure';
import type { ApiConfig } from '../../types';
import styles from './Settings.module.css';

function getInitialConfig(): ApiConfig {
  const existingConfig = getApiConfig();
  if (existingConfig) return existingConfig;
  return { jiraBaseUrl: '', confluenceBaseUrl: '', email: '', apiToken: '' };
}

export function Settings() {
  const { authMode, cloudId, cloudName, availableClouds, selectCloud, logout } = useAuthStore();
  const [config, setConfig] = useState<ApiConfig>(getInitialConfig);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof ApiConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!config.jiraBaseUrl || !config.email || !config.apiToken) {
      setError('Fyll inn alle påkrevde felt');
      return;
    }
    const configToSave = { ...config, confluenceBaseUrl: config.confluenceBaseUrl || config.jiraBaseUrl };
    await saveApiKeyToProxy(configToSave);
    setSaved(true);
    setError(null);
  };

  const configured = authMode === 'oauth' || !!(config.jiraBaseUrl && config.email && config.apiToken);

  const [teamConfig, setTeamConfig] = useState<TeamConfig>(loadTeamConfig);
  const [teamSaved, setTeamSaved] = useState(false);
  const [componentSearch, setComponentSearch] = useState<Partial<Record<TeamName, string>>>({});
  const [openDropdown, setOpenDropdown] = useState<TeamName | null>(null);

  const [kravnivaa, setKravnivaa] = useState<Kravnivaa>(lagretKravnivaa);
  const [kravnivaaSaved, setKravnivaaSaved] = useState(false);

  const handleKravnivaaChange = (n: Kravnivaa) => {
    setKravnivaa(n);
    lagreKravnivaa(n);
    setKravnivaaSaved(true);
    setTimeout(() => setKravnivaaSaved(false), 2000);
  };

  const { data: allComponents = [] } = useQuery({
    queryKey: ['allProjectComponents'],
    queryFn: getAllProjectComponents,
    enabled: configured,
    staleTime: 1000 * 60 * 30,
  });

  const assignedComponents = useMemo(
    () => new Set(TEAM_NAMES.flatMap((t) => teamConfig[t])),
    [teamConfig]
  );

  const handleAddComponent = (team: TeamName, compName: string) => {
    setTeamConfig((prev) => ({ ...prev, [team]: [...prev[team], compName] }));
    setComponentSearch((prev) => ({ ...prev, [team]: '' }));
    setOpenDropdown(null);
    setTeamSaved(false);
  };

  const handleRemoveComponent = (team: TeamName, compName: string) => {
    setTeamConfig((prev) => ({ ...prev, [team]: prev[team].filter((c) => c !== compName) }));
    setTeamSaved(false);
  };

  const handleSaveTeamConfig = () => {
    saveTeamConfig(teamConfig);
    setTeamSaved(true);
  };

  return (
    <div className={styles.container}>
      {/* ── API-tilgang ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>API-tilgang</h2>
        </CardHeader>
        <CardContent>
          {authMode === 'oauth' ? (
            /* OAuth-modus */
            <div className={styles.form}>
              <div className={styles.statusConnected}>
                <Check size={16} />
                <span>Innlogget via Atlassian OAuth — {cloudName ?? 'ukjent instans'}</span>
              </div>

              {availableClouds.length > 1 && (
                <div>
                  <label className={styles.fieldLabel}>Atlassian-instans</label>
                  <select
                    className={styles.select}
                    value={cloudId ?? ''}
                    onChange={(e) => selectCloud(e.target.value)}
                  >
                    {availableClouds.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                onClick={logout}
                icon={<LogOut size={16} />}
                style={{ marginTop: 8, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Logg ut
              </Button>
            </div>
          ) : (
            /* API-nøkkel-modus */
            <>
              {configured && !saved && (
                <div className={styles.statusConnected}>
                  <Check size={16} />
                  <span>API credentials konfigurert</span>
                </div>
              )}
              {saved && (
                <div className={styles.statusSaved}>
                  <Check size={16} />
                  <span>Innstillinger lagret!</span>
                </div>
              )}
              {error && (
                <div className={styles.statusError}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              <div className={styles.form}>
                <Input label="Jira Base URL *" placeholder="https://din-domene.atlassian.net" value={config.jiraBaseUrl} onChange={(e) => handleChange('jiraBaseUrl', e.target.value)} />
                <Input label="Confluence Base URL (valgfri)" placeholder="https://din-domene.atlassian.net" value={config.confluenceBaseUrl} onChange={(e) => handleChange('confluenceBaseUrl', e.target.value)} />
                <Input label="E-post *" type="email" placeholder="din-epost@selskap.no" value={config.email} onChange={(e) => handleChange('email', e.target.value)} />
                <Input label="API-token *" type="password" placeholder="Ditt Jira/Confluence API-token" value={config.apiToken} onChange={(e) => handleChange('apiToken', e.target.value)} />
                <Button onClick={handleSave} icon={<Save size={16} />}>Lagre konfigurasjon</Button>
              </div>
              <div className={styles.help}>
                <h3>Slik får du et API-token:</h3>
                <ol>
                  <li>Gå til <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Atlassian kontoinnstillinger</a></li>
                  <li>Klikk «Create API token»</li>
                  <li>Gi det et navn og kopier tokenet</li>
                  <li>Lim inn tokenet over</li>
                </ol>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Team-oppsett ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>Team-oppsett</h2>
        </CardHeader>
        <CardContent>
          {teamSaved && (
            <div className={styles.statusSaved}>
              <Check size={16} />
              <span>Team-oppsett lagret!</span>
            </div>
          )}
          {!configured && (
            <div className={styles.statusError}>
              <AlertCircle size={16} />
              <span>Konfigurer API-tilgang først for å hente komponenter.</span>
            </div>
          )}

          <div className={styles.teamGrid}>
            {TEAM_NAMES.map((team) => {
              const search = componentSearch[team] ?? '';
              const suggestions = allComponents
                .filter((c) => !assignedComponents.has(c.name) && c.name.toLowerCase().includes(search.toLowerCase()))
                .slice(0, 8);

              return (
                <div key={team} className={styles.teamBox}>
                  <div className={styles.teamBoxTitle}>{team}</div>
                  <div className={styles.teamChips}>
                    {teamConfig[team].map((comp) => (
                      <span key={comp} className={styles.teamChip}>
                        {comp}
                        <button className={styles.teamChipRemove} onClick={() => handleRemoveComponent(team, comp)} title={`Fjern ${comp}`}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className={styles.teamCompSearch}>
                    <input
                      className={styles.teamCompInput}
                      placeholder="+ Legg til komponent…"
                      value={search}
                      onChange={(e) => { setComponentSearch((prev) => ({ ...prev, [team]: e.target.value })); setOpenDropdown(team); }}
                      onFocus={() => setOpenDropdown(team)}
                      onBlur={() => setTimeout(() => setOpenDropdown(null), 150)}
                    />
                    {openDropdown === team && suggestions.length > 0 && (
                      <div className={styles.teamCompDropdown}>
                        {suggestions.map((c) => (
                          <div key={c.name} className={styles.teamCompOption} onMouseDown={() => handleAddComponent(team, c.name)}>{c.name}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Button onClick={handleSaveTeamConfig} icon={<Save size={16} />}>Lagre team-oppsett</Button>
        </CardContent>
      </Card>

      {/* ── Saksregistrering ──────────────────────────── */}
      <Card>
        <CardHeader>
          <h2>Saksregistrering</h2>
        </CardHeader>
        <CardContent>
          {kravnivaaSaved && (
            <div className={styles.statusSaved}>
              <Check size={16} />
              <span>Kravnivå lagret!</span>
            </div>
          )}
          <div className={styles.form}>
            <div>
              <label className={styles.fieldLabel}>Obligatoriske felt ved hurtigregistrering (kravnivå)</label>
              <select
                className={styles.select}
                value={kravnivaa}
                onChange={(e) => handleKravnivaaChange(e.target.value as Kravnivaa)}
              >
                {KRAVNIVAAER.map((n) => (
                  <option key={n.id} value={n.id}>{n.navn}</option>
                ))}
              </select>
              <p style={{ marginTop: 8, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {KRAVNIVAAER.find((n) => n.id === kravnivaa)?.beskrivelse}
              </p>
              <p style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                Styrer hvilke felt som må fylles på <strong>/ny-sak</strong> før en sak kan opprettes. Mangler noe, blir du spurt med målrettede spørsmål.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
