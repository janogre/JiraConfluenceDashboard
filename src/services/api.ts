import axios, { type AxiosInstance } from 'axios';
import type { ApiConfig } from '../types';

const PROXY_URL = 'http://localhost:3001';

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
  apiInstance = null; // Reset to force recreation with new config
}

export function getApi(): AxiosInstance {
  if (!apiInstance) {
    const config = getApiConfig();
    if (!config) {
      throw new Error('API not configured. Please configure your Jira/Confluence credentials.');
    }

    currentConfig = config;
    apiInstance = axios.create({
      baseURL: PROXY_URL,
      headers: {
        'Authorization': `Basic ${btoa(`${config.email}:${config.apiToken}`)}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add interceptor to set target URL header
    apiInstance.interceptors.request.use((requestConfig) => {
      const fullUrl = requestConfig.url || '';

      // If it's a full URL (to Atlassian), convert to proxy request
      if (fullUrl.startsWith('http')) {
        requestConfig.headers['X-Target-URL'] = fullUrl;
        requestConfig.url = '/api/atlassian/proxy';
      }

      return requestConfig;
    });
  }
  return apiInstance;
}

export function getJiraBaseUrl(): string {
  const config = currentConfig || getApiConfig();
  if (!config) throw new Error('API not configured');
  // Remove trailing slash and /jira if present
  return config.jiraBaseUrl.replace(/\/$/, '').replace(/\/jira$/, '');
}

export function getConfluenceBaseUrl(): string {
  const config = currentConfig || getApiConfig();
  if (!config) throw new Error('API not configured');
  // Remove trailing slash and /wiki if present (will be added by service)
  return config.confluenceBaseUrl.replace(/\/$/, '').replace(/\/wiki$/, '');
}

export function isConfigured(): boolean {
  return getApiConfig() !== null;
}
