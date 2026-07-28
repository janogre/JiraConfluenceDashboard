import { app } from '@azure/functions';
import { exchangeCode, fetchAccessibleResources } from '../lib/atlassianAuth.js';
import { decrypt, readCookie, sessionCookie, clearStateCookie, STATE_COOKIE } from '../lib/session.js';

// OAuth-callback: verifiserer state, bytter code mot tokens, henter cloud-ressurser,
// setter kryptert session-cookie og redirecter til frontend.
app.http('authCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: async (request) => {
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const code = request.query.get('code');
    const state = request.query.get('state');
    const storedState = decrypt(readCookie(request, STATE_COOKIE))?.state;

    if (!state || !storedState || state !== storedState) {
      return { status: 400, body: 'Ugyldig state-parameter' };
    }

    try {
      const tokens = await exchangeCode(code);
      const session = {
        authMode: 'oauth',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
      };
      const clouds = await fetchAccessibleResources(tokens.access_token);
      session.availableClouds = clouds;
      if (clouds.length > 0) {
        session.cloudId = clouds[0].id;
        session.cloudName = clouds[0].name;
      }
      return {
        status: 302,
        headers: { Location: frontend },
        cookies: [sessionCookie(session), clearStateCookie()],
      };
    } catch (err) {
      console.error('[AUTH] Callback-feil:', err.message);
      return { status: 302, headers: { Location: `${frontend}?auth_error=callback` } };
    }
  },
});
