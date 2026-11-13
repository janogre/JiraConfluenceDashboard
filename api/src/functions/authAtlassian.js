import { app } from '@azure/functions';
import crypto from 'node:crypto';
import { buildAuthorizeUrl } from '../lib/atlassianAuth.js';
import { stateCookie } from '../lib/session.js';

// Starter OAuth-flyten: lagrer state i en kortlevd kryptert cookie og redirecter til Atlassian.
app.http('authAtlassian', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/atlassian',
  handler: async () => {
    const state = crypto.randomUUID();
    return {
      status: 302,
      headers: { Location: buildAuthorizeUrl(state) },
      cookies: [stateCookie(state)],
    };
  },
});
