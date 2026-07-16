import axios, { type AxiosInstance } from 'axios';
import type { ApiConfig } from '../types';

// Relativ URL — tunneles via Vite-proxy lokalt, og direkte i produksjon (samme domene)
const PROXY_URL = '';

let apiInstance: AxiosInstance | null = null;
let currentConfig: ApiConfig | null = null;

export function getApiConfig(): ApiConfig | null {
  const stored = localStorage.getItem('jira-confluence-config');
  if (stored) {
    return JSON.parse(stored);
  }
  return null;
}

export function saveApiConfig(config: ApiConfig): void {
  localStorage.setItem('jira-confluence-config', JSON.stringify(config));
  currentConfig = config;
  apiInstance = null;
}

export function getApi(): AxiosInstance {
  if (!apiInstance) {
    apiInstance = axios.create({
      baseURL: PROXY_URL,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Interceptor: konverter full URL til proxy-kall med X-Target-URL header
    apiInstance.interceptors.request.use((requestConfig) => {
      const fullUrl = requestConfig.url || '';
      if (fullUrl.startsWith('http')) {
        requestConfig.headers['X-Target-URL'] = fullUrl;
        requestConfig.url = '/api/atlassian/proxy';
      }
      return requestConfig;
    });
  }
  return apiInstance;
}

// Auth-status fra proxy (session-basert)
export async function getAuthStatus(): Promise<{
  authenticated: boolean;
  authMode?: 'oauth' | 'apikey';
  cloudId?: string;
  cloudName?: string;
  availableClouds?: { id: string; name: string; url: string }[];
  jiraBaseUrl?: string;
  confluenceBaseUrl?: string;
}> {
  const resp = await axios.get('/auth/me', { withCredentials: true });
  return resp.data;
}

// Lagre API-nøkkel-credentials i proxy-session + localStorage (for URL-oppslag)
export async function saveApiKeyToProxy(config: ApiConfig): Promise<void> {
  await axios.post('/auth/apikey', config, { withCredentials: true });
  saveApiConfig(config);
  apiInstance = null;
}

// Logg ut
export async function logout(): Promise<void> {
  await axios.post('/auth/logout', {}, { withCredentials: true });
  localStorage.removeItem('jira-confluence-config');
  currentConfig = null;
  apiInstance = null;
}

// Referanse til authStore settes av authStore ved init for å unngå sirkulær avhengighet
let _getAuthState: (() => { authMode: string | null; cloudId: string | null; authenticated: boolean }) | null = null;

export function _registerAuthStore(fn: typeof _getAuthState) {
  _getAuthState = fn;
}

export function getJiraBaseUrl(): string {
  const auth = _getAuthState?.();
  if (auth?.authMode === 'oauth' && auth.cloudId) {
    return `https://api.atlassian.com/ex/jira/${auth.cloudId}`;
  }
  const config = currentConfig || getApiConfig();
  if (!config) throw new Error('API ikke konfigurert');
  return config.jiraBaseUrl.replace(/\/$/, '').replace(/\/jira$/, '');
}

export function getConfluenceBaseUrl(): string {
  const auth = _getAuthState?.();
  if (auth?.authMode === 'oauth' && auth.cloudId) {
    return `https://api.atlassian.com/ex/confluence/${auth.cloudId}`;
  }
  const config = currentConfig || getApiConfig();
  if (!config) throw new Error('API ikke konfigurert');
  return config.confluenceBaseUrl.replace(/\/$/, '').replace(/\/wiki$/, '');
}

export function isConfigured(): boolean {
  const auth = _getAuthState?.();
  if (auth?.authenticated) return true;
  return getApiConfig() !== null;
}

export function getConfig(): ApiConfig | null {
  return getApiConfig();
}
