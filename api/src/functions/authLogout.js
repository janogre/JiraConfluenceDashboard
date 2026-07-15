import { app } from '@azure/functions';
import { clearSessionCookie } from '../lib/session.js';

// Logger ut ved å tømme session-cookien.
app.http('authLogout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: async () => ({ jsonBody: { ok: true }, cookies: [clearSessionCookie()] }),
});
