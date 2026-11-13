import { app } from '@azure/functions';
import { readSession } from '../lib/session.js';
import { buildAuthStatus, fetchAccessibleResources } from '../lib/atlassianAuth.js';

// Returnerer autentiseringsstatus. Henter availableClouds på nytt dersom de ble
// trimmet ut av cookien (H.1-mitigering, spec §5).
app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (request) => {
    const session = readSession(request);
    const status = buildAuthStatus(session);
    if (status.authenticated && status.authMode === 'oauth' && session?.cloudsTrimmed) {
      try {
        status.availableClouds = await fetchAccessibleResources(session.accessToken);
      } catch {
        /* behold tom liste ved feil */
      }
    }
    return { jsonBody: status };
  },
});
