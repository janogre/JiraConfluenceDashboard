import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { resolveAuth, AuthError } from '../lib/atlassianAuth.js';

// SSRF-vern: kun HTTPS mot Atlassian er et gyldig mål her. Frontend sender enten
// brukerens egen Atlassian-base (*.atlassian.net) eller api.atlassian.com (oauth /myself).
// Bruker url.hostname (ikke url.host) så port/userinfo ikke kan flytte den effektive verten,
// og punkt-grense på atlassian.net avviser omgåelser som 'evil-atlassian.net' og
// 'atlassian.net.evil.com'. Bevisst duplisert lokalt for å holde denne fiksen selvstendig.
export function isAllowedAtlassianTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'api.atlassian.com') return true;
  return host === 'atlassian.net' || host.endsWith('.atlassian.net');
}

// Tester tilkoblingen mot Atlassian. Mål-URL fra X-Target-URL, eller /myself i oauth-modus.
app.http('testConnection', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'test-connection',
  handler: async (request) => {
    const session = readSession(request);

    let auth;
    try {
      auth = await resolveAuth(session);
    } catch (err) {
      if (err instanceof AuthError) return { status: 401, jsonBody: { error: err.message, reauthRequired: true } };
      throw err;
    }

    const headerTarget = request.headers.get('x-target-url');
    const targetUrl =
      headerTarget ||
      (session?.authMode === 'oauth'
        ? `https://api.atlassian.com/ex/jira/${session.cloudId}/rest/api/3/myself`
        : null);
    const base = auth.refreshed ? { cookies: [sessionCookie(auth.session)] } : {};
    if (!targetUrl) return { ...base, jsonBody: { success: false, error: 'Mangler X-Target-URL header' } };
    // Valider målet FØR fetch og FØR Authorization-headeren sendes – ellers kan et
    // vilkårlig X-Target-URL lekke tokenet og brukes som SSRF-orakel mot interne tjenester.
    if (!isAllowedAtlassianTarget(targetUrl)) {
      return { ...base, status: 400, jsonBody: { success: false, error: 'Ugyldig mål-URL – kun Atlassian-tjenester er tillatt' } };
    }
    try {
      const response = await fetch(targetUrl, {
        headers: { Authorization: auth.authHeader, Accept: 'application/json' },
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        return { ...base, jsonBody: { success: false, error: 'Omdirigering oppdaget – autentisering kan ha feilet', status: response.status } };
      }
      if (response.status >= 400) {
        const text = await response.text();
        return { ...base, jsonBody: { success: false, error: 'API-feil', status: response.status, body: text.substring(0, 500) } };
      }
      return { ...base, jsonBody: { success: true, status: response.status, message: 'Tilkobling vellykket!' } };
    } catch (err) {
      return { ...base, jsonBody: { success: false, error: err.message } };
    }
  },
});
