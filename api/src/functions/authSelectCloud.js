import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { fetchAccessibleResources } from '../lib/atlassianAuth.js';

// Bytter aktiv Atlassian-instans og setter oppdatert session-cookie.
app.http('authSelectCloud', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/select-cloud',
  handler: async (request) => {
    const session = readSession(request);
    if (!session || session.authMode !== 'oauth') {
      return { status: 401, jsonBody: { error: 'Ikke autentisert' } };
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    }
    let clouds = session.availableClouds;
    if (!clouds && session.cloudsTrimmed) {
      try {
        clouds = await fetchAccessibleResources(session.accessToken);
      } catch {
        clouds = [];
      }
    }
    const found = (clouds ?? []).find((c) => c.id === body.cloudId);
    if (!found) return { status: 400, jsonBody: { error: 'Ugyldig cloudId' } };
    const updated = { ...session, cloudId: found.id, cloudName: found.name };
    return { jsonBody: { ok: true }, cookies: [sessionCookie(updated)] };
  },
});
