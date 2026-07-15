// OAuth mot Atlassian + auth-resolusjon. Ingen @azure/functions-import → testbar direkte.

const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

const SCOPES = [
  'read:jira-work', 'write:jira-work', 'read:jira-user',
  'read:confluence-space.summary', 'read:confluence-content.all',
  'write:confluence-content', 'offline_access',
];

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
    this.reauthRequired = true;
  }
}

export function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID,
    scope: SCOPES.join(' '),
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCode(code, fetchFn = fetch) {
  const resp = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: process.env.OAUTH_REDIRECT_URI,
    }),
  });
  if (!resp.ok) throw new Error(`Token-utveksling feilet (${resp.status})`);
  return resp.json();
}

export async function fetchAccessibleResources(accessToken, fetchFn = fetch) {
  const resp = await fetchFn(RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Henting av ressurser feilet (${resp.status})`);
  const resources = await resp.json();
  return resources.map((r) => ({ id: r.id, name: r.name, url: r.url }));
}

export async function refreshAccessToken(refreshToken, fetchFn = fetch) {
  if (!refreshToken) throw new AuthError('Ingen refresh-token');
  const resp = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) throw new AuthError('Token-refresh feilet');
  return resp.json();
}

function basic(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

export function getEnvApiAuth() {
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  if (!email || !apiToken || !jiraBaseUrl) return null;
  return {
    email,
    apiToken,
    jiraBaseUrl,
    confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL || jiraBaseUrl,
  };
}

// Sørger for gyldig access-token. Returnerer { session, refreshed }; kan kaste AuthError.
export async function ensureFreshToken(session, fetchFn = fetch) {
  if (!session.accessToken) throw new AuthError('Ikke autentisert');
  if (Date.now() <= (session.tokenExpiresAt ?? 0)) return { session, refreshed: false };
  const data = await refreshAccessToken(session.refreshToken, fetchFn);
  const updated = {
    ...session,
    accessToken: data.access_token,
    tokenExpiresAt: Date.now() + (data.expires_in - 60) * 1000,
    refreshToken: data.refresh_token || session.refreshToken,
  };
  return { session: updated, refreshed: true };
}

// Bestemmer Authorization-header ut fra session (med env-fallback). Kaster AuthError.
export async function resolveAuth(session, fetchFn = fetch) {
  if (session && session.authMode === 'oauth') {
    const { session: s, refreshed } = await ensureFreshToken(session, fetchFn);
    return { authHeader: `Bearer ${s.accessToken}`, session: s, refreshed };
  }
  if (session && session.authMode === 'apikey') {
    return { authHeader: basic(session.apiKeyEmail, session.apiKeyToken), session, refreshed: false };
  }
  const env = getEnvApiAuth();
  if (env) return { authHeader: basic(env.email, env.apiToken), session, refreshed: false };
  throw new AuthError('Ikke autentisert');
}

// Bygger /auth/me-svaret ut fra session (med env-fallback).
export function buildAuthStatus(session) {
  if (session && session.authMode === 'oauth' && session.accessToken) {
    return {
      authenticated: true,
      authMode: 'oauth',
      cloudId: session.cloudId,
      cloudName: session.cloudName,
      availableClouds: session.availableClouds ?? [],
    };
  }
  if (session && session.authMode === 'apikey') {
    return {
      authenticated: true,
      authMode: 'apikey',
      jiraBaseUrl: session.jiraBaseUrl,
      confluenceBaseUrl: session.confluenceBaseUrl,
    };
  }
  const env = getEnvApiAuth();
  if (env) {
    return { authenticated: true, authMode: 'apikey', jiraBaseUrl: env.jiraBaseUrl, confluenceBaseUrl: env.confluenceBaseUrl };
  }
  return { authenticated: false };
}
