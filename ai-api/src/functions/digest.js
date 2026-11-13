import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic } from '../lib/anthropic.js';

app.http('digest', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/digest',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { messages } = body;
    if (!messages) return { status: 400, jsonBody: { error: 'Mangler messages' } };

    try {
      const { status, data } = await callAnthropic(apiKey, { max_tokens: 1500, messages });
      return { status, jsonBody: data };
    } catch (err) {
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
