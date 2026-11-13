# SWA Plan 2 – Frittstående AI Function App Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porte de syv AI-endepunktene fra `server/proxy.js` til en **frittstående** Azure Function App (`ai-api/`, eget origin, 230s-tak) som kaller Anthropic med en server-side nøkkel, beskyttet med function-key + CORS.

**Architecture:** En separat, uavhengig deploybar Azure Functions-app (Node ESM v4) — atskilt fra `api/` (managed functions fra Plan 1), fordi den må ligge på eget origin for å omgå SWA sitt 45s-tak (§3 i spec). Ren Anthropic-kall-logikk (nøkkelhenting, HTTP-kall, JSON-uttrekk) ligger i `ai-api/src/lib/anthropic.js` og enhetstestes med `node:test` og injisert `fetch`. Tynne `app.http`-omslag i `ai-api/src/functions/` holder hver sitt prompt og validering. Ingen Atlassian-session, ingen cookies — hvert kall tar data i request-body og bruker `ANTHROPIC_API_KEY` fra app settings.

**Tech Stack:** Node 22 (deploy-mål; kjører Node 24 lokalt — func v4 støtter begge), ESM, `@azure/functions` v4, Azure Functions Core Tools v4 (`func`), `node:test` + `node:assert`, rå `fetch` mot `https://api.anthropic.com/v1/messages`.

**Referansespec:** `docs/superpowers/specs/2026-07-14-azure-swa-functions-migrering-design.md` (§4 arkitektur, §7 AI Function App, §8c Anthropic-nøkkel server-side).
**Kilde for prompt-tekster:** `server/proxy.js` (AI-endepunktene, se linjereferanser per task). Denne fila slettes IKKE i Plan 2 — den er sannhetskilden for prompt-tekstene og fjernes først i Plan 3.

## Global Constraints

- **Runtime:** ESM (`"type": "module"` i `ai-api/package.json`), Node ≥22. Ren JS, ingen TypeScript. Deploy pinnes til Node 22 i Azure (egen Function App); lokal kjøring på Node 24 er OK (func v4 støtter 22 og 24).
- **Pakkeverktøy:** npm (ikke pnpm).
- **Funksjonsmodell:** `@azure/functions` v4. Alle AI-funksjoner registreres med `app.http(...)` og **`authLevel: 'function'`** (krever `x-functions-key` — dette er function-key-beskyttelsen fra §7). Standard `routePrefix` = `api` beholdes, så `route: 'ai/digest'` → `/api/ai/digest`.
- **Modell:** behold eksisterende **`claude-sonnet-4-6`** (fortsatt aktiv modell). IKKE oppgrader modell i denne porten — det er en egen produktbeslutning utenfor scope.
- **Anthropic-kall:** rå `fetch` (parity med `server/proxy.js`), IKKE `@anthropic-ai/sdk`. Ingen streaming (alle kall har `max_tokens` ≤ 4000). `anthropic-version: 2023-06-01`.
- **Nøkkel:** kun server-side `process.env.ANTHROPIC_API_KEY`. Ingen body-nøkkel, ingen session-nøkkel (§8c). Mangler nøkkelen → 500 (server-konfigfeil), ikke 400.
- **Språk:** all kode-kommentar, README og loggtekst på norsk bokmål. Prompt-tekstene kopieres verbatim fra `server/proxy.js` (også norske).
- **CORS:** i prod settes CORS på Function App-en (kun SWA-domenet som origin) — dokumenteres her, konfigureres ved deploy (Plan 3). Lokalt settes CORS i `local.settings.json` (`Host.CORS`).
- **Ingen frontend-endringer her:** `src/` røres ikke. Frontend-omkobling til `VITE_AI_API_BASE` er Plan 3.
- **Verifisering:** `func start` betjener `http://localhost:7071/api/ai/*`. Enhetstester kjøres med `npm test` (= `node --test`) i `ai-api/`. Ekte Anthropic-kall krever `ANTHROPIC_API_KEY` og koster penger — valider primært via enhetstester + validerings-/nøkkelfeil-veier; ett ekte kall er valgfritt.

---

## Filstruktur (opprettes i denne planen)

```
ai-api/
  host.json                    # Functions-vert: extensionBundle, App Insights-sampling
  package.json                 # ESM, @azure/functions v4, node --test
  local.settings.json          # lokale env-verdier + Host.CORS (gitignorert)
  .funcignore                  # ekskluder tester/hemmeligheter fra deploy
  .gitignore                   # local.settings.json, node_modules
  README.md                    # hvordan kjøre, teste og deploye AI-appen
  src/
    functions/
      aiHealth.js              # GET /api/ai/health (scaffold-verifisering, anonymous)
      digest.js                # POST /api/ai/digest
      timelineReport.js        # POST /api/ai/timeline-report
      rewriteMeeting.js        # POST /api/ai/rewrite-meeting
      projectDocuments.js      # POST /api/ai/project-documents
      suggestSubtasks.js       # POST /api/ai/suggest-subtasks
      classifyIssue.js         # POST /api/ai/classify-issue
      rewriteDescription.js    # POST /api/ai/rewrite-description
    lib/
      anthropic.js             # getAnthropicKey, callAnthropic, extractJson, responseText, MODEL
  test/
    anthropic.test.js
```

`ai-api/` er et **eget npm-prosjekt** med egen `node_modules` og egen deploy, atskilt fra `api/`.

---

## Task 1: Scaffold `ai-api/`-prosjektet med health-funksjon, CORS og testoppsett

**Files:**
- Create: `ai-api/package.json`, `ai-api/host.json`, `ai-api/local.settings.json`, `ai-api/.funcignore`, `ai-api/.gitignore`, `ai-api/README.md`, `ai-api/src/functions/aiHealth.js`
- Modify: repo-rotens `.gitignore` (legg til `ai-api/`-unntak)

**Interfaces:**
- Consumes: ingenting.
- Produces: kjørbart Functions-prosjekt (`func start` fra `ai-api/` → `http://localhost:7071/api/*`) og `npm test`-kommando som senere tasks henger tester på.

**Forutsetning:** Node ≥22 og `func` v4 på PATH (etablert i Plan 1 Task 0 — `func 4.12.1`, Node 24).

- [ ] **Step 1: Opprett `ai-api/package.json`**

```json
{
  "name": "jcd-ai-api",
  "version": "1.0.0",
  "type": "module",
  "main": "src/functions/*.js",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "func start",
    "test": "node --test"
  },
  "dependencies": {
    "@azure/functions": "^4.5.0"
  }
}
```

- [ ] **Step 2: Opprett `ai-api/host.json`**

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "excludedTypes": "Request" }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

- [ ] **Step 3: Opprett `ai-api/local.settings.json`** (gitignoreres i Step 5 — fyll inn ekte `ANTHROPIC_API_KEY` lokalt)

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "",
    "ANTHROPIC_API_KEY": ""
  },
  "Host": {
    "CORS": "http://localhost:5173",
    "CORSCredentials": false
  }
}
```

*Merk:* `Host.CORS` gjelder kun lokalt (SWA-domenet konfigureres på Function App-en ved deploy). AI-kallene bruker ikke cookies, så `CORSCredentials` er `false`.

- [ ] **Step 4: Opprett `ai-api/.funcignore`**

```
*.test.js
test/
local.settings.json
.git*
README.md
```

- [ ] **Step 5: Opprett `ai-api/.gitignore`**

```
node_modules/
local.settings.json
```

- [ ] **Step 6: Legg til `ai-api/`-unntak i repo-rotens `.gitignore`**

Legg til nederst i `.gitignore`:

```
# AI Function App (ai-api/)
ai-api/node_modules/
ai-api/local.settings.json
```

- [ ] **Step 7: Opprett health-funksjonen `ai-api/src/functions/aiHealth.js`**

```js
import { app } from '@azure/functions';

// Enkel helsesjekk — brukes til å verifisere at Functions-verten starter.
// authLevel anonymous slik at den kan sjekkes uten function-key.
app.http('aiHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ai/health',
  handler: async () => ({
    jsonBody: { status: 'ok', service: 'ai-api', timestamp: new Date().toISOString() },
  }),
});
```

- [ ] **Step 8: Opprett `ai-api/README.md`**

````markdown
# ai-api/ — Frittstående AI Function App

AI-endepunkter (Anthropic) for dashboardet. Egen, uavhengig deploybar Azure Function App
på eget origin (230s-tak) — atskilt fra `api/` fordi SWA sitt `/api` har et 45s-tak.
Erstatter AI-endepunktene i `server/proxy.js` i produksjon.

## Kjøre lokalt

Krever Node ≥22 (func v4 støtter 22 og 24) og Azure Functions Core Tools v4.

```bash
cd ai-api
npm install
# fyll inn ekte ANTHROPIC_API_KEY i local.settings.json (aldri commit denne fila)
func start
```

Endepunktene betjenes på `http://localhost:7071/api/ai/*`. Lokalt håndhever ikke `func`
function-keys, så endepunktene er kallbare uten `x-functions-key` under lokal utvikling.

## Teste

```bash
cd ai-api
npm test        # kjører node --test på test/*.test.js
```

## Produksjon

- Deployes som en **egen** Function App (ikke via SWA). CORS settes på Function App-en til
  kun SWA-domenet. `ANTHROPIC_API_KEY` og `APPLICATIONINSIGHTS_CONNECTION_STRING` settes som
  app settings. Alle endepunkter har `authLevel: 'function'` (krever `x-functions-key`).
- Detaljert deploy (CI/CD, CORS, domene) dekkes i Plan 3.
````

- [ ] **Step 9: Installer avhengigheter og verifiser at verten starter**

Run:
```bash
cd ai-api && npm install && npm test
```
Expected: `npm test` fullfører uten testfiler ennå — `tests 0` / `pass 0`, exit 0.

Deretter `func start` i bakgrunnen fra `ai-api/`, vent noen sekunder, og i et annet skall:
```bash
curl http://localhost:7071/api/ai/health
```
Expected: `{"status":"ok","service":"ai-api","timestamp":"..."}`. Stopp `func` etterpå (og drep evt. gjenværende `func.exe`; bekreft port 7071 ledig).

- [ ] **Step 10: Commit**

```bash
git add ai-api/ .gitignore
git commit -m "Scaffold ai-api/ frittstående AI Function App med health og CORS"
```

---

## Task 2: Anthropic-lib (nøkkelhenting, kall, JSON-uttrekk)

**Files:**
- Create: `ai-api/src/lib/anthropic.js`
- Test: `ai-api/test/anthropic.test.js`

**Interfaces:**
- Consumes: `process.env.ANTHROPIC_API_KEY`; global `fetch` (injiserbar for test).
- Produces:
  - `MODEL` (konstant `'claude-sonnet-4-6'`)
  - `getAnthropicKey() → string|null`
  - `callAnthropic(apiKey, { max_tokens, system?, messages }, fetchFn?) → { status, data }`
  - `extractJson(text) → { ok: true, value } | { ok: false, raw }`
  - `responseText(data) → string` (henter `data.content[0].text`, `''` hvis mangler)

- [ ] **Step 1: Skriv den feilende testen `ai-api/test/anthropic.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { MODEL, getAnthropicKey, callAnthropic, extractJson, responseText } =
  await import('../src/lib/anthropic.js');

test('getAnthropicKey leser env, ellers null', () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(getAnthropicKey(), null);
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  assert.equal(getAnthropicKey(), 'sk-test');
});

test('callAnthropic bygger riktig request og returnerer status+data', async () => {
  let calledUrl, calledOpts;
  const fakeFetch = async (url, opts) => {
    calledUrl = url;
    calledOpts = opts;
    return { status: 200, json: async () => ({ content: [{ type: 'text', text: 'hei' }] }) };
  };
  const { status, data } = await callAnthropic(
    'sk-test',
    { max_tokens: 800, system: 'du er hjelpsom', messages: [{ role: 'user', content: 'x' }] },
    fakeFetch,
  );
  assert.equal(status, 200);
  assert.equal(data.content[0].text, 'hei');
  assert.equal(calledUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(calledOpts.headers['x-api-key'], 'sk-test');
  assert.equal(calledOpts.headers['anthropic-version'], '2023-06-01');
  const sent = JSON.parse(calledOpts.body);
  assert.equal(sent.model, MODEL);
  assert.equal(sent.max_tokens, 800);
  assert.equal(sent.system, 'du er hjelpsom');
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'x' }]);
});

test('callAnthropic utelater system når det ikke er satt', async () => {
  let sent;
  const fakeFetch = async (_u, opts) => {
    sent = JSON.parse(opts.body);
    return { status: 200, json: async () => ({}) };
  };
  await callAnthropic('k', { max_tokens: 100, messages: [] }, fakeFetch);
  assert.equal('system' in sent, false);
});

test('extractJson fjerner ```json-innpakking og parser', () => {
  const r = extractJson('```json\n{"a":1}\n```');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1 });
});

test('extractJson på ugyldig JSON returnerer ok:false', () => {
  const r = extractJson('ikke json');
  assert.equal(r.ok, false);
  assert.equal(r.raw, 'ikke json');
});

test('responseText henter content[0].text, ellers tom streng', () => {
  assert.equal(responseText({ content: [{ text: 'abc' }] }), 'abc');
  assert.equal(responseText({}), '');
  assert.equal(responseText(null), '');
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `cd ai-api && npm test`
Expected: FAIL — `Cannot find module '../src/lib/anthropic.js'`.

- [ ] **Step 3: Implementer `ai-api/src/lib/anthropic.js`**

```js
// Anthropic-kall + hjelpere. Ingen @azure/functions-import → testbar direkte.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-sonnet-4-6';

// Server-side nøkkel. Ingen body-/session-nøkkel (spec §8c).
export function getAnthropicKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

// Kaller Anthropic Messages API. Returnerer { status, data }.
export async function callAnthropic(apiKey, { max_tokens, system, messages }, fetchFn = fetch) {
  const body = { model: MODEL, max_tokens, messages };
  if (system) body.system = system;
  const resp = await fetchFn(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

// Trekker ut JSON fra et Anthropic-tekstsvar (fjerner ```-innpakking).
export function extractJson(text) {
  const cleaned = String(text ?? '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false, raw: cleaned };
  }
}

// Henter teksten fra et Anthropic-svar (content[0].text).
export function responseText(data) {
  return data?.content?.[0]?.text ?? '';
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `cd ai-api && npm test`
Expected: PASS — alle 6 anthropic-tester grønne.

- [ ] **Step 5: Commit**

```bash
git add ai-api/src/lib/anthropic.js ai-api/test/anthropic.test.js
git commit -m "Legg til Anthropic-lib (nøkkel, kall, JSON-uttrekk)"
```

---

## Task 3: De fire tekst-endepunktene (digest, timeline-report, rewrite-meeting, rewrite-description)

**Files:**
- Create: `ai-api/src/functions/digest.js`, `timelineReport.js`, `rewriteMeeting.js`, `rewriteDescription.js`

**Interfaces:**
- Consumes: `getAnthropicKey`, `callAnthropic`, `responseText` (Task 2).
- Produces: `POST /api/ai/digest`, `/api/ai/timeline-report`, `/api/ai/rewrite-meeting`, `/api/ai/rewrite-description` (alle `authLevel: 'function'`).

**Portingsregel (gjelder alle fire):** Kopier prompt-/melding-konstruksjonen **verbatim** fra `server/proxy.js` (linjer under). Endre KUN: (a) nøkkel-resolusjon → `getAnthropicKey()` (500 hvis null), (b) body-lesing → `await request.json()` med `null`-vakt, (c) Anthropic-kallet → `callAnthropic(...)`, (d) svar → Functions `{ status, jsonBody }`. Ikke endre prompt-tekst, `max_tokens` eller responsformat.

- [ ] **Step 1: Implementer `ai-api/src/functions/digest.js`** (port av `server/proxy.js:386-401`, `max_tokens: 1500`, ren gjennomstrømming)

```js
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
```

- [ ] **Step 2: Implementer `ai-api/src/functions/timelineReport.js`** (port av `server/proxy.js:403-450`, `max_tokens: 1400`)

Struktur (fyll `<KOPIER ...>` fra kilden verbatim):

```js
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

    // <KOPIER verbatim fra server/proxy.js:409-437: `const issueList = ...`,
    //  `const systemPrompt = ...`, `const userMessage = ...`>

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
```

- [ ] **Step 3: Implementer `ai-api/src/functions/rewriteMeeting.js`** (port av `server/proxy.js:452-499`, `max_tokens: 2000`)

```js
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

    // <KOPIER verbatim fra server/proxy.js:458-486: `const systemPrompt = ...`
    //  og `const userMessage = [ ... ].filter(Boolean).join('\n\n');`>

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
```

- [ ] **Step 4: Implementer `ai-api/src/functions/rewriteDescription.js`** (port av `server/proxy.js:680-715`, `max_tokens: 700`, returnerer `{ beskrivelse }`)

```js
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

    // <KOPIER verbatim fra server/proxy.js:686-700: `const erFeil = ...`,
    //  `const struktur = ...`, `const systemPrompt = ...`>

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
```

- [ ] **Step 5: Verifiser at rutene lastes og at validerings-/nøkkelfeil-veiene svarer riktig**

Run: `cd ai-api && func start` (fra `ai-api/`, i bakgrunnen). `func` skal liste `digest`, `timelineReport`, `rewriteMeeting`, `rewriteDescription` (+ `aiHealth`) uten lastefeil.

Med **tom** `ANTHROPIC_API_KEY` i `local.settings.json`:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7071/api/ai/digest -H 'Content-Type: application/json' -d '{"messages":[]}'
# Expected: 500 (server mangler nøkkel)
```
Sett en **dummy** `ANTHROPIC_API_KEY` (f.eks. `sk-test`), restart `func`, og test valideringsveiene (disse feiler før Anthropic-kallet):
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7071/api/ai/rewrite-description -H 'Content-Type: application/json' -d '{}'
# Expected: 400 (Mangler beskrivelse)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7071/api/ai/timeline-report -H 'Content-Type: application/json' -d '{}'
# Expected: 400 (Mangler saker)
```
*Valgfritt (koster penger):* med en **ekte** `ANTHROPIC_API_KEY`, kjør ett `digest`-kall og bekreft et 200-svar med `content`. Stopp `func` + rydd `func.exe`.

- [ ] **Step 6: Commit**

```bash
git add ai-api/src/functions/digest.js ai-api/src/functions/timelineReport.js ai-api/src/functions/rewriteMeeting.js ai-api/src/functions/rewriteDescription.js
git commit -m "Legg til AI-tekstendepunkter (digest, timeline-report, rewrite-meeting, rewrite-description)"
```

---

## Task 4: De tre JSON-endepunktene (project-documents, suggest-subtasks, classify-issue)

**Files:**
- Create: `ai-api/src/functions/projectDocuments.js`, `suggestSubtasks.js`, `classifyIssue.js`

**Interfaces:**
- Consumes: `getAnthropicKey`, `callAnthropic`, `responseText`, `extractJson` (Task 2).
- Produces: `POST /api/ai/project-documents`, `/api/ai/suggest-subtasks`, `/api/ai/classify-issue` (alle `authLevel: 'function'`).

**Portingsregel:** Som Task 3, men disse parser JSON fra svaret. Behold rekkefølgen fra kilden: sjekk `status >= 400` FØR parsing (returner `{ error: data.error?.message || 'AI-feil' }`), deretter `extractJson(responseText(data))`; på `ok:false` → `500 { error: 'Kunne ikke tolke AI-svar som JSON', raw }`.

- [ ] **Step 1: Implementer `ai-api/src/functions/projectDocuments.js`** (port av `server/proxy.js:501-564`, `max_tokens: 4000`, returnerer `{ results }`)

```js
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

    // <KOPIER verbatim fra server/proxy.js:507-544: `const docNames = ...`,
    //  `const systemPrompt = ...`, `const docList = ...`, `const userMessage = ...`>

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
```

- [ ] **Step 2: Implementer `ai-api/src/functions/suggestSubtasks.js`** (port av `server/proxy.js:566-602`, `max_tokens: 800`, returnerer det parsede objektet direkte)

```js
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

    // <KOPIER verbatim fra server/proxy.js:571-582: `const isType2 = ...`,
    //  `const taskType = ...`, `const systemPrompt = ...`, `const context = ...`, `const userMessage = ...`>

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
```

- [ ] **Step 3: Implementer `ai-api/src/functions/classifyIssue.js`** (port av `server/proxy.js:606-676`, `max_tokens: 1000`, returnerer det parsede objektet direkte)

```js
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

    // <KOPIER verbatim fra server/proxy.js:612-656: `const a = allowed || {};` t.o.m.
    //  `const systemPrompt = ...` og `const userMessage = ...`>

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
```

- [ ] **Step 4: Verifiser at rutene lastes og at valideringsveiene svarer**

Run: `cd ai-api && func start` (bakgrunn). `func` skal liste `projectDocuments`, `suggestSubtasks`, `classifyIssue`. Med en dummy `ANTHROPIC_API_KEY`:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7071/api/ai/project-documents -H 'Content-Type: application/json' -d '{}'
# Expected: 400 (Mangler dokumentliste)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7071/api/ai/classify-issue -H 'Content-Type: application/json' -d '{}'
# Expected: 400 (Mangler beskrivelse)
```
Stopp `func` + rydd `func.exe`.

- [ ] **Step 5: Commit**

```bash
git add ai-api/src/functions/projectDocuments.js ai-api/src/functions/suggestSubtasks.js ai-api/src/functions/classifyIssue.js
git commit -m "Legg til AI-JSON-endepunkter (project-documents, suggest-subtasks, classify-issue)"
```

---

## Sluttverifisering av Plan 2

- [ ] **Kjør full testsuite**

Run: `cd ai-api && npm test`
Expected: alle anthropic-tester passerer; exit 0.

- [ ] **Røyktest at alle ruter lastes**

Run: `cd ai-api && func start`
Expected: `func` lister `aiHealth`, `digest`, `timelineReport`, `rewriteMeeting`, `rewriteDescription`, `projectDocuments`, `suggestSubtasks`, `classifyIssue` uten feil. Stopp `func`.

- [ ] **Verifiser prompt-paritet (stikkprøve)**

For hvert av de tre lange promptene, bekreft at teksten i funksjonsfila er tegn-for-tegn lik kilden:
```bash
# eksempel — skal gi tom diff for det aktuelle utsnittet
diff <(sed -n '415,424p' server/proxy.js) <(grep -n "profesjonell prosjektleder" ai-api/src/functions/timelineReport.js)
```
(Kontroller manuelt at `systemPrompt`/`userMessage`-tekstene er uendret fra `server/proxy.js`.)

**Leveranse:** `ai-api/` betjener alle syv AI-endepunktene + health under `func start`, med server-side nøkkel og function-key-beskyttelse. Frontend-omkobling (AI-kall → `${VITE_AI_API_BASE}/api/ai/*` med `x-functions-key`, fjerning av klient-Anthropic-nøkkel), CORS-konfig på Function App-en, og deploy/CI kommer i Plan 3.

---

## Self-review (utført av planforfatter)

**Spec-dekning (Plan 2s omfang):**
- §4/§7 frittstående AI Function App på eget origin, 230s-tak, Consumption → egen `ai-api/`-app, egen deploy. ✓
- §7 alle syv AI-endepunkter portet uendret → Task 3 (4 tekst) + Task 4 (3 JSON). ✓
- §7 server-side `ANTHROPIC_API_KEY`, klient-nøkkel fjernet → `getAnthropicKey()` (kun env), ingen body-/session-nøkkel. ✓
- §7 function-key + CORS-forbehold → `authLevel: 'function'` på alle AI-ruter; CORS lokalt i local.settings, prod på Function App (dokumentert, konfigureres i Plan 3). ✓
- §8c Anthropic-nøkkel server-side → ingen klient-nøkkel-flyt i `ai-api/`. ✓
- Modell `claude-sonnet-4-6` bevart (verifisert aktiv via claude-api-referansen); rå fetch bevart; ingen streaming (max_tokens ≤ 4000). Bevisste parity-valg, notert i Global Constraints.

**Plassholder-skann:** Prompt-tekstene refereres til `server/proxy.js` med eksakte linjenummer (samme mønster som Plan 1s BC-kopi — ikke plassholder, kilden finnes i repoet). All ny wrapper-/lib-kode er fullstendig.

**Typekonsistens:** `callAnthropic(apiKey, { max_tokens, system?, messages }, fetchFn?)` → `{ status, data }` brukes likt i alle syv funksjonene. `extractJson(text)` → `{ ok, value|raw }` og `responseText(data)` → string brukes konsistent i JSON-endepunktene. `getAnthropicKey()` → string|null, med 500 ved null overalt. Konsistent.

**Bevisste avvik fra `server/proxy.js` (parity-nære, notert):**
- Manglende nøkkel gir nå **500** (server-konfigfeil) i stedet for 400 — riktigere når nøkkelen er ren server-side.
- `null`/ikke-objekt-body gir **400** eksplisitt (samme herding som Plan 1) i stedet for en ubehandlet 500.
- Ingen `console.log`-støy portet (de rene loggene i proxy var for lokal debugging).
