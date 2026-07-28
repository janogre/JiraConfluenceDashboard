import { app } from '@azure/functions';

// Enkel helsesjekk — brukes til å verifisere at Functions-verten starter.
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ({
    jsonBody: { status: 'ok', timestamp: new Date().toISOString() },
  }),
});
