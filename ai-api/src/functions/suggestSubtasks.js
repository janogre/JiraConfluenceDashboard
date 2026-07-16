import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic, responseText, extractJson } from '../lib/anthropic.js';

app.http('suggestSubtasks', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/suggest-subtasks',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { projectType, projectInfo, additionalInfo } = body;

    const isType2 = projectType === 'type2';
    const taskType = isType2 ? 'Oppgave-titler (tasks under en Oppgavesamling)' : 'Underoppgave-titler';

    const systemPrompt = `Du er en erfaren prosjektleder.
Returner KUN et gyldig JSON-objekt på formen: { "subtasks": [{ "title": "..." }, ...] }
Foreslå 3–7 elementer. Skriv på norsk bokmål. Ingen annen tekst – kun JSON.`;

    const context = isType2
      ? [`Prosjektnavn: ${projectInfo?.name || '(ikke oppgitt)'}`, `Beskrivelse: ${projectInfo?.description || '(ikke oppgitt)'}`, `Formål: ${additionalInfo?.purpose || '(ikke oppgitt)'}`, `Mål: ${additionalInfo?.goals || '(ikke oppgitt)'}`, `Interessenter: ${additionalInfo?.stakeholders || '(ikke oppgitt)'}`].join('\n')
      : [`Oppgavenavn: ${projectInfo?.name || '(ikke oppgitt)'}`, `Beskrivelse: ${projectInfo?.description || '(ikke oppgitt)'}`].join('\n');

    const userMessage = `Foreslå ${taskType} for følgende ${isType2 ? 'prosjekt' : 'oppgave'}:\n\n${context}\n\nReturner KUN JSON.`;

    try {
      const { status, data } = await callAnthropic(apiKey, {
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      if (status >= 400) return { status, jsonBody: { error: data.error?.message || 'AI-feil' } };

      const parsed = extractJson(responseText(data));
      if (!parsed.ok) {
        return { status: 500, jsonBody: { error: 'Kunne ikke tolke AI-svar som JSON', raw: parsed.raw.substring(0, 500) } };
      }
      return { jsonBody: parsed.value };
    } catch (err) {
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
