import { useState } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Input } from '../../components/common';
import { getApiConfig, saveApiConfig, isConfigured } from '../../services/api';
import type { ApiConfig } from '../../types';
import styles from './Settings.module.css';

function getInitialConfig(): ApiConfig {
  const existingConfig = getApiConfig();
  if (existingConfig) {
    return existingConfig;
  }
  return {
    jiraBaseUrl: '',
    confluenceBaseUrl: '',
    email: '',
    apiToken: '',
    anthropicApiKey: '',
  };
}

export function Settings() {
  const [config, setConfig] = useState<ApiConfig>(getInitialConfig);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof ApiConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setError(null);
  };

  const handleSave = () => {
    // Validate required fields
    if (!config.jiraBaseUrl || !config.email || !config.apiToken) {
      setError('Please fill in all required fields');
      return;
    }

    // If Confluence URL is not set, use Jira URL (common for Atlassian Cloud)
    const configToSave = {
      ...config,
      confluenceBaseUrl: config.confluenceBaseUrl || config.jiraBaseUrl,
    };

    saveApiConfig(configToSave);
    setSaved(true);
    setError(null);
  };

  const configured = isConfigured();

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader>
          <h2>API Configuration</h2>
        </CardHeader>
        <CardContent>
          {configured && !saved && (
            <div className={styles.statusConnected}>
              <Check size={16} />
              <span>API credentials configured</span>
            </div>
          )}

          {saved && (
            <div className={styles.statusSaved}>
              <Check size={16} />
              <span>Settings saved successfully!</span>
            </div>
          )}

          {error && (
            <div className={styles.statusError}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.form}>
            <Input
              label="Jira Base URL *"
              placeholder="https://your-domain.atlassian.net"
              value={config.jiraBaseUrl}
              onChange={(e) => handleChange('jiraBaseUrl', e.target.value)}
            />

            <Input
              label="Confluence Base URL (optional, defaults to Jira URL)"
              placeholder="https://your-domain.atlassian.net"
              value={config.confluenceBaseUrl}
              onChange={(e) => handleChange('confluenceBaseUrl', e.target.value)}
            />

            <Input
              label="Email *"
              type="email"
              placeholder="your-email@company.com"
              value={config.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />

            <Input
              label="API Token *"
              type="password"
              placeholder="Your Jira/Confluence API token"
              value={config.apiToken}
              onChange={(e) => handleChange('apiToken', e.target.value)}
            />

            <Input
              label="Anthropic API Key (valgfri – brukes av Ukessammendrag)"
              type="password"
              placeholder="sk-ant-..."
              value={config.anthropicApiKey ?? ''}
              onChange={(e) => handleChange('anthropicApiKey', e.target.value)}
            />

            <Button onClick={handleSave} icon={<Save size={16} />}>
              Save Configuration
            </Button>
          </div>

          <div className={styles.help}>
            <h3>How to get an API token:</h3>
            <ol>
              <li>Go to <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Atlassian Account Settings</a></li>
              <li>Click "Create API token"</li>
              <li>Give it a name and copy the token</li>
              <li>Paste the token above</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
