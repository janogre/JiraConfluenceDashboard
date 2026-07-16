import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic, responseText } from '../lib/anthropic.js';

app.http('rewriteDescription', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/rewrite-description',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { text, arbeidstype } = body;
    if (!text || !text.trim()) return { status: 400, jsonBody: { error: 'Mangler beskrivelse' } };

    const erFeil = String(arbeidstype || '').toLowerCase() === 'feil';
    const struktur = erFeil
      ? `Strukturer som korte avsnitt med disse ledetekstene, hver på egen linje (ingen markdown):
Symptom: <hva som observeres>
Konsekvens: <hvem eller hva som påvirkes>
Antatt årsak: <ta kun med denne linjen hvis det fremgår av teksten>`
      : `Skriv ett til tre korte, klare avsnitt i saklig, profesjonell form.`;

    const systemPrompt = `Du er en teknisk skribent for et bredbånds-/telekomselskap.
Skriv om den uferdige sakbeskrivelsen til en ryddig, presis Jira-beskrivelse på norsk bokmål.
${struktur}
Regler:
- Behold ALLE faktaopplysninger nøyaktig. Ikke finn på detaljer (navn, tall, lokasjoner, utstyr) som ikke står i originalen.
- Ikke bruk markdown (ingen #, *, eller bindestrek-lister). Bruk vanlige avsnitt adskilt med linjeskift.
- Vær konsis. Returner KUN selve beskrivelsen – ingen forklaring, overskrift eller anførselstegn rundt.`;

    try {
      const { status, data } = await callAnthropic(apiKey, {
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }],
      });
      if (status >= 400) return { status, jsonBody: { error: data.error?.message || 'AI-feil' } };
      const beskrivelse = responseText(data).trim();
      return { jsonBody: { beskrivelse } };
    } catch (err) {
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
