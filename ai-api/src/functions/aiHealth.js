import { app } from '@azure/functions';

// Enkel helsesjekk — brukes til å verifisere at Functions-verten starter.
// authLevel anonymous slik at den kan sjekkes uten function-key.
app.http('aiHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ai/health',
  handler: async () => ({
    jsonBody: { status: 'ok', service: 'ai-api', timestamp: new Date().toISOString() },
  }),
});
