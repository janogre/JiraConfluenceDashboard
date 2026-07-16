# SWA Plan 3 – Frontend-omkobling, config og deploy Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koble frontend fra den lokale Express-proxyen til de to nye Azure-backendene (managed functions `/api/*` fra Plan 1 og den frittstående AI Function App-en fra Plan 2), rydde bort klient-Anthropic-nøkkelen, legge til SWA-plattformkonfig og lokalt SWA-CLI-løp, committe CI/CD, og fjerne den utdaterte Express-serveren. Deploy/domene/OAuth-registrering leveres som en human-kjørt sjekkliste.

**Architecture:** SPA-en snakker same-origin med managed functions (`/api/auth/*`, `/api/atlassian/proxy`, `/api/bc/*`) og direkte (CORS) med AI Function App-en (`${VITE_AI_API_BASE}/api/ai/*` + `x-functions-key`). Anthropic-nøkkelen er server-side i AI-appen — klienten sender den ikke lenger og gater ikke lenger på den. Atlassian **apikey-innlogging beholdes** som reserve (spec §8d); kun **Anthropic-nøkkel-UI-et** fjernes.

**Referansespec:** `docs/superpowers/specs/2026-07-14-azure-swa-functions-migrering-design.md` (§8 frontend-endringer, §9 staticwebapp.config.json, §10 lokalt løp, §11 App Insights, §12 secrets, §13 CI/CD/domene/OAuth, §14 Free-plan).
**Forutsetning:** Plan 1 (`api/`) og Plan 2 (`ai-api/`) er ferdig implementert på samme branch (`feat/azure-swa-migrering`).

## Global Constraints

- **Frontend har ingen enhetstest-ramme.** Verifisering skjer via `npm run build` (som er `tsc -b && vite build` — fanger typefeil), målrettede `grep`, og et `swa start`-røyktest der det gir mening. Ikke oppfinn et testrammeverk.
- **Vite-miljøvariabler** injiseres ved build og må prefikses `VITE_`. `import.meta.env.VITE_AI_API_BASE` (AI-appens origin) og `import.meta.env.VITE_AI_FUNCTION_KEY` (function-key). Begge er build-time, havner i bundelen (akseptert, se sikkerhetsnotat).
- **Sikkerhet (fra Plan 2-review):** function-key i bundelen stopper ikke en målrettet insider. **CORS-origin-allowlisten på AI Function App-en er den reelle sikkerhetsperimeteren** — behandles som sikkerhetskritisk deploy-config (sjekklisten under).
- **Node 22 pinnes eksplisitt ved deploy** for begge apper: `platform.apiRuntime: "node:22"` i `staticwebapp.config.json` (managed functions) og Node 22 på den frittstående AI Function App-en (sjekklisten).
- **apikey-innlogging beholdes** (Atlassian email/apiToken/jiraBaseUrl). Fjern KUN Anthropic-nøkkel-flyten.
- **Språk:** all kode-kommentar og UI-tekst på norsk bokmål.
- **`server/`-katalogen fjernes først i Task 6** — den er sannhetskilde/lokalt løp helt til frontend er omkoblet og verifisert.
- **Ett kall-sted per endepunkt beholder sin egen svarhåndtering** — den nye `aiFetch`-hjelperen returnerer rå `Response`.

---

## Berørte filer

```
src/services/aiApi.ts              # NY: aiFetch-hjelper (base + x-functions-key)
src/vite-env.d.ts                  # NY/utvidet: typing for VITE_-variabler
src/services/api.ts                # /auth/* → /api/auth/*, fjern getAnthropicKey
src/store/authStore.ts             # /auth/* → /api/auth/*
src/pages/Login/Login.tsx          # /auth/atlassian → /api/auth/atlassian, fjern Anthropic-felt
src/pages/Settings/Settings.tsx    # fjern Anthropic-UI + /auth/set-anthropic-key
src/pages/Digest/Digest.tsx        # aiFetch, fjern nøkkel-gate
src/pages/NySak/NySak.tsx          # 2 AI-kall, fjern nøkkel-gates
src/pages/Confluence/MeetingNoteEditor.tsx  # aiFetch, fjern anthropicKey-state
src/pages/ProjectWizard/ProjectWizard.tsx   # 2 AI-kall, fjern nøkkel-gates
src/pages/Board/TimelineReport.tsx # aiFetch, fjern nøkkel-gate
src/types/index.ts                 # fjern ApiConfig.anthropicApiKey
vite.config.ts                     # dev-proxy /api → managed functions (via SWA CLI)
staticwebapp.config.json           # NY: apiRuntime node:22 + navigationFallback
.env.example                       # NY: dokumenter VITE-variablene
.env.local                         # NY (gitignorert): lokale VITE-verdier
package.json                       # SWA-CLI-scripts; fjern Express-deps (Task 6)
.github/workflows/*.yml            # NY: CI/CD (Task 5)
server/                            # SLETTES (Task 6)
```

---

## Task 1: AI-hjelper + koble om alle 7 AI-kall til AI Function App-en

**Files:**
- Create: `src/services/aiApi.ts`, `src/vite-env.d.ts` (om den ikke finnes)
- Modify: `Digest.tsx`, `NySak.tsx`, `MeetingNoteEditor.tsx`, `ProjectWizard.tsx`, `TimelineReport.tsx`

**Interfaces:**
- Produces: `aiFetch(endpoint: string, body: unknown) => Promise<Response>` — POST til `${VITE_AI_API_BASE}/api/ai/${endpoint}` med `Content-Type: application/json` og `x-functions-key`.

**Regel:** For hvert AI-kall: (a) bytt `fetch('http://localhost:3001/api/ai/X', {...})` → `aiFetch('X', body)`, (b) fjern `apiKey`/`anthropicKey` fra body-objektet (nøkkelen er server-side), (c) fjern den forutgående `const apiKey = getAnthropicKey()` + `if (!apiKey) {...return}`-vakten og `getAnthropicKey`-importen i fila. Behold all annen logikk (svarhåndtering, feilhåndtering, mutations) uendret.

- [ ] **Step 1: Opprett `src/services/aiApi.ts`**

```ts
// Klient mot den frittstående AI Function App-en (Plan 2). Basis-URL og function-key
// injiseres ved build via Vite-miljøvariabler. Ingen Anthropic-nøkkel sendes fra klienten —
// den bor server-side i AI-appen.
const AI_API_BASE = import.meta.env.VITE_AI_API_BASE ?? '';
const AI_FUNCTION_KEY = import.meta.env.VITE_AI_FUNCTION_KEY ?? '';

// POST mot et AI-endepunkt. Returnerer rå Response slik at hvert kallsted beholder
// sin egen svarhåndtering. Legger på x-functions-key og Content-Type.
export function aiFetch(endpoint: string, body: unknown): Promise<Response> {
  return fetch(`${AI_API_BASE}/api/ai/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-functions-key': AI_FUNCTION_KEY,
    },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Sikre Vite-env-typing i `src/vite-env.d.ts`**

Hvis fila ikke finnes, opprett den. Hvis den finnes (typisk `/// <reference types="vite/client" />`), legg til `ImportMetaEnv`-blokken:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_BASE?: string;
  readonly VITE_AI_FUNCTION_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: `src/pages/Digest/Digest.tsx`**

Legg til import `import { aiFetch } from '../../services/aiApi';`. Fjern `getAnthropicKey` fra `import { isConfigured, getAnthropicKey } from '../../services/api';` (→ `import { isConfigured } from '../../services/api';`). Fjern `const anthropicKey = getAnthropicKey();` (linje 146) og `if (!anthropicKey) {...return;}`-vakten (rundt linje 181). Bytt kallet:

```ts
// FØR
const res = await fetch('http://localhost:3001/api/ai/digest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apiKey: anthropicKey, messages: [{ role: 'user', content: prompt }] }),
});
// ETTER
const res = await aiFetch('digest', { messages: [{ role: 'user', content: prompt }] });
```

- [ ] **Step 4: `src/pages/NySak/NySak.tsx` (to kall)**

Legg til `import { aiFetch } from '../../services/aiApi';`. Fjern `import { getAnthropicKey } from '../../services/api';`. Fjern begge `const apiKey = getAnthropicKey();` + `if (!apiKey) {...return;}`-blokkene (linje 323 og 357). Bytt kallene:

```ts
// classify-issue (var linje 336)
const response = await aiFetch('classify-issue', { text: fritekst, allowed: byggTillatteVerdier() });
// rewrite-description (var linje 369)
const response = await aiFetch('rewrite-description', { text: fritekst, arbeidstype });
```

- [ ] **Step 5: `src/pages/Confluence/MeetingNoteEditor.tsx`**

Legg til `import { aiFetch } from '../../services/aiApi';`. Fjern `import { getAnthropicKey } from '../../services/api';`. Fjern `anthropicKey`-state og resync (linje 448, 452, 455) og `const key = getAnthropicKey(); if (!key) throw ...` (linje 491). Bytt kallet (dette løser også `key`/`anthropicKey`-uoverensstemmelsen — begge fjernes):

```ts
// FØR (inne i rewriteMutation.mutationFn)
const key = getAnthropicKey();
if (!key) throw new Error('Anthropic API-nøkkel mangler – legg den inn under Innstillinger.');
const response = await fetch('http://localhost:3001/api/ai/rewrite-meeting', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notes, attendees: attendees.join(', '), context, apiKey: anthropicKey }),
});
// ETTER
const response = await aiFetch('rewrite-meeting', { notes, attendees: attendees.join(', '), context });
```

- [ ] **Step 6: `src/pages/ProjectWizard/ProjectWizard.tsx` (to kall)**

Legg til `import { aiFetch } from '../../services/aiApi';`. Fjern `import { getAnthropicKey } from '../../services/api';`. Fjern begge `const apiKey = getAnthropicKey(); if (!apiKey) {...return;}`-blokkene (linje 469 og 574). I `suggest-subtasks`: fjern `apiKey`-feltet fra `body`-objektet (bygget linje 477-493) og bytt til `aiFetch('suggest-subtasks', body)`. I `project-documents`: bytt til

```ts
const response = await aiFetch('project-documents', {
  documents: selectedDocs,
  projectInfo: { name: projectInfo.name, owner: projectInfo.owner, description: projectInfo.description },
  additionalInfo,
});
```

- [ ] **Step 7: `src/pages/Board/TimelineReport.tsx`**

Legg til `import { aiFetch } from '../../services/aiApi';`. Fjern `import { getAnthropicKey } from '../../services/api';`. Fjern `const apiKey = getAnthropicKey(); if (!apiKey) {...return;}` (linje 64). Bytt kallet til `aiFetch('timeline-report', { reportDate, issues: issues.map(...) })` — behold hele `issues.map(...)`-strukturen (linje 76-87) uendret, fjern kun `apiKey`-feltet.

- [ ] **Step 8: Sett lokale env-verdier og verifiser build + at ingen localhost:3001/body-nøkkel gjenstår**

Opprett `.env.local` i repo-rot (gitignoreres i Task 4):
```
VITE_AI_API_BASE=http://localhost:7072
VITE_AI_FUNCTION_KEY=
```
Run:
```bash
npm run build
```
Expected: `tsc -b && vite build` fullfører uten feil (ingen ubrukte importer, ingen typefeil).
```bash
grep -rn "localhost:3001" src/                 # Expected: ingen treff
grep -rn "api/ai/" src/ | grep -v aiApi.ts     # Expected: ingen treff (alle kall går via aiFetch)
```

- [ ] **Step 9: Commit**

```bash
git add src/services/aiApi.ts src/vite-env.d.ts src/pages/Digest/Digest.tsx src/pages/NySak/NySak.tsx src/pages/Confluence/MeetingNoteEditor.tsx src/pages/ProjectWizard/ProjectWizard.tsx src/pages/Board/TimelineReport.tsx
git commit -m "Koble AI-kall til frittstående AI Function App (VITE_AI_API_BASE + x-functions-key)"
```

---

## Task 2: Fjern Anthropic-klientnøkkel-flyten

**Files:** Modify `src/services/api.ts`, `src/types/index.ts`, `src/pages/Login/Login.tsx`, `src/pages/Settings/Settings.tsx`

**Interfaces:** Fjerner `getAnthropicKey` (fra api.ts) og `ApiConfig.anthropicApiKey` (fra types). Ingen kall til disse skal gjenstå etter Task 1.

- [ ] **Step 1: Fjern `getAnthropicKey()` fra `src/services/api.ts`**

Slett hele funksjonen (linje 110-113):
```ts
export function getAnthropicKey(): string | null {
  const config = getApiConfig();
  return config?.anthropicApiKey ?? null;
}
```

- [ ] **Step 2: Fjern `anthropicApiKey` fra `ApiConfig` i `src/types/index.ts`**

Slett feltet `anthropicApiKey?: string;` (linje 258).

- [ ] **Step 3: Fjern Anthropic-feltet fra apikey-skjemaet i `src/pages/Login/Login.tsx`**

Slett kun `<label>`-blokken for «Anthropic API-nøkkel (valgfri)» (linje 121-130) — la de fire Atlassian-feltene over stå urørt. Fjern `anthropicApiKey: ''` fra `ApiConfig`-initialiseringen (linje 11-13).

- [ ] **Step 4: Fjern Anthropic-UI-et fra `src/pages/Settings/Settings.tsx`**

Fjern begge Anthropic-nøkkel-UI-ene og OAuth-lagringen:
- OAuth-modus-blokken (linje 130-144) med `<label>Anthropic API-nøkkel (valgfri)</label>...` og «Lagre»-knappen.
- `handleSaveAnthropicKey`-funksjonen (linje 46-51) inkl. `axios.post('/auth/set-anthropic-key', ...)`.
- Stated `anthropicKey`/`anthropicSaved` (linje 26-27).
- apikey-modus-`<Input label="Anthropic API-nøkkel (valgfri)" ...>` (linje 180) — la de fire Atlassian-`<Input>`-ene over (Jira/Confluence/E-post/API-token) stå urørt.
- `anthropicApiKey: ''` fra `ApiConfig`-initialiseringen (linje 15-19).

Fjern nå ubrukte importer (`Save`/`Check` fra lucide-react hvis kun brukt her, `axios` hvis ikke lenger brukt).

- [ ] **Step 5: Verifiser at all Anthropic-nøkkel-referanse er borte + build**

```bash
grep -rn "getAnthropicKey\|anthropicApiKey\|set-anthropic-key\|anthropicKey" src/   # Expected: ingen treff
npm run build   # Expected: OK
```

- [ ] **Step 6: Commit**

```bash
git add src/services/api.ts src/types/index.ts src/pages/Login/Login.tsx src/pages/Settings/Settings.tsx
git commit -m "Fjern Anthropic-klientnøkkel-flyt (server-side nøkkel i AI-appen)"
```

---

## Task 3: Flytt auth-ruter fra `/auth/*` til `/api/auth/*`

**Files:** Modify `src/services/api.ts`, `src/store/authStore.ts`, `src/pages/Login/Login.tsx`

**Regel:** Managed functions svarer kun under `/api`. Endre backend-kallene (IKKE React Router-ruten `App.tsx:52 /auth/callback`, som er en klient-side path).

- [ ] **Step 1: `src/services/api.ts`**

- linje 58: `axios.get('/auth/me', ...)` → `axios.get('/api/auth/me', ...)`
- linje 64: `axios.post('/auth/apikey', config, ...)` → `axios.post('/api/auth/apikey', config, ...)`
- linje 71: `axios.post('/auth/logout', {}, ...)` → `axios.post('/api/auth/logout', {}, ...)`

- [ ] **Step 2: `src/store/authStore.ts`**

- linje 76: `axios.post('/auth/select-cloud', ...)` → `axios.post('/api/auth/select-cloud', ...)`
- linje 82: `axios.post('/auth/apikey', config, ...)` → `axios.post('/api/auth/apikey', config, ...)`

- [ ] **Step 3: `src/pages/Login/Login.tsx`**

- linje 18: `window.location.href = '/auth/atlassian';` → `window.location.href = '/api/auth/atlassian';`

- [ ] **Step 4: Verifiser at kun React Router-ruten gjenstår som bar `/auth/` + build**

```bash
grep -rn "'/auth/\|\"/auth/\|= '/auth/" src/
# Expected: KUN App.tsx (React Router path /auth/callback). Alle backend-kall skal nå være /api/auth/*.
grep -rn "/api/auth/" src/   # Expected: me, apikey (×2), logout, select-cloud, atlassian
npm run build   # Expected: OK
```

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/store/authStore.ts src/pages/Login/Login.tsx
git commit -m "Flytt auth-kall til /api/auth/* (managed functions)"
```

---

## Task 4: staticwebapp.config.json + lokalt SWA-CLI-løp

**Files:** Create `staticwebapp.config.json`, `.env.example`; Modify `vite.config.ts`, `.gitignore`, `package.json` (scripts), `ai-api/local.settings.json` (lokal CORS)

**Forutsetning:** SWA CLI installert (`npm i -g @azure/static-web-apps-cli`; `swa --version`). Dokumenteres i README-oppdatering.

- [ ] **Step 1: Opprett `staticwebapp.config.json` i repo-rot**

```json
{
  "platform": { "apiRuntime": "node:22" },
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*"]
  }
}
```

- [ ] **Step 2: Opprett `.env.example`** (committes; dokumenterer variablene)

```
# Basis-URL til den frittstående AI Function App-en (Plan 2).
# Lokalt: http://localhost:7072 (func-porten under). Prod: https://<ai-app>.azurewebsites.net
VITE_AI_API_BASE=http://localhost:7072

# Function-key til AI Function App-en (x-functions-key). Tom lokalt (func håndhever ikke keys lokalt).
# Prod: hentes fra Function App-en. NB: havner i klient-bundelen — CORS-allowlist er den reelle beskyttelsen.
VITE_AI_FUNCTION_KEY=
```

- [ ] **Step 3: Gitignorer `.env.local`**

Legg til i `.gitignore` (om ikke allerede dekket): `.env.local` og `.env.*.local`.

- [ ] **Step 4: Sett lokal CORS for AI-appen mot SWA-CLI-origin**

I `ai-api/local.settings.json` (gitignorert), sett `Host.CORS` til `"*"` for lokal utvikling (SWA CLI kjører frontend på `http://localhost:4280`, som ellers ikke matcher `5173`). Dette er kun lokalt; prod-CORS settes på Function App-en (sjekklisten).

- [ ] **Step 5: Forenkle `vite.config.ts` dev-proxy**

Under SWA CLI proxyer plattformen `/api` til managed functions, så Vite-proxyen trengs ikke for `/api`/`/auth` lenger. Sett:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 6: Oppdater root `package.json`-scripts til SWA-CLI-løp**

Erstatt `dev`/`proxy`/`start` (behold `build`/`lint`/`preview`):

```json
"scripts": {
  "dev": "vite",
  "dev:ai": "func start --script-root ai-api --port 7072",
  "swa": "swa start http://localhost:5173 --run \"npm run dev\" --api-location api",
  "start": "concurrently \"npm run dev:ai\" \"npm run swa\"",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

*Merk:* `swa start` starter frontend (Vite på 5173, proxyet på 4280) + managed functions (`api/`) på `/api`; AI-appen kjøres separat på 7072 (`VITE_AI_API_BASE` peker dit). Hvis `func --script-root` ikke støttes av din func-versjon, bruk `concurrently "cd ai-api && func start --port 7072" "npm run swa"` i stedet.

- [ ] **Step 7: Verifiser build og et lokalt SWA-røyktest**

```bash
npm run build   # Expected: OK
```
Start løpet (`npm start`), åpne `http://localhost:4280`, og bekreft i nettleserens nettverksfane:
- `/api/auth/me` går til same-origin (managed functions) og svarer.
- Et AI-kall (f.eks. Digest) går til `http://localhost:7072/api/ai/digest`.

*Advarsel (spec §10):* `swa start` håndhever ikke 45s-taket lokalt — det er ikke bevis på Azure-oppførsel.

- [ ] **Step 8: Commit**

```bash
git add staticwebapp.config.json .env.example .gitignore vite.config.ts package.json
git commit -m "Legg til staticwebapp.config.json + SWA-CLI-basert lokalt løp"
```

---

## Task 5: CI/CD-workflows (committes; secrets/deploy er human-steg)

**Files:** Create `.github/workflows/azure-swa.yml`, `.github/workflows/ai-function-app.yml`

**Interfaces:** To deploy-jobber — én for SPA+managed functions via SWA, én for den frittstående AI Function App-en. Faktisk kjøring krever secrets satt i GitHub (sjekklisten).

- [ ] **Step 1: Opprett `.github/workflows/azure-swa.yml`**

```yaml
name: Azure Static Web Apps CI/CD

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [main]

jobs:
  build_and_deploy:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build og deploy
    steps:
      - uses: actions/checkout@v4
      - name: Bygg og deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: "/"
          api_location: "api"
          output_location: "dist"
        env:
          VITE_AI_API_BASE: ${{ secrets.VITE_AI_API_BASE }}
          VITE_AI_FUNCTION_KEY: ${{ secrets.VITE_AI_FUNCTION_KEY }}
```

- [ ] **Step 2: Opprett `.github/workflows/ai-function-app.yml`**

```yaml
name: AI Function App CI/CD

on:
  push:
    branches: [main]
    paths: [ 'ai-api/**' ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy AI Function App
    steps:
      - uses: actions/checkout@v4
      - name: Sett opp Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Installer avhengigheter
        run: npm ci
        working-directory: ai-api
      - name: Deploy til Azure Functions
        uses: Azure/functions-action@v1
        with:
          app-name: ${{ secrets.AI_FUNCTION_APP_NAME }}
          package: ai-api
          publish-profile: ${{ secrets.AI_FUNCTION_APP_PUBLISH_PROFILE }}
```

- [ ] **Step 3: Verifiser YAML-gyldighet**

```bash
# Enkel gyldighetssjekk (Node er tilgjengelig)
node -e "const y=require('fs').readFileSync('.github/workflows/azure-swa.yml','utf8'); if(!y.includes('static-web-apps-deploy')) throw new Error('feil'); console.log('azure-swa.yml OK')"
node -e "const y=require('fs').readFileSync('.github/workflows/ai-function-app.yml','utf8'); if(!y.includes('functions-action')) throw new Error('feil'); console.log('ai-function-app.yml OK')"
```
(Faktisk deploy verifiseres først når secrets er satt — se sjekklisten.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit -m "Legg til CI/CD-workflows for SWA og AI Function App"
```

---

## Task 6: Opprydding — fjern Express-serveren og utdaterte avhengigheter

**Files:** Delete `server/`; Modify `package.json`, `.env.example`, `CLAUDE.md`

**Forutsetning:** Task 1–4 er verifisert (frontend kjører mot Azure-backendene lokalt via SWA CLI). `server/proxy.js` og `server/businessCentral/` er nå fullstendig erstattet av `api/` + `ai-api/`.

- [ ] **Step 1: Slett `server/`-katalogen**

```bash
git rm -r server/
```

- [ ] **Step 2: Fjern utdaterte avhengigheter fra root `package.json`**

Fjern disse fra `dependencies` (kun brukt av den slettede Express-serveren): `cors`, `dotenv`, `express`, `express-session`, `http-proxy-middleware`, `session-file-store`. Behold alle frontend-deps (react, axios, zustand, @tanstack/react-query, framer-motion, html2pdf.js, lucide-react, @hello-pangea/dnd, react-router-dom).

Vurder `concurrently` (devDependencies): fortsatt brukt av det nye `start`-scriptet (`dev:ai` + `swa`), så **behold** den.

Kjør `npm install` for å oppdatere `package-lock.json`.

- [ ] **Step 3: Rydd rot-`.env.example` (fjern backend-vars, behold kun VITE)**

Rot-`.env.example` dokumenterte `server/proxy.js` sine env-vars (`ATLASSIAN_*`, `ANTHROPIC_API_KEY`, `BC_*`). Disse hører nå hjemme i `api/local.settings.json` / `ai-api/local.settings.json` og de respektive Azure app settings. Fjern alle backend-vars fra rot-`.env.example` slik at den KUN dokumenterer frontend-variablene `VITE_AI_API_BASE` og `VITE_AI_FUNCTION_KEY`.

- [ ] **Step 4: Oppdater `CLAUDE.md` til SWA + Functions-arkitektur**

- **Commands-seksjonen:** `npm start` starter nå SWA CLI + AI-func (ikke `proxy` + `vite`). Oppdater kommando-listen. Legg til at lokal `swa start` krever **Node 20/22** (SWA CLI sin innbygde Core Tools avviser Node 24; `api/` + `ai-api/` func kjører på Node 24 hver for seg via `npm test`/`func start`).
- **Architecture-seksjonen:** «Proxy Server Pattern» (Express `server/proxy.js` på port 3001) og «AI Endpoints (proxy server)» beskriver en fjernet arkitektur. Erstatt med: managed functions under SWA `/api` (`api/`) for Atlassian-proxy/auth/BC (kryptert cookie-session), og en frittstående AI Function App (`ai-api/`) for AI-endepunktene med server-side Anthropic-nøkkel.

- [ ] **Step 5: Verifiser at frontend bygger og at ingenting refererer server/**

```bash
grep -rn "server/proxy\|businessCentral\|localhost:3001" src/   # Expected: ingen treff
grep -rnE "express|session-file-store|http-proxy-middleware" package.json   # Expected: ingen treff (deps fjernet)
npm install && npm run build   # Expected: OK
```
(Integrert `swa start`-røyktest krever Node 20/22 lokalt — kjøres av mennesket ved behov; her holder build + grep.)

- [ ] **Step 6: Commit**

```bash
git add server package.json package-lock.json .env.example CLAUDE.md
git commit -m "Fjern Express-server + utdaterte deps; oppdater .env.example og CLAUDE.md til SWA-arkitektur"
```

---

## Deploy-sjekkliste (human-kjørt — krever Azure/Atlassian/GitHub-tilgang)

Dette er IKKE subagent-steg. De krever konsolltilgang og beslutninger (ressursnavn, domene) fra teamet. Rekkefølge:

1. **Opprett ressurser:**
   - Static Web App (Free-plan, §14). Koble til GitHub-repoet → genererer `AZURE_STATIC_WEB_APPS_API_TOKEN`-secret automatisk.
   - Frittstående Function App for `ai-api/` (Consumption, **Node 22**). Hent publish profile → `AI_FUNCTION_APP_PUBLISH_PROFILE`-secret; sett `AI_FUNCTION_APP_NAME`-secret.
2. **App settings (§12):**
   - **SWA managed functions:** `SESSION_SECRET`, `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` (= `https://<domene>/api/auth/callback`), `FRONTEND_URL` (= domenerot), `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, **`BC_COMPANY_ID`**, **`BC_ENVIRONMENT`**, `BC_ITEM_GROUPS` (valgfri), `APPLICATIONINSIGHTS_CONNECTION_STRING`. **Sett ALDRI** `ATLASSIAN_EMAIL`/`ATLASSIAN_API_TOKEN`/`JIRA_BASE_URL` her (åpen-proxy-footgun; env-apikey-fallbacken er gated bak `ALLOW_ENV_APIKEY` og skal forbli av i prod).
   - **AI Function App:** `ANTHROPIC_API_KEY`, `APPLICATIONINSIGHTS_CONNECTION_STRING`. Pinn **Node 22** som runtime.
3. **CORS (sikkerhetskritisk, fra Plan 2-review):** på AI Function App-en, sett CORS-origin-allowlist til **kun** SWA-domenet (`https://<domene>`). Dette er den reelle sikkerhetsperimeteren siden function-key ligger i klient-bundelen.
4. **GitHub secrets:** `VITE_AI_API_BASE` (= `https://<ai-app>.azurewebsites.net`), `VITE_AI_FUNCTION_KEY` (fra AI Function App-en), `AI_FUNCTION_APP_NAME`, `AI_FUNCTION_APP_PUBLISH_PROFILE` (SWA-token settes automatisk ved kobling).
5. **Domene:** legg til egendefinert domene i SWA, valider via DNS (CNAME/TXT); gratis managed SSL.
6. **Atlassian-app:** registrer prod-callback `https://<domene>/api/auth/callback` i utviklerkonsollen; verifiser `OAUTH_REDIRECT_URI`/`FRONTEND_URL` matcher.
7. **Verifiser i Azure (ikke lokalt):** OAuth-innlogging ende-til-ende, en Atlassian-proxy-henting, et BC-kall, og et AI-kall (bekreft at 45s-taket ikke rammer AI siden det ligger på eget origin). Application Insights logger på begge apper.

---

## Self-review (utført av planforfatter)

**Spec-dekning:**
- §8a auth-ruter → `/api/auth/*` (inkl. begge `/auth/apikey`-kallsteder) → Task 3. ✓
- §8b AI-kall → `${VITE_AI_API_BASE}/api/ai/*` med `x-functions-key`, hardkodet localhost fjernet → Task 1. ✓
- §8c Anthropic server-side, klient-nøkkel-UI + `getAnthropicKey` + `set-anthropic-key` fjernet → Task 1 (kallsteder/vakter) + Task 2 (definisjon/UI/type). ✓
- §8d apikey-innlogging beholdt → kun Anthropic-UI fjernet; Atlassian-feltene + `/api/auth/apikey` beholdt. ✓
- §9 staticwebapp.config.json (`node:22`, navigationFallback) → Task 4. ✓
- §10 lokalt SWA-CLI-løp + 45s-advarsel → Task 4. ✓
- §12 app settings (inkl. BC_COMPANY_ID/BC_ENVIRONMENT fra Plan 1-review; env-apikey-forbud) → sjekklisten. ✓
- §13 CI/CD (SWA + AI-app), domene, OAuth-registrering → Task 5 + sjekklisten. ✓
- Plan 2-carry-forward: Node 22-pinn (Task 4 + sjekklisten) og CORS-allowlist som reell perimeter (Global Constraints + sjekklisten pkt. 3). ✓

**Plassholder-skann:** ingen TBD. Frontend-endringene siterer eksakt nåværende kode (fra kartleggingen) med presise før→etter. Deploy-sjekklisten er bevisst human-kjørt (krever konsolltilgang), ikke plassholder.

**Typekonsistens:** `aiFetch(endpoint, body) => Promise<Response>` konsumeres likt av alle 7 kallsteder (hvert beholder sin egen `res`-håndtering). Fjerning av `getAnthropicKey`/`ApiConfig.anthropicApiKey` er komplett (grep-verifisert i Task 2 Step 5). `import.meta.env.VITE_*` typet i `vite-env.d.ts`.

**Rekkefølge-avhengighet:** Task 1 fjerner alle *bruk* av `getAnthropicKey`; Task 2 fjerner *definisjonen* — riktig rekkefølge (ellers ubrukt-import/-funksjon-feil). Task 6 (slett `server/`) kommer sist, etter at frontend er verifisert mot Azure-backendene.
