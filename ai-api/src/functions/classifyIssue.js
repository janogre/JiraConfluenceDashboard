import { app } from '@azure/functions';
import { getAnthropicKey, callAnthropic, responseText, extractJson } from '../lib/anthropic.js';

app.http('classifyIssue', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'ai/classify-issue',
  handler: async (request) => {
    const apiKey = getAnthropicKey();
    if (!apiKey) return { status: 500, jsonBody: { error: 'Server mangler ANTHROPIC_API_KEY' } };

    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Ugyldig body' } }; }
    if (!body || typeof body !== 'object') return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    const { text, allowed } = body;
    if (!text || !text.trim()) return { status: 400, jsonBody: { error: 'Mangler beskrivelse' } };

    const a = allowed || {};
    const arbeidstyper = a.arbeidstyper || [];
    const prioriteter = a.prioriteter || [];
    const komponenter = a.komponenter || [];
    const kategorierPerTeam = a.kategorierPerTeam || {};
    const etiketter = a.etiketter || [];

    const etikettBeskrivelse = etiketter
      .map((e) => `  ${e.prefiks}: (${e.formaal}) kjente verdier: ${(e.verdier || []).join(', ') || '–'}`)
      .join('\n');

    const kategoriBeskrivelse = Object.entries(kategorierPerTeam)
      .map(([team, vals]) => `  ${team}: ${(vals || []).join(', ')}`)
      .join('\n');

    const systemPrompt = `Du klassifiserer en kort fritekstbeskrivelse av en arbeidsoppgave inn i en fast Jira-struktur for et bredbånds-/telekom-nettverk.
Returner KUN et gyldig JSON-objekt – ingen forklaring, ingen markdown-blokk.

JSON-form:
{
  "summary": "kort, presis sakstittel på norsk (maks ca. 80 tegn)",
  "arbeidstype": "<en av: ${arbeidstyper.join(', ')}> eller null",
  "komponent": "<en av: ${komponenter.join(', ')}> eller null",
  "kategori": "<gyldig Team:Kategori-verdi> eller null",
  "prioritet": "<en av: ${prioriteter.join(', ')}> eller null",
  "etiketter": ["prefiks:verdi", ...] eller [],
  "underoppgaver": ["kort tittel på utførelsessteg", ...] eller [],
  "oppfolging": { "felt": "kort spørsmål for å skaffe manglende obligatorisk info" } eller {},
  "begrunnelse": "kort begrunnelse på norsk, én setning"
}

Regler:
- Bruk KUN verdier fra listene over. Er du usikker på et felt, sett det til null (ikke gjett).
- Kategori velges ut fra komponentens team:
${kategoriBeskrivelse}
  (Aksess og Kjerne hører til team "nettverk"; System hører til team "system".)
- Etiketter er valgfrie og MÅ ha prefiks. Tillatte prefikser:
${etikettBeskrivelse}
- Etikettverdier: kun små bokstaver, ingen mellomrom (bruk bindestrek), og forenkle norske tegn (ø→o, å→a, æ→e). Eksempel: "Smøla" → "geo:smola".
- Ikke lag etiketter uten prefiks, og foreslå kun etiketter du er rimelig sikker på.
- Arbeidstype: noe som er ødelagt/feiler → "Feil"; konkret planlagt arbeid → "Oppgave"; behov eller ønske → "Historie".
- Underoppgaver: hvis saken naturlig består av flere konkrete utførelsessteg (typisk installasjon/oppsett med flere ledd), del den opp i korte underoppgave-titler (3–8 stk) i "underoppgaver". Hver tittel skal være ett tydelig steg. Er saken én enkel handling, returner tom liste.
- Oppfolging: for hvert obligatorisk felt du IKKE klarte å fylle sikkert (komponent, kategori, beskrivelse, eller etikettene geo/lok/seg), lag ett kort og konkret spørsmål som hjelper den ansatte å oppgi nettopp den informasjonen. Bruk feltnavnet som nøkkel (komponent, kategori, beskrivelse, geo, lok, seg). Spør gjerne basert på det du allerede vet (f.eks. «Er feilen på PON eller BNG?»). Returner tomt objekt {} dersom du fylte alt.`;

    const userMessage = `Beskrivelse:\n${text}\n\nReturner KUN JSON.`;

    try {
      const { status, data } = await callAnthropic(apiKey, {
        max_tokens: 1000,
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
