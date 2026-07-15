import { app } from '@azure/functions';
import { handleBc, bcError } from '../lib/bc/handler.js';

// Business Central: GET /api/bc/{resource}. App-nivå client-credentials (stateless).
app.http('bc', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bc/{resource}',
  handler: async (request) => {
    const { resource } = request.params;
    const start = Date.now();
    try {
      const result = await handleBc(resource, request.query);
      console.log(`[BC] /bc/${resource} → ${result.status}, ${Date.now() - start}ms`);
      return result;
    } catch (err) {
      return bcError(err, `/bc/${resource}`);
    }
  },
});
