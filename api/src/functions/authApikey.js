import { app } from '@azure/functions';
import { sessionCookie } from '../lib/session.js';

// API-nøkkel-innlogging (midlertidig reserve til OAuth er verifisert i prod, spec §8d).
// Lagrer kredensialene i den krypterte cookien. Anthropic-nøkkel håndteres IKKE her.
app.http('authApikey', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/apikey',
  handler: async (request) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { email, apiToken, jiraBaseUrl, confluenceBaseUrl } = body;
    if (!email || !apiToken || !jiraBaseUrl) {
      return { status: 400, jsonBody: { error: 'Mangler påkrevde felt' } };
    }
    const session = {
      authMode: 'apikey',
      apiKeyEmail: email,
      apiKeyToken: apiToken,
      jiraBaseUrl,
      confluenceBaseUrl: confluenceBaseUrl || jiraBaseUrl,
    };
    return { jsonBody: { ok: true }, cookies: [sessionCookie(session)] };
  },
});
