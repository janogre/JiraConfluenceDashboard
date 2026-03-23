import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Enable CORS for all requests
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint to verify proxy can reach Atlassian
app.get('/api/test-connection', async (req, res) => {
  const targetUrl = req.headers['x-target-url'];
  const authHeader = req.headers['authorization'];

  console.log('\n[TEST] Connection test');
  console.log(`[TEST] Target URL: ${targetUrl}`);
  console.log(`[TEST] Auth present: ${authHeader ? 'Yes' : 'No'}`);

  if (!targetUrl || !authHeader) {
    return res.json({
      success: false,
      error: 'Missing X-Target-URL or Authorization header',
      headers: {
        'x-target-url': targetUrl ? 'present' : 'missing',
        'authorization': authHeader ? 'present' : 'missing',
      },
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
      redirect: 'manual',
    });

    console.log(`[TEST] Response status: ${response.status}`);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      return res.json({
        success: false,
        error: 'Redirect detected - authentication may have failed',
        status: response.status,
        redirectTo: location,
      });
    }

    if (response.status >= 400) {
      const text = await response.text();
      return res.json({
        success: false,
        error: 'API error',
        status: response.status,
        body: text.substring(0, 500),
      });
    }

    return res.json({
      success: true,
      status: response.status,
      message: 'Connection successful!',
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error.message,
    });
  }
});

// Proxy endpoint - forwards all requests to Atlassian
app.all('/api/atlassian/proxy', async (req, res) => {
  try {
    // Get target URL from header
    const targetUrl = req.headers['x-target-url'];

    if (!targetUrl) {
      console.error('Missing X-Target-URL header');
      return res.status(400).json({ error: 'Missing X-Target-URL header' });
    }

    console.log(`\n[PROXY] ${req.method} request`);
    console.log(`[PROXY] Target: ${targetUrl}`);

    // Build the full URL with query params
    const url = new URL(targetUrl);

    // Add query params from the original request
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== '_') { // Ignore cache-busting params
        url.searchParams.set(key, String(value));
      }
    });

    const finalUrl = url.toString();
    console.log(`[PROXY] Final URL: ${finalUrl}`);

    // Get authorization header
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      console.error('[PROXY] Missing Authorization header');
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    console.log(`[PROXY] Auth header present: ${authHeader.substring(0, 15)}...`);

    // Make the request using fetch
    const fetchOptions = {
      method: req.method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Don't follow redirects - we want to see if Atlassian is redirecting us
      redirect: 'manual',
    };

    // Only add body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(finalUrl, fetchOptions);

    console.log(`[PROXY] Response status: ${response.status}`);

    // Check for redirects (since we set redirect: 'manual')
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      console.error(`[PROXY] Redirect detected to: ${location}`);
      console.error('[PROXY] This usually means authentication failed or URL is incorrect');
      return res.status(401).json({
        error: 'Authentication redirect detected',
        message: 'Atlassian is redirecting the request. This usually means the API token is invalid or the URL is incorrect.',
        redirectTo: location,
      });
    }

    // Get response data
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // If there's an error, log it
    if (response.status >= 400) {
      console.error(`[PROXY] Error response:`, data);
    }

    // Forward the response
    res.status(response.status);

    if (typeof data === 'object') {
      res.json(data);
    } else {
      res.send(data);
    }
  } catch (error) {
    console.error('[PROXY] Error:', error.message);
    res.status(500).json({
      error: 'Proxy error',
      message: error.message,
    });
  }
});

// AI digest endpoint
app.post('/api/ai/digest', express.json(), async (req, res) => {
  const { messages, apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'Missing Anthropic API key' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages,
      }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI timeline report endpoint
app.post('/api/ai/timeline-report', express.json(), async (req, res) => {
  const { apiKey, issues, reportDate } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Missing Anthropic API key' });
  if (!issues || !issues.length) return res.status(400).json({ error: 'Missing issues' });

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
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI meeting note rewrite endpoint
app.post('/api/ai/rewrite-meeting', express.json(), async (req, res) => {
  const { notes, attendees, context, apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'Missing Anthropic API key' });
  }
  if (!notes) {
    return res.status(400).json({ error: 'Missing notes content' });
  }

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
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
========================================
  Atlassian API Proxy Server
  Running on http://localhost:${PORT}

  Endpoints:
  - GET  /health               Health check
  - GET  /api/test-connection  Test Atlassian connection
  - ALL  /api/atlassian/proxy  Proxy requests
========================================
  `);
});
