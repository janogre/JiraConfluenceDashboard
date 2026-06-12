import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import crypto from 'crypto';
import bcRouter from './businessCentral/index.js';

const FileStore = FileStoreFactory(session);

const app = express();
const PORT = 3001;

// Enable CORS for all requests
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

app.use('/api/bc', bcRouter);

// Session-håndtering
app.use(session({
  store: new FileStore({ path: './sessions', ttl: 3600, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000,
  },
}));

// ─── Token-hjelp ────────────────────────────────────────────────────────────

async function refreshAccessToken(sess) {
  if (!sess.refreshToken) throw new Error('Ingen refresh-token i session');
  const resp = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: sess.refreshToken,
    }),
  });
  if (!resp.ok) throw new Error('Token-refresh feilet');
  const data = await resp.json();
  sess.accessToken = data.access_token;
  sess.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  if (data.refresh_token) sess.refreshToken = data.refresh_token;
}

async function ensureFreshToken(sess) {
  if (sess.authMode !== 'oauth') return;
  if (!sess.accessToken) throw new Error('Ikke autentisert');
  if (Date.now() > (sess.tokenExpiresAt ?? 0)) {
    await refreshAccessToken(sess);
  }
}

// ─── Env-basert apikey-fallback ──────────────────────────────────────────────

/**
 * Leser Atlassian apikey-kredensialer fra miljøvariabler. Brukes som fallback
 * når session mangler auth — slik at kredensialer overlever logout og
 * server-restart uten å måtte fylles inn via UI på nytt.
 *
 * Returnerer null hvis noen av de påkrevde feltene mangler.
 */
function getEnvApiAuth() {
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  if (!email || !apiToken || !jiraBaseUrl) return null;
  return {
    email,
    apiToken,
    jiraBaseUrl,
    confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL || jiraBaseUrl,
  };
}

// ─── Auth-endepunkter ────────────────────────────────────────────────────────

// Start OAuth-flyt
app.get('/auth/atlassian', (req, res) => {
  const state = crypto.randomUUID();
  req.session.oauthState = state;
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID,
    scope: [
      'read:jira-work', 'write:jira-work', 'read:jira-user',
      'read:confluence-space.summary', 'read:confluence-content.all',
      'write:confluence-content', 'offline_access',
    ].join(' '),
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  res.redirect(`https://auth.atlassian.com/authorize?${params}`);
});

// OAuth callback – bytt code mot tokens
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!state || state !== req.session.oauthState) {
    return res.status(400).send('Ugyldig state-parameter');
  }
  delete req.session.oauthState;

  try {
    const tokenResp = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.ATLASSIAN_CLIENT_ID,
        client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
        code,
        redirect_uri: process.env.OAUTH_REDIRECT_URI,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error('[AUTH] Token-utveksling feilet:', err);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth_error=token_exchange`);
    }

    const tokens = await tokenResp.json();
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.tokenExpiresAt = Date.now() + (tokens.expires_in - 60) * 1000;
    req.session.authMode = 'oauth';

    // Hent tilgjengelige Atlassian-ressurser (cloudId)
    const resourcesResp = await fetch(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } }
    );
    const resources = await resourcesResp.json();
    req.session.availableClouds = resources.map((r) => ({ id: r.id, name: r.name, url: r.url }));

    // Velg første ressurs som standard
    if (resources.length > 0) {
      req.session.cloudId = resources[0].id;
      req.session.cloudName = resources[0].name;
    }

    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
  } catch (error) {
    console.error('[AUTH] Callback-feil:', error.message);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth_error=callback`);
  }
});

// Sjekk autentiseringsstatus
app.get('/auth/me', (req, res) => {
  if (req.session.authMode === 'oauth' && req.session.accessToken) {
    return res.json({
      authenticated: true,
      authMode: 'oauth',
      cloudId: req.session.cloudId,
      cloudName: req.session.cloudName,
      availableClouds: req.session.availableClouds ?? [],
    });
  }
  if (req.session.authMode === 'apikey') {
    return res.json({
      authenticated: true,
      authMode: 'apikey',
      jiraBaseUrl: req.session.jiraBaseUrl,
      confluenceBaseUrl: req.session.confluenceBaseUrl,
    });
  }
  const envAuth = getEnvApiAuth();
  if (envAuth) {
    return res.json({
      authenticated: true,
      authMode: 'apikey',
      jiraBaseUrl: envAuth.jiraBaseUrl,
      confluenceBaseUrl: envAuth.confluenceBaseUrl,
    });
  }
  res.json({ authenticated: false });
});

// Velg Atlassian-instans (for brukere med tilgang til flere)
app.post('/auth/select-cloud', (req, res) => {
  const { cloudId } = req.body;
  const found = (req.session.availableClouds ?? []).find((c) => c.id === cloudId);
  if (!found) return res.status(400).json({ error: 'Ugyldig cloudId' });
  req.session.cloudId = cloudId;
  req.session.cloudName = found.name;
  res.json({ ok: true });
});

// API-nøkkel-modus (lokal utvikling)
app.post('/auth/apikey', (req, res) => {
  const { email, apiToken, jiraBaseUrl, confluenceBaseUrl, anthropicApiKey } = req.body;
  if (!email || !apiToken || !jiraBaseUrl) {
    return res.status(400).json({ error: 'Mangler påkrevde felt' });
  }
  req.session.authMode = 'apikey';
  req.session.apiKeyEmail = email;
  req.session.apiKeyToken = apiToken;
  req.session.jiraBaseUrl = jiraBaseUrl;
  req.session.confluenceBaseUrl = confluenceBaseUrl || jiraBaseUrl;
  if (anthropicApiKey) req.session.anthropicApiKey = anthropicApiKey;
  res.json({ ok: true });
});

// Lagre Anthropic-nøkkel i session
app.post('/auth/set-anthropic-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Mangler apiKey' });
  req.session.anthropicApiKey = apiKey;
  res.json({ ok: true });
});

// Logg ut
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ─── Hjelpefunksjon for å hente auth fra session ─────────────────────────────

async function resolveAuth(req, res) {
  if (req.session.authMode === 'oauth') {
    try {
      await ensureFreshToken(req.session);
    } catch {
      res.status(401).json({ error: 'Token utløpt eller mangler', reauthRequired: true });
      return null;
    }
    return { type: 'bearer', value: `Bearer ${req.session.accessToken}` };
  }
  if (req.session.authMode === 'apikey') {
    const cred = Buffer.from(`${req.session.apiKeyEmail}:${req.session.apiKeyToken}`).toString('base64');
    return { type: 'basic', value: `Basic ${cred}` };
  }
  const envAuth = getEnvApiAuth();
  if (envAuth) {
    const cred = Buffer.from(`${envAuth.email}:${envAuth.apiToken}`).toString('base64');
    return { type: 'basic', value: `Basic ${cred}` };
  }
  res.status(401).json({ error: 'Ikke autentisert', reauthRequired: true });
  return null;
}

// ─── Eksisterende endepunkter ─────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test tilkobling
app.get('/api/test-connection', async (req, res) => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;

  // I API-nøkkel-modus kan targetUrl fremdeles sendes via header
  const targetUrl = req.headers['x-target-url'] ||
    (req.session.authMode === 'oauth'
      ? `https://api.atlassian.com/ex/jira/${req.session.cloudId}/rest/api/3/myself`
      : null);

  if (!targetUrl) {
    return res.json({ success: false, error: 'Mangler X-Target-URL header' });
  }

  console.log('\n[TEST] Tilkoblingstest');
  console.log(`[TEST] Mål: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      headers: { Authorization: auth.value, Accept: 'application/json' },
      redirect: 'manual',
    });

    console.log(`[TEST] Svar-status: ${response.status}`);

    if (response.status >= 300 && response.status < 400) {
      return res.json({
        success: false,
        error: 'Omdirigering oppdaget – autentisering kan ha feilet',
        status: response.status,
      });
    }
    if (response.status >= 400) {
      const text = await response.text();
      return res.json({ success: false, error: 'API-feil', status: response.status, body: text.substring(0, 500) });
    }
    return res.json({ success: true, status: response.status, message: 'Tilkobling vellykket!' });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
});

// Proxy-endepunkt – videresender alle forespørsler til Atlassian
app.all('/api/atlassian/proxy', async (req, res) => {
  try {
    const auth = await resolveAuth(req, res);
    if (!auth) return;

    const targetUrl = req.headers['x-target-url'];
    if (!targetUrl) {
      return res.status(400).json({ error: 'Mangler X-Target-URL header' });
    }

    console.log(`\n[PROXY] ${req.method} forespørsel`);
    console.log(`[PROXY] Mål: ${targetUrl}`);

    const url = new URL(targetUrl);
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== '_') url.searchParams.set(key, String(value));
    });

    const finalUrl = url.toString();
    console.log(`[PROXY] Endelig URL: ${finalUrl}`);

    const fetchOptions = {
      method: req.method,
      headers: {
        Authorization: auth.value,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      redirect: 'manual',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(finalUrl, fetchOptions);
    console.log(`[PROXY] Svar-status: ${response.status}`);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      console.error(`[PROXY] Omdirigering oppdaget til: ${location}`);
      return res.status(401).json({
        error: 'Autentiserings-omdirigering oppdaget',
        message: 'Atlassian omdirigerer forespørselen. API-token kan være ugyldig.',
        redirectTo: location,
      });
    }

    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (response.status >= 400) {
      console.error(`[PROXY] Feilsvar:`, data);
    }

    res.status(response.status);
    if (typeof data === 'object') {
      res.json(data);
    } else {
      res.send(data);
    }
  } catch (error) {
    console.error('[PROXY] Feil:', error.message);
    res.status(500).json({ error: 'Proxy-feil', message: error.message });
  }
});

// ─── AI-endepunkter ───────────────────────────────────────────────────────────

app.post('/api/ai/digest', async (req, res) => {
  const { messages, apiKey: bodyKey } = req.body;
  const apiKey = bodyKey || req.session.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Mangler Anthropic API-nøkkel' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/timeline-report', async (req, res) => {
  const { apiKey: bodyKey, issues, reportDate } = req.body;
  const apiKey = bodyKey || req.session.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Mangler Anthropic API-nøkkel' });
  if (!issues || !issues.length) return res.status(400).json({ error: 'Mangler saker' });

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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1400, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/rewrite-meeting', async (req, res) => {
  const { notes, attendees, context, apiKey: bodyKey } = req.body;
  const apiKey = bodyKey || req.session.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Mangler Anthropic API-nøkkel' });
  if (!notes) return res.status(400).json({ error: 'Mangler notat-innhold' });

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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/project-documents', async (req, res) => {
  const { apiKey: bodyKey, documents, projectInfo, additionalInfo } = req.body;
  const apiKey = bodyKey || req.session.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Mangler Anthropic API-nøkkel' });
  if (!documents || !documents.length) return res.status(400).json({ error: 'Mangler dokumentliste' });

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
- Navn: ${projectInfo.name}
- Ansvarlig: ${projectInfo.owner || '(ikke oppgitt)'}
- Beskrivelse: ${projectInfo.description || '(ikke oppgitt)'}

Tilleggsinformasjon:
- Formål / problem: ${additionalInfo.purpose || '(ikke oppgitt)'}
- Ønsket resultat / mål: ${additionalInfo.goals || '(ikke oppgitt)'}
- Frist: ${additionalInfo.deadline || '(ikke oppgitt)'}
- Varighet: ${additionalInfo.duration || '(ikke oppgitt)'}
- Budsjett: ${additionalInfo.budget || '(ikke oppgitt)'}
- Interessenter: ${additionalInfo.stakeholders || '(ikke oppgitt)'}
- Kjente risikoer: ${additionalInfo.risks || '(ikke oppgitt)'}

Dokumentnøkler som skal genereres: ${documents.join(', ')}

Returner KUN et gyldig JSON-array uten annen tekst.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI-feil' });

    const text = data.content?.[0]?.text ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let results;
    try { results = JSON.parse(cleaned); }
    catch { return res.status(500).json({ error: 'Kunne ikke tolke AI-svar som JSON', raw: text.substring(0, 500) }); }
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/suggest-subtasks', async (req, res) => {
  const { apiKey: bodyKey, projectType, projectInfo, additionalInfo } = req.body;
  const apiKey = bodyKey || req.session.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Mangler Anthropic API-nøkkel' });

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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI-feil' });

    const text = data.content?.[0]?.text ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let result;
    try { result = JSON.parse(cleaned); }
    catch { return res.status(500).json({ error: 'Kunne ikke tolke AI-svar som JSON', raw: text.substring(0, 500) }); }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Klassifiser fritekst til den nye Jira-strukturen (arbeidstype, komponent, kategori,
// prioritet, etiketter). Brukes av hurtigregistreringen for friksjonsfri utfylling.
app.post('/api/ai/classify-issue', async (req, res) => {
  const { apiKey: bodyKey, text, allowed } = req.body;
  const apiKey = bodyKey || req.session.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Mangler Anthropic API-nøkkel' });
  if (!text || !text.trim()) return res.status(400).json({ error: 'Mangler beskrivelse' });

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
- Underoppgaver: hvis saken naturlig består av flere konkrete utførelsessteg (typisk installasjon/oppsett med flere ledd), del den opp i korte underoppgave-titler (3–8 stk) i "underoppgaver". Hver tittel skal være ett tydelig steg. Er saken én enkel handling, returner tom liste.`;

  const userMessage = `Beskrivelse:\n${text}\n\nReturner KUN JSON.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI-feil' });

    const textOut = data.content?.[0]?.text ?? '';
    const cleaned = textOut.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let result;
    try { result = JSON.parse(cleaned); }
    catch { return res.status(500).json({ error: 'Kunne ikke tolke AI-svar som JSON', raw: textOut.substring(0, 500) }); }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
========================================
  Atlassian API Proxy Server
  Running on http://localhost:${PORT}

  Auth-endepunkter:
  - GET  /auth/atlassian         Start OAuth-flyt
  - GET  /auth/callback          OAuth callback
  - GET  /auth/me                Sjekk autentiseringsstatus
  - POST /auth/select-cloud      Velg Atlassian-instans
  - POST /auth/apikey            API-nøkkel-modus (lokal utvikling)
  - POST /auth/set-anthropic-key Lagre Anthropic-nøkkel
  - POST /auth/logout            Logg ut

  API-endepunkter:
  - GET  /health                 Health check
  - GET  /api/test-connection    Test tilkobling
  - ALL  /api/atlassian/proxy    Proxy til Atlassian
  - POST /api/ai/*               AI-funksjoner
========================================
  `);
});
