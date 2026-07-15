# SWA Plan 1 – Managed Functions-backend (Atlassian + BC + auth) Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porte Express-backenden (`server/proxy.js` sine Atlassian-/auth-endepunkter + `server/businessCentral/`) til et frittstående Azure Functions-prosjekt i `api/`, med stateless kryptert cookie-session i stedet for `express-session`.

**Architecture:** Ett nytt npm-prosjekt under `api/` bruker Azure Functions Node v4-programmeringsmodell. All ren logikk (kryptering, OAuth-hjelpere, auth-resolusjon, proxy-videresending, BC-dispatch) legges i `api/src/lib/` uten `@azure/functions`-import, slik at den kan enhetstestes med Nodes innebygde `node:test`. Tynne funksjonsomslag i `api/src/functions/` binder logikken til HTTP-ruter under `/api`. Session lagres som en AES-256-GCM-kryptert `httpOnly`-cookie; ingen server-side sesjonslager.

**Tech Stack:** Node 20 (ESM), `@azure/functions` v4, Azure Functions Core Tools v4 (`func`), `node:test` + `node:assert` (ingen ekstra test-avhengighet), `node:crypto`.

**Referansespec:** `docs/superpowers/specs/2026-07-14-azure-swa-functions-migrering-design.md` (§4 arkitektur, §5 auth/session, §6 managed functions, §8d apikey-reserve).

## Global Constraints

- **Runtime:** Node 20, ESM (`"type": "module"` i `api/package.json`). Ingen TypeScript i `api/` — ren JS.
- **Pakkeverktøy:** npm (ikke pnpm). Ref. spec §2.
- **Funksjonsmodell:** `@azure/functions` v4. Alle funksjoner registreres med `app.http(...)` og `authLevel: 'anonymous'` (SWA managed functions bruker ikke funksjonsnøkler for auth).
- **Rute-prefiks:** Standard `routePrefix` = `api` beholdes (settes ikke i `host.json`). En funksjon med `route: 'auth/me'` nås derfor på `/api/auth/me`.
- **Språk:** All kode-kommentar, UI-tekst og loggtekst på norsk bokmål.
- **Cookie:** navn `jcd_session`, `httpOnly`, `SameSite=Lax`, `Secure` styrt av env `COOKIE_SECURE` (`'false'` lokalt over http, ellers `true`). Kryptering AES-256-GCM med nøkkel avledet fra `SESSION_SECRET`.
- **Ingen AI her:** AI-endepunktene (`/api/ai/*`) er Plan 2 (egen Function App) og skal IKKE portes inn i `api/`. Anthropic-nøkkel og `set-anthropic-key` utelates.
- **Ingen frontend-endringer her:** `src/` røres ikke i Plan 1. Frontend-omkobling er Plan 3.
- **Verifisering:** `func start` betjener `http://localhost:7071/api/*`. Enhetstester kjøres med `npm test` (som er `node --test`) i `api/`.

---

## Filstruktur (opprettes i denne planen)

```
api/
  host.json                      # Functions-vert: extensionBundle, App Insights-sampling
  package.json                   # ESM, @azure/functions v4, node --test
  local.settings.json            # lokale env-verdier (gitignorert)
  .funcignore                    # ekskluder tester/hemmeligheter fra deploy
  .gitignore                     # local.settings.json, node_modules
  README.md                      # hvordan kjøre og teste api-prosjektet
  src/
    functions/
      health.js                  # GET /api/health (scaffold-verifisering)
      authAtlassian.js           # GET /api/auth/atlassian
      authCallback.js            # GET /api/auth/callback
      authMe.js                  # GET /api/auth/me
      authSelectCloud.js         # POST /api/auth/select-cloud
      authLogout.js              # POST /api/auth/logout
      authApikey.js              # POST /api/auth/apikey  (midlertidig reserve, spec §8d)
      testConnection.js          # GET /api/test-connection
      atlassianProxy.js          # ALL /api/atlassian/proxy
      bc.js                      # GET /api/bc/{resource}
    lib/
      session.js                 # AES-256-GCM krypter/dekrypter + cookie-bygging
      atlassianAuth.js           # OAuth-hjelpere, resolveAuth, buildAuthStatus
      atlassianProxy.js          # forwardToAtlassian (ren videresendingslogikk)
      bc/
        auth.js                  # KOPIERT uendret fra server/businessCentral/
        itemsService.js          # KOPIERT uendret
        locationsService.js      # KOPIERT uendret
        purchaseOrdersService.js # KOPIERT uendret
        itemLedgerEntriesService.js # KOPIERT uendret
        handler.js               # handleBc + bcError (erstatter Express-routeren)
  test/
    session.test.js
    atlassianAuth.test.js
    atlassianProxy.test.js
    bc.test.js
```

`server/proxy.js` og `server/businessCentral/` slettes IKKE i denne planen — de skal fortsatt kunne kjøres lokalt til migreringen er ferdig. Opprydding skjer i Plan 3.

---

## Task 1: Scaffold `api/`-prosjektet med health-funksjon og testoppsett

**Files:**
- Create: `api/package.json`
- Create: `api/host.json`
- Create: `api/local.settings.json`
- Create: `api/.funcignore`
- Create: `api/.gitignore`
- Create: `api/README.md`
- Create: `api/src/functions/health.js`
- Modify: `.gitignore` (repo-rot — legg til `api/`-unntak)

**Interfaces:**
- Consumes: ingenting.
- Produces: kjørbart Functions-prosjekt (`func start` → `http://localhost:7071/api/*`) og `npm test`-kommando (`node --test`) som senere tasks henger tester på.

**Forutsetning (verifiser først):** Node 20 (`node -v`) og Azure Functions Core Tools v4 (`func --version` → `4.x`). Mangler `func`: `npm i -g azure-functions-core-tools@4 --unsafe-perm true`.

- [ ] **Step 1: Opprett `api/package.json`**

```json
{
  "name": "jcd-api",
  "version": "1.0.0",
  "type": "module",
  "main": "src/functions/*.js",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "func start",
    "test": "node --test"
  },
  "dependencies": {
    "@azure/functions": "^4.5.0"
  }
}
```

- [ ] **Step 2: Opprett `api/host.json`**

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

- [ ] **Step 3: Opprett `api/local.settings.json`** (gitignoreres i Step 5 — fyll inn ekte verdier lokalt)

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "",
    "SESSION_SECRET": "bytt-meg-til-minst-32-tegn-lang-hemmelig-streng",
    "COOKIE_SECURE": "false",
    "ATLASSIAN_CLIENT_ID": "",
    "ATLASSIAN_CLIENT_SECRET": "",
    "OAUTH_REDIRECT_URI": "http://localhost:7071/api/auth/callback",
    "FRONTEND_URL": "http://localhost:5173",
    "ATLASSIAN_EMAIL": "",
    "ATLASSIAN_API_TOKEN": "",
    "JIRA_BASE_URL": "",
    "CONFLUENCE_BASE_URL": "",
    "BC_TENANT_ID": "",
    "BC_CLIENT_ID": "",
    "BC_CLIENT_SECRET": ""
  }
}
```

- [ ] **Step 4: Opprett `api/.funcignore`**

```
*.test.js
test/
local.settings.json
.git*
README.md
```

- [ ] **Step 5: Opprett `api/.gitignore`**

```
node_modules/
local.settings.json
```

- [ ] **Step 6: Legg til `api/`-unntak i repo-rotens `.gitignore`**

Legg til nederst i `.gitignore` (opprett fila om den ikke finnes):

```
# Azure Functions (api/)
api/node_modules/
api/local.settings.json
```

- [ ] **Step 7: Opprett health-funksjonen `api/src/functions/health.js`**

```js
import { app } from '@azure/functions';

// Enkel helsesjekk — brukes til å verifisere at Functions-verten starter.
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ({
    jsonBody: { status: 'ok', timestamp: new Date().toISOString() },
  }),
});
```

- [ ] **Step 8: Opprett `api/README.md`**

````markdown
# api/ — Azure Functions-backend

Managed functions for Atlassian-proxy, OAuth/auth og Business Central.
Erstatter `server/proxy.js` + `server/businessCentral/` i produksjon på Azure SWA.

## Kjøre lokalt

Krever Node 20 og Azure Functions Core Tools v4 (`func --version` → 4.x).

```bash
cd api
npm install
# fyll inn ekte verdier i local.settings.json (aldri commit denne fila)
func start
```

Endepunktene betjenes på `http://localhost:7071/api/*`.

Får du feil om `AzureWebJobsStorage`: installer og kjør Azurite
(`npm i -g azurite && azurite`) eller sett `"AzureWebJobsStorage": "UseDevelopmentStorage=true"`.

## Teste

```bash
cd api
npm test        # kjører node --test på test/*.test.js
```
````

- [ ] **Step 9: Installer avhengigheter og verifiser at verten starter**

Run:
```bash
cd api && npm install && npm test
```
Expected: `npm test` fullfører uten testfiler ennå — utskrift `tests 0` / `pass 0` og exit-kode 0.

Deretter (i eget terminalvindu):
```bash
cd api && func start
```
Expected: `func` lister `health: [GET] http://localhost:7071/api/health` og venter. I et annet vindu:
```bash
curl http://localhost:7071/api/health
```
Expected: `{"status":"ok","timestamp":"..."}`. Stopp `func` med Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add api/ .gitignore
git commit -m "Scaffold api/ Azure Functions-prosjekt med health og testoppsett"
```

---

## Task 2: Session-lib (AES-256-GCM kryptert cookie)

**Files:**
- Create: `api/src/lib/session.js`
- Test: `api/test/session.test.js`

**Interfaces:**
- Consumes: `process.env.SESSION_SECRET`, `process.env.COOKIE_SECURE`.
- Produces:
  - `encrypt(obj) → string`, `decrypt(token) → object|null`
  - `readCookie(request, name) → string|null`, `readSession(request) → object|null`
  - `sessionCookie(session, maxAge=3600) → Cookie` (trimmer `availableClouds` hvis > ~3.9 KB; setter da `cloudsTrimmed:true`)
  - `stateCookie(state) → Cookie`, `clearSessionCookie() → Cookie`, `clearStateCookie() → Cookie`
  - Konstanter `COOKIE_NAME = 'jcd_session'`, `STATE_COOKIE = 'jcd_oauth_state'`

- [ ] **Step 1: Skriv den feilende testen `api/test/session.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-hemmelighet-som-er-lang-nok-1234';
const { encrypt, decrypt, sessionCookie, COOKIE_NAME } = await import('../src/lib/session.js');

test('encrypt → decrypt gir tilbake samme objekt', () => {
  const obj = { authMode: 'oauth', accessToken: 'abc', n: 1 };
  assert.deepEqual(decrypt(encrypt(obj)), obj);
});

test('decrypt av tuklet token gir null', () => {
  const token = encrypt({ a: 1 });
  const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
  assert.equal(decrypt(tampered), null);
});

test('decrypt av søppel/tomt gir null', () => {
  assert.equal(decrypt('ikke-et-token'), null);
  assert.equal(decrypt(''), null);
  assert.equal(decrypt(null), null);
});

test('sessionCookie har riktig navn og httpOnly', () => {
  const c = sessionCookie({ authMode: 'apikey' });
  assert.equal(c.name, COOKIE_NAME);
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'Lax');
});

test('sessionCookie trimmer availableClouds når cookien blir for stor', () => {
  const big = {
    authMode: 'oauth',
    accessToken: 'x'.repeat(6000),
    availableClouds: [{ id: '1', name: 'a', url: 'u' }],
  };
  const c = sessionCookie(big);
  const stored = decrypt(decodeURIComponent(c.value));
  assert.equal(stored.availableClouds, undefined);
  assert.equal(stored.cloudsTrimmed, true);
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `cd api && npm test`
Expected: FAIL — `Cannot find module '../src/lib/session.js'`.

- [ ] **Step 3: Implementer `api/src/lib/session.js`**

```js
import crypto from 'node:crypto';

const ALG = 'aes-256-gcm';
export const COOKIE_NAME = 'jcd_session';
export const STATE_COOKIE = 'jcd_oauth_state';
const MAX_COOKIE_BYTES = 3900;

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET mangler');
  // Avled en 32-byte nøkkel fra hemmeligheten (uansett lengde på input).
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url(iv).base64url(tag).base64url(ciphertext)
  return [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv(ALG, getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch {
    return null; // tuklet, feil nøkkel eller ugyldig — behandles som ingen session
  }
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const found = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + '='));
  if (!found) return null;
  return decodeURIComponent(found.slice(name.length + 1));
}

export function readSession(request) {
  return decrypt(readCookie(request, COOKIE_NAME));
}

function cookie(name, value, maxAge) {
  return {
    name,
    value: encodeURIComponent(value),
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/',
    maxAge,
  };
}

export function sessionCookie(session, maxAge = 3600) {
  let value = encrypt(session);
  if (value.length > MAX_COOKIE_BYTES && session.availableClouds) {
    // H.1-mitigering (spec §5): dropp availableClouds og marker at de må hentes på nytt.
    value = encrypt({ ...session, availableClouds: undefined, cloudsTrimmed: true });
  }
  return cookie(COOKIE_NAME, value, maxAge);
}

export function stateCookie(state) {
  return cookie(STATE_COOKIE, encrypt({ state }), 600);
}

export function clearSessionCookie() {
  return cookie(COOKIE_NAME, '', 0);
}

export function clearStateCookie() {
  return cookie(STATE_COOKIE, '', 0);
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `cd api && npm test`
Expected: PASS — alle 5 session-tester grønne.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/session.js api/test/session.test.js
git commit -m "Legg til kryptert cookie-session-lib (AES-256-GCM)"
```

---

## Task 3: Atlassian auth-lib (OAuth-hjelpere, resolveAuth, buildAuthStatus)

**Files:**
- Create: `api/src/lib/atlassianAuth.js`
- Test: `api/test/atlassianAuth.test.js`

**Interfaces:**
- Consumes: `process.env.ATLASSIAN_CLIENT_ID/_SECRET`, `OAUTH_REDIRECT_URI`, `ATLASSIAN_EMAIL/_API_TOKEN`, `JIRA_BASE_URL`, `CONFLUENCE_BASE_URL`; global `fetch` (injiserbar for test).
- Produces:
  - `buildAuthorizeUrl(state) → string`
  - `exchangeCode(code, fetchFn?) → tokens`
  - `fetchAccessibleResources(accessToken, fetchFn?) → [{id,name,url}]`
  - `refreshAccessToken(refreshToken, fetchFn?) → tokens`
  - `ensureFreshToken(session, fetchFn?) → { session, refreshed }`
  - `resolveAuth(session, fetchFn?) → { authHeader, session, refreshed }` (kaster `AuthError`)
  - `buildAuthStatus(session) → { authenticated, authMode?, ... }`
  - `getEnvApiAuth() → {email,apiToken,jiraBaseUrl,confluenceBaseUrl}|null`
  - klasse `AuthError` (har `reauthRequired = true`)

- [ ] **Step 1: Skriv den feilende testen `api/test/atlassianAuth.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test';
process.env.ATLASSIAN_CLIENT_ID = 'cid';
process.env.OAUTH_REDIRECT_URI = 'https://x.no/api/auth/callback';

const {
  buildAuthorizeUrl, resolveAuth, buildAuthStatus, ensureFreshToken, AuthError,
} = await import('../src/lib/atlassianAuth.js');

test('buildAuthorizeUrl inneholder state, client_id, redirect_uri og scope', () => {
  const url = buildAuthorizeUrl('s123');
  assert.match(url, /^https:\/\/auth\.atlassian\.com\/authorize\?/);
  const q = new URL(url).searchParams;
  assert.equal(q.get('state'), 's123');
  assert.equal(q.get('client_id'), 'cid');
  assert.equal(q.get('redirect_uri'), 'https://x.no/api/auth/callback');
  assert.ok(q.get('scope').includes('offline_access'));
});

test('resolveAuth apikey → Basic-header', async () => {
  const r = await resolveAuth({ authMode: 'apikey', apiKeyEmail: 'a@b.no', apiKeyToken: 'tok' });
  assert.equal(r.authHeader, 'Basic ' + Buffer.from('a@b.no:tok').toString('base64'));
  assert.equal(r.refreshed, false);
});

test('resolveAuth oauth med gyldig token → Bearer uten fornyelse', async () => {
  const s = { authMode: 'oauth', accessToken: 'AT', tokenExpiresAt: Date.now() + 100000 };
  const r = await resolveAuth(s);
  assert.equal(r.authHeader, 'Bearer AT');
  assert.equal(r.refreshed, false);
});

test('resolveAuth uten session og uten env → AuthError', async () => {
  delete process.env.ATLASSIAN_EMAIL;
  await assert.rejects(() => resolveAuth(null), (e) => e instanceof AuthError);
});

test('ensureFreshToken fornyer utløpt token via injisert fetch', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ access_token: 'NEW', expires_in: 3600, refresh_token: 'R2' }),
  });
  const s = { authMode: 'oauth', accessToken: 'OLD', refreshToken: 'R1', tokenExpiresAt: Date.now() - 1000 };
  const { session, refreshed } = await ensureFreshToken(s, fakeFetch);
  assert.equal(session.accessToken, 'NEW');
  assert.equal(session.refreshToken, 'R2');
  assert.equal(refreshed, true);
});

test('buildAuthStatus for oauth returnerer status med availableClouds', () => {
  const st = buildAuthStatus({ authMode: 'oauth', accessToken: 'x', cloudId: 'c', cloudName: 'n', availableClouds: [] });
  assert.deepEqual(st, { authenticated: true, authMode: 'oauth', cloudId: 'c', cloudName: 'n', availableClouds: [] });
});

test('buildAuthStatus uten auth returnerer authenticated:false', () => {
  delete process.env.ATLASSIAN_EMAIL;
  assert.deepEqual(buildAuthStatus(null), { authenticated: false });
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `cd api && npm test`
Expected: FAIL — `Cannot find module '../src/lib/atlassianAuth.js'`.

- [ ] **Step 3: Implementer `api/src/lib/atlassianAuth.js`**

```js
// OAuth mot Atlassian + auth-resolusjon. Ingen @azure/functions-import → testbar direkte.

const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

const SCOPES = [
  'read:jira-work', 'write:jira-work', 'read:jira-user',
  'read:confluence-space.summary', 'read:confluence-content.all',
  'write:confluence-content', 'offline_access',
];

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
    this.reauthRequired = true;
  }
}

export function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID,
    scope: SCOPES.join(' '),
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCode(code, fetchFn = fetch) {
  const resp = await fetchFn(TOKEN_URL, {
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
  if (!resp.ok) throw new Error(`Token-utveksling feilet (${resp.status})`);
  return resp.json();
}

export async function fetchAccessibleResources(accessToken, fetchFn = fetch) {
  const resp = await fetchFn(RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Henting av ressurser feilet (${resp.status})`);
  const resources = await resp.json();
  return resources.map((r) => ({ id: r.id, name: r.name, url: r.url }));
}

export async function refreshAccessToken(refreshToken, fetchFn = fetch) {
  if (!refreshToken) throw new AuthError('Ingen refresh-token');
  const resp = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) throw new AuthError('Token-refresh feilet');
  return resp.json();
}

function basic(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

export function getEnvApiAuth() {
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

// Sørger for gyldig access-token. Returnerer { session, refreshed }; kan kaste AuthError.
export async function ensureFreshToken(session, fetchFn = fetch) {
  if (!session.accessToken) throw new AuthError('Ikke autentisert');
  if (Date.now() <= (session.tokenExpiresAt ?? 0)) return { session, refreshed: false };
  const data = await refreshAccessToken(session.refreshToken, fetchFn);
  const updated = {
    ...session,
    accessToken: data.access_token,
    tokenExpiresAt: Date.now() + (data.expires_in - 60) * 1000,
    refreshToken: data.refresh_token || session.refreshToken,
  };
  return { session: updated, refreshed: true };
}

// Bestemmer Authorization-header ut fra session (med env-fallback). Kaster AuthError.
export async function resolveAuth(session, fetchFn = fetch) {
  if (session && session.authMode === 'oauth') {
    const { session: s, refreshed } = await ensureFreshToken(session, fetchFn);
    return { authHeader: `Bearer ${s.accessToken}`, session: s, refreshed };
  }
  if (session && session.authMode === 'apikey') {
    return { authHeader: basic(session.apiKeyEmail, session.apiKeyToken), session, refreshed: false };
  }
  const env = getEnvApiAuth();
  if (env) return { authHeader: basic(env.email, env.apiToken), session, refreshed: false };
  throw new AuthError('Ikke autentisert');
}

// Bygger /auth/me-svaret ut fra session (med env-fallback).
export function buildAuthStatus(session) {
  if (session && session.authMode === 'oauth' && session.accessToken) {
    return {
      authenticated: true,
      authMode: 'oauth',
      cloudId: session.cloudId,
      cloudName: session.cloudName,
      availableClouds: session.availableClouds ?? [],
    };
  }
  if (session && session.authMode === 'apikey') {
    return {
      authenticated: true,
      authMode: 'apikey',
      jiraBaseUrl: session.jiraBaseUrl,
      confluenceBaseUrl: session.confluenceBaseUrl,
    };
  }
  const env = getEnvApiAuth();
  if (env) {
    return { authenticated: true, authMode: 'apikey', jiraBaseUrl: env.jiraBaseUrl, confluenceBaseUrl: env.confluenceBaseUrl };
  }
  return { authenticated: false };
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `cd api && npm test`
Expected: PASS — session- og atlassianAuth-tester grønne.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/atlassianAuth.js api/test/atlassianAuth.test.js
git commit -m "Legg til Atlassian auth-lib (OAuth-hjelpere, resolveAuth, buildAuthStatus)"
```

---

## Task 4: OAuth-funksjoner (start + callback)

**Files:**
- Create: `api/src/functions/authAtlassian.js`
- Create: `api/src/functions/authCallback.js`

**Interfaces:**
- Consumes: `buildAuthorizeUrl`, `exchangeCode`, `fetchAccessibleResources` (Task 3); `stateCookie`, `sessionCookie`, `clearStateCookie`, `decrypt`, `readCookie`, `STATE_COOKIE` (Task 2); `crypto.randomUUID`.
- Produces: rutene `GET /api/auth/atlassian` (302 → Atlassian + state-cookie) og `GET /api/auth/callback` (verifiserer state, bytter code, setter session-cookie, 302 → FRONTEND_URL).

*Merk:* full OAuth-flyt i nettleser krever en registrert redirect-URI og verifiseres i Plan 3 (SWA CLI). Her verifiseres start-ruten (302 + Location + Set-Cookie) og callbackens state-avvisning lokalt.

- [ ] **Step 1: Implementer `api/src/functions/authAtlassian.js`**

```js
import { app } from '@azure/functions';
import crypto from 'node:crypto';
import { buildAuthorizeUrl } from '../lib/atlassianAuth.js';
import { stateCookie } from '../lib/session.js';

// Starter OAuth-flyten: lagrer state i en kortlevd kryptert cookie og redirecter til Atlassian.
app.http('authAtlassian', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/atlassian',
  handler: async () => {
    const state = crypto.randomUUID();
    return {
      status: 302,
      headers: { Location: buildAuthorizeUrl(state) },
      cookies: [stateCookie(state)],
    };
  },
});
```

- [ ] **Step 2: Implementer `api/src/functions/authCallback.js`**

```js
import { app } from '@azure/functions';
import { exchangeCode, fetchAccessibleResources } from '../lib/atlassianAuth.js';
import { decrypt, readCookie, sessionCookie, clearStateCookie, STATE_COOKIE } from '../lib/session.js';

// OAuth-callback: verifiserer state, bytter code mot tokens, henter cloud-ressurser,
// setter kryptert session-cookie og redirecter til frontend.
app.http('authCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: async (request) => {
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const code = request.query.get('code');
    const state = request.query.get('state');
    const storedState = decrypt(readCookie(request, STATE_COOKIE))?.state;

    if (!state || !storedState || state !== storedState) {
      return { status: 400, body: 'Ugyldig state-parameter' };
    }

    try {
      const tokens = await exchangeCode(code);
      const session = {
        authMode: 'oauth',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
      };
      const clouds = await fetchAccessibleResources(tokens.access_token);
      session.availableClouds = clouds;
      if (clouds.length > 0) {
        session.cloudId = clouds[0].id;
        session.cloudName = clouds[0].name;
      }
      return {
        status: 302,
        headers: { Location: frontend },
        cookies: [sessionCookie(session), clearStateCookie()],
      };
    } catch (err) {
      console.error('[AUTH] Callback-feil:', err.message);
      return { status: 302, headers: { Location: `${frontend}?auth_error=callback` } };
    }
  },
});
```

- [ ] **Step 3: Verifiser at funksjonene lastes og at start-ruten redirecter**

Run: `cd api && func start`
Expected: `func` lister nå også `authAtlassian: [GET] .../api/auth/atlassian` og `authCallback: [GET] .../api/auth/callback` uten lastefeil.

I et annet vindu:
```bash
curl -i "http://localhost:7071/api/auth/atlassian"
```
Expected: `HTTP/1.1 302`, en `Location: https://auth.atlassian.com/authorize?...` header, og en `Set-Cookie: jcd_oauth_state=...` header.

- [ ] **Step 4: Verifiser at callback avviser manglende/feil state**

Run:
```bash
curl -i "http://localhost:7071/api/auth/callback?code=x&state=feil"
```
Expected: `HTTP/1.1 400` med body `Ugyldig state-parameter`. Stopp `func`.

- [ ] **Step 5: Commit**

```bash
git add api/src/functions/authAtlassian.js api/src/functions/authCallback.js
git commit -m "Legg til OAuth-funksjoner (auth/atlassian + auth/callback)"
```

---

## Task 5: Auth-statusfunksjoner (me, select-cloud, logout, apikey)

**Files:**
- Create: `api/src/functions/authMe.js`
- Create: `api/src/functions/authSelectCloud.js`
- Create: `api/src/functions/authLogout.js`
- Create: `api/src/functions/authApikey.js`

**Interfaces:**
- Consumes: `readSession`, `sessionCookie`, `clearSessionCookie` (Task 2); `buildAuthStatus`, `fetchAccessibleResources` (Task 3).
- Produces: `GET /api/auth/me`, `POST /api/auth/select-cloud`, `POST /api/auth/logout`, `POST /api/auth/apikey`.

- [ ] **Step 1: Implementer `api/src/functions/authMe.js`**

```js
import { app } from '@azure/functions';
import { readSession } from '../lib/session.js';
import { buildAuthStatus, fetchAccessibleResources } from '../lib/atlassianAuth.js';

// Returnerer autentiseringsstatus. Henter availableClouds på nytt dersom de ble
// trimmet ut av cookien (H.1-mitigering, spec §5).
app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (request) => {
    const session = readSession(request);
    const status = buildAuthStatus(session);
    if (status.authenticated && status.authMode === 'oauth' && session?.cloudsTrimmed) {
      try {
        status.availableClouds = await fetchAccessibleResources(session.accessToken);
      } catch {
        /* behold tom liste ved feil */
      }
    }
    return { jsonBody: status };
  },
});
```

- [ ] **Step 2: Implementer `api/src/functions/authSelectCloud.js`**

```js
import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { fetchAccessibleResources } from '../lib/atlassianAuth.js';

// Bytter aktiv Atlassian-instans og setter oppdatert session-cookie.
app.http('authSelectCloud', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/select-cloud',
  handler: async (request) => {
    const session = readSession(request);
    if (!session || session.authMode !== 'oauth') {
      return { status: 401, jsonBody: { error: 'Ikke autentisert' } };
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    }
    let clouds = session.availableClouds;
    if (!clouds && session.cloudsTrimmed) {
      try {
        clouds = await fetchAccessibleResources(session.accessToken);
      } catch {
        clouds = [];
      }
    }
    const found = (clouds ?? []).find((c) => c.id === body.cloudId);
    if (!found) return { status: 400, jsonBody: { error: 'Ugyldig cloudId' } };
    const updated = { ...session, cloudId: found.id, cloudName: found.name };
    return { jsonBody: { ok: true }, cookies: [sessionCookie(updated)] };
  },
});
```

- [ ] **Step 3: Implementer `api/src/functions/authLogout.js`**

```js
import { app } from '@azure/functions';
import { clearSessionCookie } from '../lib/session.js';

// Logger ut ved å tømme session-cookien.
app.http('authLogout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: async () => ({ jsonBody: { ok: true }, cookies: [clearSessionCookie()] }),
});
```

- [ ] **Step 4: Implementer `api/src/functions/authApikey.js`**

```js
import { app } from '@azure/functions';
import { sessionCookie } from '../lib/session.js';

// API-nøkkel-innlogging (midlertidig reserve til OAuth er verifisert i prod, spec §8d).
// Lagrer kredensialene i den krypterte cookien. Anthropic-nøkkel håndteres IKKE her.
app.http('authApikey', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/apikey',
  handler: async (request) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Ugyldig body' } };
    }
    const { email, apiToken, jiraBaseUrl, confluenceBaseUrl } = body;
    if (!email || !apiToken || !jiraBaseUrl) {
      return { status: 400, jsonBody: { error: 'Mangler påkrevde felt' } };
    }
    const session = {
      authMode: 'apikey',
      apiKeyEmail: email,
      apiKeyToken: apiToken,
      jiraBaseUrl,
      confluenceBaseUrl: confluenceBaseUrl || jiraBaseUrl,
    };
    return { jsonBody: { ok: true }, cookies: [sessionCookie(session)] };
  },
});
```

- [ ] **Step 5: Verifiser apikey-login → me → logout ende-til-ende med cookie-jar**

Run: `cd api && func start`. I et annet vindu:
```bash
# 1) Logg inn med apikey (bruk en gyldig Jira-URL; token trenger ikke være ekte for dette steget)
curl -s -X POST http://localhost:7071/api/auth/apikey \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@b.no","apiToken":"dummy","jiraBaseUrl":"https://neas.atlassian.net"}' \
  -c cookies.txt
# Expected: {"ok":true}

# 2) Sjekk status med cookien
curl -s http://localhost:7071/api/auth/me -b cookies.txt
# Expected: {"authenticated":true,"authMode":"apikey","jiraBaseUrl":"https://neas.atlassian.net","confluenceBaseUrl":"https://neas.atlassian.net"}

# 3) Logg ut
curl -s -X POST http://localhost:7071/api/auth/logout -b cookies.txt -c cookies.txt
# Expected: {"ok":true}

# 4) Status skal nå være uautentisert (forutsatt at env-apikey-fallback ikke er satt)
curl -s http://localhost:7071/api/auth/me -b cookies.txt
# Expected: {"authenticated":false}
```
Stopp `func`. Slett `cookies.txt` etterpå.

- [ ] **Step 6: Commit**

```bash
git add api/src/functions/authMe.js api/src/functions/authSelectCloud.js api/src/functions/authLogout.js api/src/functions/authApikey.js
git commit -m "Legg til auth-statusfunksjoner (me, select-cloud, logout, apikey)"
```

---

## Task 6: Atlassian-proxy + test-connection

**Files:**
- Create: `api/src/lib/atlassianProxy.js`
- Create: `api/src/functions/atlassianProxy.js`
- Create: `api/src/functions/testConnection.js`
- Test: `api/test/atlassianProxy.test.js`

**Interfaces:**
- Consumes: `resolveAuth`, `AuthError` (Task 3); `readSession`, `sessionCookie` (Task 2).
- Produces:
  - lib: `forwardToAtlassian({ method, targetUrl, query, bodyText, authHeader }, fetchFn?) → { status, jsonBody?|body?, cookies? }`
  - ruter: `ALL /api/atlassian/proxy`, `GET /api/test-connection`.

- [ ] **Step 1: Skriv den feilende testen `api/test/atlassianProxy.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { forwardToAtlassian } = await import('../src/lib/atlassianProxy.js');

function fakeResponse({ status = 200, json, text, contentType = 'application/json', location }) {
  return {
    status,
    headers: {
      get: (h) => (h === 'content-type' ? contentType : h === 'location' ? location : null),
    },
    json: async () => json,
    text: async () => text,
  };
}

test('forwardToAtlassian slår sammen query (dropper _) og returnerer JSON', async () => {
  let calledUrl;
  const fetchFn = async (u) => {
    calledUrl = u;
    return fakeResponse({ status: 200, json: { ok: true } });
  };
  const query = new URLSearchParams('maxResults=50&_=123');
  const r = await forwardToAtlassian(
    { method: 'GET', targetUrl: 'https://api.atlassian.com/x', query, bodyText: '', authHeader: 'Bearer T' },
    fetchFn,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.jsonBody, { ok: true });
  assert.ok(calledUrl.includes('maxResults=50'));
  assert.ok(!calledUrl.includes('_=123'));
});

test('forwardToAtlassian gjør 3xx om til 401 med redirectTo', async () => {
  const fetchFn = async () => fakeResponse({ status: 302, location: 'https://login' });
  const r = await forwardToAtlassian(
    { method: 'GET', targetUrl: 'https://x/y', query: new URLSearchParams(), bodyText: '', authHeader: 'Basic z' },
    fetchFn,
  );
  assert.equal(r.status, 401);
  assert.equal(r.jsonBody.redirectTo, 'https://login');
});

test('forwardToAtlassian sender body kun for ikke-GET', async () => {
  let sentBody;
  const fetchFn = async (_u, opts) => {
    sentBody = opts.body;
    return fakeResponse({ status: 201, json: { created: true } });
  };
  await forwardToAtlassian(
    { method: 'POST', targetUrl: 'https://x/y', query: new URLSearchParams(), bodyText: '{"a":1}', authHeader: 'Bearer T' },
    fetchFn,
  );
  assert.equal(sentBody, '{"a":1}');
});
```

- [ ] **Step 2: Kjør testen og bekreft at den feiler**

Run: `cd api && npm test`
Expected: FAIL — `Cannot find module '../src/lib/atlassianProxy.js'`.

- [ ] **Step 3: Implementer `api/src/lib/atlassianProxy.js`**

```js
// Ren videresendingslogikk for Atlassian-proxy. Ingen @azure/functions-import.
export async function forwardToAtlassian({ method, targetUrl, query, bodyText, authHeader }, fetchFn = fetch) {
  const url = new URL(targetUrl);
  for (const [key, value] of query.entries()) {
    if (key !== '_') url.searchParams.set(key, value);
  }

  const options = {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
    redirect: 'manual',
  };
  if (method !== 'GET' && method !== 'HEAD' && bodyText) {
    options.body = bodyText;
  }

  const response = await fetchFn(url.toString(), options);

  if (response.status >= 300 && response.status < 400) {
    return {
      status: 401,
      jsonBody: {
        error: 'Autentiserings-omdirigering oppdaget',
        message: 'Atlassian omdirigerer forespørselen. API-token kan være ugyldig.',
        redirectTo: response.headers.get('location'),
      },
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return { status: response.status, jsonBody: await response.json() };
  }
  return { status: response.status, body: await response.text() };
}
```

- [ ] **Step 4: Kjør testen og bekreft at den passerer**

Run: `cd api && npm test`
Expected: PASS — inkludert de tre nye proxy-testene.

- [ ] **Step 5: Implementer `api/src/functions/atlassianProxy.js`**

```js
import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { resolveAuth, AuthError } from '../lib/atlassianAuth.js';
import { forwardToAtlassian } from '../lib/atlassianProxy.js';

// Videresender alle forespørsler til Atlassian. Mål-URL kommer i X-Target-URL-headeren.
// Setter fornyet session-cookie dersom access-token ble oppdatert underveis.
app.http('atlassianProxy', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  authLevel: 'anonymous',
  route: 'atlassian/proxy',
  handler: async (request) => {
    const session = readSession(request);

    let auth;
    try {
      auth = await resolveAuth(session);
    } catch (err) {
      if (err instanceof AuthError) return { status: 401, jsonBody: { error: err.message, reauthRequired: true } };
      throw err;
    }

    const targetUrl = request.headers.get('x-target-url');
    if (!targetUrl) return { status: 400, jsonBody: { error: 'Mangler X-Target-URL header' } };

    const bodyText = request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : '';

    let result;
    try {
      result = await forwardToAtlassian({
        method: request.method,
        targetUrl,
        query: request.query,
        bodyText,
        authHeader: auth.authHeader,
      });
    } catch (err) {
      console.error('[PROXY] Feil:', err.message);
      return { status: 500, jsonBody: { error: 'Proxy-feil', message: err.message } };
    }

    if (auth.refreshed) result.cookies = [sessionCookie(auth.session)];
    return result;
  },
});
```

- [ ] **Step 6: Implementer `api/src/functions/testConnection.js`**

```js
import { app } from '@azure/functions';
import { readSession, sessionCookie } from '../lib/session.js';
import { resolveAuth, AuthError } from '../lib/atlassianAuth.js';

// Tester tilkoblingen mot Atlassian. Mål-URL fra X-Target-URL, eller /myself i oauth-modus.
app.http('testConnection', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'test-connection',
  handler: async (request) => {
    const session = readSession(request);

    let auth;
    try {
      auth = await resolveAuth(session);
    } catch (err) {
      if (err instanceof AuthError) return { status: 401, jsonBody: { error: err.message, reauthRequired: true } };
      throw err;
    }

    const headerTarget = request.headers.get('x-target-url');
    const targetUrl =
      headerTarget ||
      (session?.authMode === 'oauth'
        ? `https://api.atlassian.com/ex/jira/${session.cloudId}/rest/api/3/myself`
        : null);
    if (!targetUrl) return { jsonBody: { success: false, error: 'Mangler X-Target-URL header' } };

    const base = auth.refreshed ? { cookies: [sessionCookie(auth.session)] } : {};
    try {
      const response = await fetch(targetUrl, {
        headers: { Authorization: auth.authHeader, Accept: 'application/json' },
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        return { ...base, jsonBody: { success: false, error: 'Omdirigering oppdaget – autentisering kan ha feilet', status: response.status } };
      }
      if (response.status >= 400) {
        const text = await response.text();
        return { ...base, jsonBody: { success: false, error: 'API-feil', status: response.status, body: text.substring(0, 500) } };
      }
      return { ...base, jsonBody: { success: true, status: response.status, message: 'Tilkobling vellykket!' } };
    } catch (err) {
      return { jsonBody: { success: false, error: err.message } };
    }
  },
});
```

- [ ] **Step 7: Verifiser proxy ende-til-ende mot ekte Jira (apikey-modus)**

Krever en gyldig Atlassian-e-post + API-token og riktig Jira-URL i `local.settings.json` er ikke nødvendig — vi sender kredensialene via apikey-login. Run: `cd api && func start`, deretter:
```bash
# Logg inn med ekte apikey-kredensialer
curl -s -X POST http://localhost:7071/api/auth/apikey \
  -H 'Content-Type: application/json' \
  -d '{"email":"DIN@neasonline.no","apiToken":"DITT_EKTE_TOKEN","jiraBaseUrl":"https://neas.atlassian.net"}' \
  -c cookies.txt

# Proxy et ekte kall (henter din egen brukerprofil)
curl -s http://localhost:7071/api/atlassian/proxy \
  -H 'X-Target-URL: https://neas.atlassian.net/rest/api/3/myself' \
  -b cookies.txt
```
Expected: JSON med din Atlassian-bruker (`accountId`, `emailAddress`, `displayName`, ...). Stopp `func`, slett `cookies.txt`.

*Hvis du ikke har et token tilgjengelig nå:* hopp over dette steget, men bekreft i stedet at proxy uten cookie gir 401:
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:7071/api/atlassian/proxy -H 'X-Target-URL: https://neas.atlassian.net/rest/api/3/myself'
```
Expected: `401`.

- [ ] **Step 8: Commit**

```bash
git add api/src/lib/atlassianProxy.js api/src/functions/atlassianProxy.js api/src/functions/testConnection.js api/test/atlassianProxy.test.js
git commit -m "Legg til Atlassian-proxy og test-connection som Functions"
```

---

## Task 7: Business Central-port

**Files:**
- Create (kopier uendret fra `server/businessCentral/`):
  - `api/src/lib/bc/auth.js`
  - `api/src/lib/bc/itemsService.js`
  - `api/src/lib/bc/locationsService.js`
  - `api/src/lib/bc/purchaseOrdersService.js`
  - `api/src/lib/bc/itemLedgerEntriesService.js`
- Create: `api/src/lib/bc/handler.js`
- Create: `api/src/functions/bc.js`
- Test: `api/test/bc.test.js`

**Interfaces:**
- Consumes: BC-tjenestene (`getBcItems`, `getBcLocations`+`NEAS_LOCATION_CODES`, `getBcPurchaseOrders`, `getItemConsumption`, `getItemLedgerEntries`) og `getBcToken` — alle uendret fra dagens filer.
- Produces:
  - `handler.js`: `handleBc(resource, query) → { status, jsonBody }` og `bcError(err, context) → { status, jsonBody }`
  - rute `GET /api/bc/{resource}`.

*Merk:* tjenestefilene bruker `fetch` + `getBcToken` og er allerede stateless (per-instans token-cache). De kopieres uendret; de innbyrdes relative importene (`./auth.js` osv.) består fordi alle BC-filene flyttes sammen. Kun Express-routeren (`index.js`) erstattes.

- [ ] **Step 1: Kopier de fem BC-filene uendret**

Run (fra repo-rot, Git Bash):
```bash
mkdir -p api/src/lib/bc
cp server/businessCentral/auth.js api/src/lib/bc/auth.js
cp server/businessCentral/itemsService.js api/src/lib/bc/itemsService.js
cp server/businessCentral/locationsService.js api/src/lib/bc/locationsService.js
cp server/businessCentral/purchaseOrdersService.js api/src/lib/bc/purchaseOrdersService.js
cp server/businessCentral/itemLedgerEntriesService.js api/src/lib/bc/itemLedgerEntriesService.js
```
Verifiser at ingen av de fem importerer noe utenfor `api/src/lib/bc/` (kun `./`-importer og innebygde moduler):
```bash
grep -RnE "from '\.\./|from '\.\.\\\\" api/src/lib/bc/
```
Expected: ingen treff (tom utskrift). Får du treff, må den refererte fila også flyttes inn i `bc/`.

- [ ] **Step 2: Skriv den feilende testen `api/test/bc.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { handleBc, bcError } = await import('../src/lib/bc/handler.js');

test('handleBc ukjent ressurs → 404', async () => {
  const r = await handleBc('tull', new URLSearchParams());
  assert.equal(r.status, 404);
});

test('handleBc item-ledger-entries uten itemNumber → 400', async () => {
  const r = await handleBc('item-ledger-entries', new URLSearchParams());
  assert.equal(r.status, 400);
});

test('bcError mapper auth/nettverk/generelt riktig', () => {
  assert.equal(bcError({ status: 401, message: 'x' }, 'ctx').status, 401);
  assert.equal(bcError({ isAuthError: true, message: 'x' }, 'ctx').status, 401);
  assert.equal(bcError({ code: 'ENOTFOUND', message: 'x' }, 'ctx').status, 503);
  assert.equal(bcError({ name: 'AbortError', message: 'x' }, 'ctx').status, 503);
  assert.equal(bcError({ status: 500, message: 'x' }, 'ctx').status, 500);
});
```

- [ ] **Step 3: Kjør testen og bekreft at den feiler**

Run: `cd api && npm test`
Expected: FAIL — `Cannot find module '../src/lib/bc/handler.js'`.

- [ ] **Step 4: Implementer `api/src/lib/bc/handler.js`**

```js
import { getBcItems } from './itemsService.js';
import { getBcLocations, NEAS_LOCATION_CODES } from './locationsService.js';
import { getBcPurchaseOrders } from './purchaseOrdersService.js';
import { getItemConsumption, getItemLedgerEntries } from './itemLedgerEntriesService.js';

// Oversetter en BC-feil til et HTTP-svar. Erstatter handleBcError fra Express-routeren.
export function bcError(err, context) {
  console.error(`[BC] ${context} feil:`, err.message);
  if (err.status === 401 || err.isAuthError) {
    return { status: 401, jsonBody: { error: 'BC-autentisering feilet. Kontakt administrator – sjekk BC_CLIENT_SECRET.' } };
  }
  if (
    err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ||
    err.name === 'TimeoutError' || err.name === 'AbortError'
  ) {
    return { status: 503, jsonBody: { error: 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.' } };
  }
  return { status: 500, jsonBody: { error: `Business Central returnerte en feil (HTTP ${err.status ?? 500}).`, detail: err.message } };
}

// Ruter en BC-ressurs til riktig tjeneste. Kaster videre til bcError i funksjonsomslaget.
export async function handleBc(resource, query) {
  const fetchedAt = () => new Date().toISOString();

  switch (resource) {
    case 'items': {
      const items = await getBcItems();
      return { status: 200, jsonBody: { items, fetchedAt: fetchedAt() } };
    }
    case 'locations': {
      const locations = await getBcLocations();
      return { status: 200, jsonBody: { locations, neasLocationCodes: NEAS_LOCATION_CODES, fetchedAt: fetchedAt() } };
    }
    case 'purchase-orders': {
      const orders = await getBcPurchaseOrders();
      return { status: 200, jsonBody: { orders, fetchedAt: fetchedAt() } };
    }
    case 'item-consumption': {
      const consumption = await getItemConsumption();
      return { status: 200, jsonBody: { consumption, fetchedAt: fetchedAt() } };
    }
    case 'item-ledger-entries': {
      const itemNumber = query.get('itemNumber');
      const fromDate = query.get('fromDate') || undefined;
      if (!itemNumber) return { status: 400, jsonBody: { error: 'Mangler `itemNumber` query-parameter' } };
      const raw = await getItemLedgerEntries(itemNumber, fromDate);
      const entries = raw.map((r) => ({
        entryNo: r.Entry_No,
        itemNumber: r.Item_No,
        postingDate: r.Posting_Date,
        entryType: r.Entry_Type,
        documentNumber: r.Document_No,
        documentType: r.Document_Type,
        locationCode: r.Location_Code ?? 'UKJENT',
        quantity: r.Quantity ?? 0,
        remainingQuantity: r.Remaining_Quantity ?? 0,
        description: r.Item_Description ?? '',
        unitOfMeasureCode: r.Unit_of_Measure_Code ?? '',
      }));
      return { status: 200, jsonBody: { entries, fetchedAt: fetchedAt() } };
    }
    default:
      return { status: 404, jsonBody: { error: `Ukjent BC-ressurs: ${resource}` } };
  }
}
```

- [ ] **Step 5: Kjør testen og bekreft at den passerer**

Run: `cd api && npm test`
Expected: PASS — inkludert de tre nye BC-testene. (Tjeneste-grenene treffes ikke i testene, så ingen nettverkskall.)

- [ ] **Step 6: Implementer `api/src/functions/bc.js`**

```js
import { app } from '@azure/functions';
import { handleBc, bcError } from '../lib/bc/handler.js';

// Business Central: GET /api/bc/{resource}. App-nivå client-credentials (stateless).
app.http('bc', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bc/{resource}',
  handler: async (request) => {
    const { resource } = request.params;
    const start = Date.now();
    try {
      const result = await handleBc(resource, request.query);
      console.log(`[BC] /bc/${resource} → ${result.status}, ${Date.now() - start}ms`);
      return result;
    } catch (err) {
      return bcError(err, `/bc/${resource}`);
    }
  },
});
```

- [ ] **Step 7: Verifiser BC-ruting lokalt**

Run: `cd api && func start`. `func` skal liste `bc: [GET] .../api/bc/{resource}` uten lastefeil. Deretter:
```bash
# Ukjent ressurs → 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:7071/api/bc/tull
# Expected: 404
```
Har du gyldige BC-verdier i `local.settings.json`, verifiser også et ekte kall:
```bash
curl -s http://localhost:7071/api/bc/locations | head -c 200
# Expected: JSON med "locations": [...] og "neasLocationCodes"
```
Stopp `func`.

- [ ] **Step 8: Commit**

```bash
git add api/src/lib/bc/ api/src/functions/bc.js api/test/bc.test.js
git commit -m "Port Business Central til api/ (bc.js + handler, tjenestefiler kopiert)"
```

---

## Sluttverifisering av Plan 1

Etter siste task, bekreft at hele `api/`-prosjektet er grønt og komplett:

- [ ] **Kjør full testsuite**

Run: `cd api && npm test`
Expected: alle tester i `session.test.js`, `atlassianAuth.test.js`, `atlassianProxy.test.js`, `bc.test.js` passerer; exit-kode 0.

- [ ] **Røyktest at alle ruter lastes**

Run: `cd api && func start`
Expected: `func` lister disse rutene uten feil:
`health`, `authAtlassian`, `authCallback`, `authMe`, `authSelectCloud`, `authLogout`, `authApikey`, `testConnection`, `atlassianProxy`, `bc`. Stopp `func`.

**Leveranse:** `api/`-prosjektet betjener hele den ikke-AI-backenden under `func start`. Frontend-omkobling (`/auth/*` → `/api/auth/*`, AI → egen app), `staticwebapp.config.json`, SWA CLI-integrasjon og deploy/CI kommer i Plan 2 (AI Function App) og Plan 3 (frontend + config/CI/deploy).

---

## Self-review (utført av planforfatter)

**Spec-dekning (Plan 1s omfang):**
- §5 kryptert stateless cookie-session → Task 2 (session.js) + brukes i alle auth-/proxy-funksjoner. ✓
- §5 roterende refresh + fornyelse og re-sett cookie → Task 3 (`ensureFreshToken`, `resolveAuth` returnerer `refreshed`) + Task 6 (proxy setter fornyet cookie). ✓
- §5 H.1 cookie-størrelse-mitigering → Task 2 (`sessionCookie` trimmer) + Task 5 (`authMe`/`selectCloud` re-henter). ✓
- §6 mappestruktur `api/src/functions` + `api/src/lib` → alle tasks. ✓
- §6 BC portet, kun `index.js` erstattes → Task 7. ✓
- §8d apikey-reserve beholdt, Anthropic-nøkkel utelatt → Task 5 (`authApikey` uten anthropicApiKey), ingen `set-anthropic-key`. ✓
- Ikke i Plan 1 (bevisst): `apiRuntime`-pinning i `staticwebapp.config.json` (§6/§9), SWA CLI-lokaldev (§10), App Insights-tilkobling i Azure (§11), AI-endepunkter (§7) → Plan 2/3.

**Plassholder-skann:** ingen TBD/«håndter feil»/«lignende som Task N». All kode er fullstendig; BC-tjenestefiler kopieres eksplisitt (ikke plassholder — de finnes i repoet).

**Typekonsistens:** `resolveAuth` returnerer `{ authHeader, session, refreshed }` — konsumeres likt i `atlassianProxy.js` og `testConnection.js`. `sessionCookie(session)` brukes med samme signatur i Task 4/5/6. `forwardToAtlassian` returnerer `{ status, jsonBody?|body?, cookies? }` — proxy-funksjonen legger til `cookies` ved `refreshed`. `handleBc(resource, query)` og `bcError(err, context)` matcher mellom `handler.js`, `bc.js` og testene. Konsistent.
