import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { resolveAuth, AuthError } from '../lib/atlassianAuth.js';
import { handleBc, bcError } from '../lib/bc/handler.js';

// Business Central: GET /api/bc/{resource}. App-nivå client-credentials (stateless).
// Krever en gyldig innlogget session (samme auth-sjekk som Atlassian-proxyen) FØR det
// app-nivå BC-tokenet brukes til å hente data — ellers ville endepunktet lekke all
// BC-innkjøps-/lagerdata til uautentiserte kallere.
app.http('bc', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bc/{resource}',
  handler: async (request) => {
    const session = readSession(request);

    // Avvis kallere uten gyldig session med 401 før noen BC-token hentes eller data leses.
    let auth;
    try {
      auth = await resolveAuth(session);
    } catch (err) {
      if (err instanceof AuthError) return { status: 401, jsonBody: { error: err.message, reauthRequired: true } };
      throw err;
    }

    // Fornyet session-cookie må følge med på svaret når access-token ble rotert (jf. atlassianProxy).
    const refreshedCookies = auth.refreshed ? [sessionCookie(auth.session)] : undefined;

    const { resource } = request.params;
    const start = Date.now();
    try {
      const result = await handleBc(resource, request.query);
      console.log(`[BC] /bc/${resource} → ${result.status}, ${Date.now() - start}ms`);
      if (refreshedCookies) result.cookies = refreshedCookies;
      return result;
    } catch (err) {
      const result = bcError(err, `/bc/${resource}`);
      if (refreshedCookies) result.cookies = refreshedCookies;
      return result;
    }
  },
});
