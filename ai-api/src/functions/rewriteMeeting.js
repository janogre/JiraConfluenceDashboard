import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic } from '../lib/anthropic.js';

app.http('rewriteMeeting', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/rewrite-meeting',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { notes, attendees, context } = body;
    if (!notes) return { status: 400, jsonBody: { error: 'Mangler notat-innhold' } };

    const systemPrompt = `Du er en profesjonell møtereferent. Renskriver uferdige møtenotater til velstrukturerte, profesjonelle referater på norsk.

Struktur alltid svaret slik (bruk markdown):
## Sammendrag
En kort oppsummering (2-4 setninger).

## Deltakere
Liste over deltakere (hvis oppgitt).

## Agendapunkter og diskusjon
Strukturerte punkter fra møtet.

## Beslutninger
Klare beslutninger som ble tatt.

## Aksjoner
Liste over aksjoner med ansvarlig person (hvis nevnt) og eventuell frist.

Regler:
- Behold ALLE faktaopplysninger nøyaktig slik de er oppgitt
- Bruk profesjonell norsk
- Ikke legg til informasjon som ikke finnes i originalen
- Sett "–" under seksjoner der det ikke er relevant innhold`;

    const userMessage = [
      attendees ? `Deltakere: ${attendees}` : null,
      context ? `Kontekst/instruksjoner: ${context}` : null,
      `Møtenotat:\n${notes}`,
    ].filter(Boolean).join('\n\n');

    try {
      const { status, data } = await callAnthropic(apiKey, {
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      return { status, jsonBody: data };
    } catch (err) {
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
