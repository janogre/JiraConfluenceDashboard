import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic, responseText, extractJson } from '../lib/anthropic.js';

app.http('projectDocuments', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/project-documents',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { documents, projectInfo, additionalInfo } = body;
    if (!documents || !documents.length) return { status: 400, jsonBody: { error: 'Mangler dokumentliste' } };

    const docNames = {
      mandate: 'Prosjektmandat', needs: 'Behovsanalyse', decision: 'Beslutningsgrunnlag',
      risk: 'Risikoanalyse', stakeholders: 'Interessentanalyse', status: 'Statusrapport-mal',
    };

    const systemPrompt = `Du er en erfaren prosjektleder og dokumentasjonsspesialist.
Skriv alltid på formell norsk bokmål.
Du skal returnere et JSON-array (og INGENTING annet – ingen forklaring, ingen markdown-blokk rundt JSON).

Hvert element i arrayet har følgende struktur:
{ "type": "<dokumentnøkkel>", "title": "<tittel inkl. prosjektnavn>", "markdown": "<innhold i markdown>" }

Regler for innholdet:
- Bruk markdown-overskrifter (##, ###) og punktlister der det passer.
- Bruk profesjonell, saklig norsk prosjektspråk.
- Innholdet skal være gjennomarbeidet og klart til publisering.
- For statusrapport-mal: lag en tom mal med plassholdere markert med [].`;

    const docList = documents.map((key) => docNames[key] || key).join(', ');
    const userMessage = `Generer følgende prosjektdokumenter: ${docList}.

Prosjektinformasjon:
- Navn: ${projectInfo?.name}
- Ansvarlig: ${projectInfo?.owner || '(ikke oppgitt)'}
- Beskrivelse: ${projectInfo?.description || '(ikke oppgitt)'}

Tilleggsinformasjon:
- Formål / problem: ${additionalInfo?.purpose || '(ikke oppgitt)'}
- Ønsket resultat / mål: ${additionalInfo?.goals || '(ikke oppgitt)'}
- Frist: ${additionalInfo?.deadline || '(ikke oppgitt)'}
- Varighet: ${additionalInfo?.duration || '(ikke oppgitt)'}
- Budsjett: ${additionalInfo?.budget || '(ikke oppgitt)'}
- Interessenter: ${additionalInfo?.stakeholders || '(ikke oppgitt)'}
- Kjente risikoer: ${additionalInfo?.risks || '(ikke oppgitt)'}

Dokumentnøkler som skal genereres: ${documents.join(', ')}

Returner KUN et gyldig JSON-array uten annen tekst.`;

    try {
      const { status, data } = await callAnthropic(apiKey, {
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      if (status >= 400) return { status, jsonBody: { error: data.error?.message || 'AI-feil' } };

      const parsed = extractJson(responseText(data));
      if (!parsed.ok) {
        return { status: 500, jsonBody: { error: 'Kunne ikke tolke AI-svar som JSON', raw: parsed.raw.substring(0, 500) } };
      }
      return { jsonBody: { results: parsed.value } };
    } catch (err) {
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
