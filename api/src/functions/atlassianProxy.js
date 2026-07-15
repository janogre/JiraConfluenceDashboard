import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { resolveAuth, AuthError } from '../lib/atlassianAuth.js';
import { forwardToAtlassian } from '../lib/atlassianProxy.js';

// Videresender alle forespørsler til Atlassian. Mål-URL kommer i X-Target-URL-headeren.
// Setter fornyet session-cookie dersom access-token ble oppdatert underveis.
app.http('atlassianProxy', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  authLevel: 'anonymous',
  route: 'atlassian/proxy',
  handler: async (request) => {
    const session = readSession(request);

    let auth;
    try {
      auth = await resolveAuth(session);
    } catch (err) {
      if (err instanceof AuthError) return { status: 401, jsonBody: { error: err.message, reauthRequired: true } };
      throw err;
    }

    const targetUrl = request.headers.get('x-target-url');
    if (!targetUrl) return { status: 400, jsonBody: { error: 'Mangler X-Target-URL header' } };

    const bodyText = request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : '';

    let result;
    try {
      result = await forwardToAtlassian({
        method: request.method,
        targetUrl,
        query: request.query,
        bodyText,
        authHeader: auth.authHeader,
      });
    } catch (err) {
      console.error('[PROXY] Feil:', err.message);
      return { status: 500, jsonBody: { error: 'Proxy-feil', message: err.message } };
    }

    if (auth.refreshed) result.cookies = [sessionCookie(auth.session)];
    return result;
  },
});
