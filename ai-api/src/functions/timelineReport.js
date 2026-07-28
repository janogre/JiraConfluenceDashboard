import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic } from '../lib/anthropic.js';

app.http('timelineReport', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/timeline-report',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { issues, reportDate } = body;
    if (!issues || !issues.length) return { status: 400, jsonBody: { error: 'Mangler saker' } };

    const issueList = issues.map((i) =>
      `- ${i.key}: ${i.summary} | Type: ${i.issueType?.name ?? '–'} | Status: ${i.status?.name ?? '–'} | ` +
      `Prioritet: ${i.priority?.name ?? '–'} | Ansvarlig: ${i.assignee?.displayName ?? 'Ikke tildelt'} | ` +
      `Start: ${i.startDate ?? '–'} | Frist: ${i.dueDate ?? '–'}`
    ).join('\n');

    const systemPrompt = `Du er en profesjonell prosjektleder og teknisk rapportforfatter.
Skriv alltid på formell norsk bokmål i saklig, profesjonell prosjektrapportstil.

VIKTIG FORMATKRAV – følg disse strengt:
- Skriv KUN i løpende prosa. Ingen punktlister, ingen bindestrek-lister.
- Bruk IKKE markdown-formatering av noe slag: ikke **, ikke __, ikke #, ikke ##, ikke ~~, ikke \`kode\`.
- Overskrifter for hvert avsnitt skrives som vanlig tekst på egen linje etterfulgt av kolon, f.eks.: "1. Overordnet formål og omfang:"
- Etter overskriften følger en eller flere sammenhengende setninger som løpende prosa.
- Ikke bruk tankestreker eller bindestreker som listemarkører.
- Skriv som om dette er et formelt styredokument som leses på papir.`;

    const userMessage = `Generer en profesjonell prosjektstatusrapport per ${reportDate} basert på følgende ${issues.length} Jira-saker fra tidslinjen.

${issueList}

Skriv en sammenhengende rapport med følgende avsnitt:
1. Overordnet formål og omfang basert på sakene
2. Fremdriftsstatus – hva er fullført, hva pågår, hva gjenstår
3. Kritiske frister og milepæler
4. Risikovurdering basert på uløste saker uten frist eller med høy prioritet
5. Anbefaling for neste periode

Rapporten skal egne seg som vedlegg til et styremøte eller prosjektstatusrapport.`;

    try {
      const { status, data } = await callAnthropic(apiKey, {
        max_tokens: 1400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      return { status, jsonBody: data };
    } catch (err) {
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
