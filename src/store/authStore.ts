import { create } from 'zustand';
import axios from 'axios';
import { getAuthStatus, logout as apiLogout, saveApiConfig, _registerAuthStore } from '../services/api';
import type { ApiConfig } from '../types';

interface CloudInfo {
  id: string;
  name: string;
  url: string;
}

interface AuthState {
  authenticated: boolean;
  authMode: 'oauth' | 'apikey' | null;
  cloudId: string | null;
  cloudName: string | null;
  availableClouds: CloudInfo[];
  isLoading: boolean;

  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  selectCloud: (cloudId: string) => Promise<void>;
  loginWithApiKey: (config: ApiConfig) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Registrer getter i api.ts for å unngå sirkulær avhengighet
  _registerAuthStore(() => {
    const s = get();
    return { authMode: s.authMode, cloudId: s.cloudId, authenticated: s.authenticated };
  });

  return {
  authenticated: false,
  authMode: null,
  cloudId: null,
  cloudName: null,
  availableClouds: [],
  isLoading: true,

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const status = await getAuthStatus();
      if (status.authenticated && status.authMode === 'apikey' && status.jiraBaseUrl) {
        // Synkroniser URL-er fra session til localStorage om de mangler
        const stored = localStorage.getItem('jira-confluence-config');
        if (!stored) {
          saveApiConfig({
            jiraBaseUrl: status.jiraBaseUrl,
            confluenceBaseUrl: status.confluenceBaseUrl || status.jiraBaseUrl,
            email: '',
            apiToken: '',
          });
        }
      }
      set({
        authenticated: status.authenticated,
        authMode: status.authMode ?? null,
        cloudId: status.cloudId ?? null,
        cloudName: status.cloudName ?? null,
        availableClouds: status.availableClouds ?? [],
        isLoading: false,
      });
    } catch {
      set({ authenticated: false, authMode: null, isLoading: false });
    }
  },

  logout: async () => {
    await apiLogout();
    set({ authenticated: false, authMode: null, cloudId: null, cloudName: null, availableClouds: [] });
  },

  selectCloud: async (cloudId: string) => {
    await axios.post('/auth/select-cloud', { cloudId }, { withCredentials: true });
    const cloud = get().availableClouds.find((c) => c.id === cloudId);
    set({ cloudId, cloudName: cloud?.name ?? null });
  },

  loginWithApiKey: async (config: ApiConfig) => {
    await axios.post('/auth/apikey', config, { withCredentials: true });
    saveApiConfig(config);
    set({
      authenticated: true,
      authMode: 'apikey',
      cloudId: null,
      cloudName: null,
    });
  },
  };
});
