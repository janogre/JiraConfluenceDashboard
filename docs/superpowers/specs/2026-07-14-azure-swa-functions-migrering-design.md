# Design: Migrering til Azure Static Web Apps med Azure Functions

**Dato:** 2026-07-14
**Status:** Godkjent design – klar for implementeringsplan
**Mål:** Deploye dashboardet til Azure Static Web Apps (SWA) på NEAS' eget domene, med hele backenden portet fra Express til Azure Functions.

---

## 1. Bakgrunn og mål

Appen består i dag av en Vite/React-frontend og en stateful Express-backend (`server/proxy.js` + `server/businessCentral/`) som kjører lokalt. Backenden gjør fire ting: proxyer Atlassian-API (skjuler kredensialer, unngår CORS), håndterer OAuth mot Atlassian med server-session, kaller Anthropic for AI-funksjoner, og integrerer mot Business Central (BC).

Målet er produksjonsdrift på SWA på eget domene. SWA serverer den bygde SPA-en og kjører API bak `/api`. Fordi SWA-plattformen har en **hard 45-sekunders grense på alle API-kall bak `/api`** (se §3), kan ikke de lengste AI-kallene ligge der. Designet deler derfor backenden i to kjøremiljøer.

## 2. Beslutninger (oppsummert)

| Tema | Beslutning | Begrunnelse |
|---|---|---|
| Backend-plattform | Azure Functions (managed) under SWA `/api` | Valgt av bruker; «native» SWA-vei |
| Auth-modell | OAuth per bruker mot Atlassian | Valgt av bruker |
| Session uten server-state | Kryptert, stateless cookie (AES-256-GCM) | Functions er stateless; unngår ekstra lagringsressurs ved 1–10 brukere |
| Omfang | Alt med i første runde, inkludert Business Central | Valgt av bruker |
| Skala | 1–10 samtidige brukere | Valgt av bruker; rettferdiggjør cookie fremfor delt lager |
| AI-utførelse | **Egne AI-endepunkter på en frittstående Azure Function App** (utenfor `/api`), kalt direkte fra frontend | 45s-taket gjelder alt bak `/api`; frittstående Function App gir 230s |
| SWA-plan | **Free** | AI-valget krever ikke Standard; eget domene + App Insights + managed functions finnes på Free |
| Secrets | App settings i klartekst (ingen managed identity / Key Vault) | Managed functions støtter ikke MI/KV; bevisst akseptert ved denne skalaen |
| Pakkeverktøy | **npm** (ikke pnpm i denne migreringen) | Oryx auto-detekterer ikke `pnpm-lock.yaml`; pnpm-symlinker overlever ikke Functions Zip Deploy. pnpm kan vurderes som egen, isolert endring etter migreringen |

## 3. Verifiserte plattformbegrensninger (kilder i §14)

- **45s gjelder alt bak `/api`:** apis-overview, «API constraints»: *«The following constraints apply to all API backends … The maximum duration of each API request 45 seconds.»* Dette gjelder både managed functions og bring-your-own/linked backend. En linked backend er derfor **ingen utvei** mot timeout.
- **Managed functions støtter kun HTTP-triggere.** Ingen timer/kø/Durable Functions. En asynkron jobb-modell (start → poll) er derfor ikke mulig innenfor managed functions uten en separat Function App + status-lager.
- **Managed functions støtter ikke managed identity eller Key Vault-referanser** (apis-functions, tabell: begge «✕»). Secrets må ligge som app settings i klartekst.
- **Logging krever Application Insights:** apis-functions: *«Logs are only available if you add Application Insights.»*
- **Frittstående Azure Functions HTTP-tak: 230 sekunder** (Azure Load Balancer idle-timeout, 502 ved overskridelse). Rikelig for AI-kall på 20–60s.
- **Node-runtime pinnes** via `platform.apiRuntime` i `staticwebapp.config.json` (f.eks. `node:20`).

## 4. Overordnet arkitektur

Tre distribuerbare enheter, alle fra samme repo:

1. **SPA (statisk):** Vite-bygg (`dist/`) servert av SWA på eget domene.
2. **SWA managed functions (`/api`):** Atlassian-proxy, OAuth/auth og Business Central. Cookie-basert, raske kall godt under 45s.
3. **AI Function App (frittstående, eget origin):** Alle AI-endepunkter. Consumption-plan, 230s-tak, kalt direkte fra frontend med CORS.

```
                       NEAS-domene (Azure Static Web Apps, Free)
   Bruker ──▶  SPA (dist/)  ──/api/*──▶  Managed Functions
                   │                       ├─ atlassian/proxy, test-connection
                   │                       ├─ auth/* (OAuth, cookie-session)
                   │                       └─ bc/* (Business Central)
                   │
                   └──(direkte, CORS)──▶  AI Function App (*.azurewebsites.net)
                                           └─ ai/* (Anthropic) — 230s-tak
```

**Begrunnelse for todelingen:** Managed functions gir sømløs same-origin-ruting og tilgang til session-cookien, men er bundet av 45s. AI-generering (rapporter, dokumenter, referater) kan overstige dette. AI-endepunktene trenger *ikke* Atlassian-sesjonen — de tar data i request-body og bruker en server-side Anthropic-nøkkel — så de kan trygt flyttes til et eget origin uten cookie.

## 5. Auth og session (managed functions)

Erstatter `express-session` + `session-file-store` med en **kryptert, stateless cookie**.

### Flyt
1. Bruker klikker logg inn → `GET /api/auth/atlassian`. Funksjonen genererer `state`, legger det i en kortlevd kryptert `oauth_state`-cookie, og redirecter til Atlassian authorize.
2. Atlassian redirecter til `OAUTH_REDIRECT_URI` = `https://<domene>/api/auth/callback`. Funksjonen verifiserer `state` mot cookien, bytter `code` mot tokens, henter `accessible-resources` (cloudId-er).
3. Funksjonen krypterer `{ accessToken, refreshToken, tokenExpiresAt, cloudId, cloudName, availableClouds }` med AES-256-GCM (nøkkel avledet fra `SESSION_SECRET`) og setter det som `httpOnly`, `Secure`, `SameSite=Lax`-cookie. Redirecter til `/`.
4. Hvert Atlassian-kall dekrypterer cookien via en delt `resolveAuth()`-hjelper. Gyldig access-token → bruk direkte. Utløpt → forny mot Atlassian og **sett cookien på nytt** i svaret.

### Avveininger
- **Roterende refresh-tokens (H, akseptert):** Atlassian ugyldiggjør forrige refresh-token ved fornyelse. Åpner en bruker flere faner nøyaktig når access-token utløper, kan én fornyelse «vinne» og de andre få en engangs re-login. Dempes ved å fornye litt før utløp og returnere `reauthRequired` ved feil (som i dag). Akseptabelt ved 1–10 brukere.
- **Cookie-størrelse (H.1-mitigering):** Access-token (JWT) + refresh + `availableClouds` må holdes under ~4 KB. Blir cookien for stor, droppes `availableClouds` fra cookien og hentes på nytt ved behov.

### Managed-function-endepunkter for auth
`auth/atlassian`, `auth/callback`, `auth/me`, `auth/select-cloud`, `auth/logout`, **`auth/apikey`** (beholdes som midlertidig reserve til OAuth er verifisert i prod — se §8d). `auth/set-anthropic-key` fjernes (se §8c).

I den stateless modellen legges apikey-kredensialene (`email`, `apiToken`, `jiraBaseUrl`, `confluenceBaseUrl`) i den **samme** krypterte cookien som OAuth-sesjonen. `resolveAuth()` håndterer begge moduser: OAuth → `Bearer`-token + cloudId-ruting, apikey → `Basic`-auth (`email:apiToken`).

## 6. Managed functions: Atlassian + Business Central

### Mappestruktur (Azure Functions Node v4-programmeringsmodell)
```
api/
  host.json                 extensionBundle, logging
  package.json              "main", @azure/functions ^4, Node 20 (ingen express/session)
  src/
    functions/
      atlassianProxy.js      route: atlassian/proxy   (app.http, alle metoder)
      testConnection.js      route: test-connection
      authAtlassian.js       route: auth/atlassian
      authCallback.js        route: auth/callback
      authMe.js              route: auth/me
      authSelectCloud.js     route: auth/select-cloud
      authLogout.js          route: auth/logout
      bc.js                  route: bc/{resource}
    lib/
      session.js             AES-256-GCM krypter/dekrypter, bygg Set-Cookie
      atlassianAuth.js       OAuth start/callback/refresh/ensureFreshToken/resolveAuth
      bc/                    portede tjenester (items, locations, purchase-orders,
                             item-consumption, item-ledger-entries) — logikk uendret
```

- **Node-runtime pinnes eksplisitt:** `platform.apiRuntime: "node:20"` i `staticwebapp.config.json`, i tillegg til v4-modellens krav (`main`-felt i `api/package.json`, `@azure/functions` v4, `host.json` med extensionBundle). *Merk dokumentavvik:* eldre apis-functions-side kaller Node 20 «(preview)», mens runtime-tabellen i configuration lister `node:20` som støttet/GA. Vi bruker `node:20`; verifiseres ved første deploy.
- **Business Central:** BC bruker app-nivå client-credentials mot Entra ID med per-instans token-cache — allerede stateless. Kun `index.js` (Express Router) erstattes av `bc.js`. Tjenestefilene er ren `fetch` og portes tilnærmet uendret. Kjent datatilgangsbegrensning (BC-permission på `projects`) er urelatert til migreringen.

## 7. AI Function App (frittstående)

- **Ressurs:** egen Azure Function App, Consumption-plan, Node 20, eget origin (`https://<ai-app>.azurewebsites.net`, eventuelt subdomene `ai.<domene>`).
- **Endepunkter (portes uendret fra `server/proxy.js`):** `ai/digest`, `ai/timeline-report`, `ai/rewrite-meeting`, `ai/project-documents`, `ai/suggest-subtasks`, `ai/classify-issue`, `ai/rewrite-description`.
- **Timeout:** 230s-tak fjerner 45s-problemet for alle AI-kall, også framtidige, rikere utdata. (`project-documents` på 4000 tokens ligger komfortabelt under 230s; oppdeling i parallelle per-dokument-kall er en *valgfri* UX-forbedring, ikke nødvendig for korrekthet — utenfor scope her.)
- **Nøkkel:** server-side `ANTHROPIC_API_KEY` som app setting. Klient-sendt nøkkel fjernes (se §8).
- **CORS:** Function App-ens innebygde CORS-innstilling tillater kun SWA-domenet som origin. AI-kallene bruker ikke cookies/credentials, så CORS blir en enkel origin-allowlist; preflight (OPTIONS) håndteres av Functions-verten.
- **Beskyttelse (H, akseptert forbehold):** function-key + CORS-allowlist. Nøkkelen ligger i frontend-bundelen og stopper tilfeldig misbruk, ikke en målrettet insider. Dempes med Anthropic-forbrukstak/varsling og `max_tokens`-cap. Tilstrekkelig for et internt verktøy; skrives eksplisitt i risikologgen.

## 8. Frontend-endringer

### a) Auth-ruter flyttes til `/api/auth/*`
Managed functions svarer kun under `/api`. Følgende `/auth/*`-kall oppdateres:

| Fil | Fra → til |
|---|---|
| `src/pages/Login/Login.tsx:18` | `/auth/atlassian` → `/api/auth/atlassian` |
| `src/services/api.ts:58,71` | `/auth/me`, `/auth/logout` → `/api/auth/...` |
| `src/store/authStore.ts:76` | `/auth/select-cloud` → `/api/auth/select-cloud` |

`/api/atlassian/proxy` og `/api/bc/*` ligger allerede riktig. Den React-baserte ruten `/auth/callback` i `App.tsx` blir stående ubrukt (callbacken er en Function som redirecter til `/`).

### b) AI-kall peker mot AI Function App
AI-kallene bruker i dag hardkodet `http://localhost:3001/api/ai/*` via rå `fetch` (utenom axios-interceptoren) og virker derfor ikke i produksjon uansett. De endres til `${VITE_AI_API_BASE}/api/ai/*` med `x-functions-key`-header. Berørte steder:

| Fil | Endepunkt |
|---|---|
| `src/pages/ProjectWizard/ProjectWizard.tsx:504,585` | `suggest-subtasks`, `project-documents` |
| `src/pages/NySak/NySak.tsx:336,369` | `classify-issue`, `rewrite-description` |
| `src/pages/Digest/Digest.tsx:191` | `digest` |
| `src/pages/Confluence/MeetingNoteEditor.tsx:493` | `rewrite-meeting` |
| `src/pages/Board/TimelineReport.tsx:72` | `timeline-report` |

`VITE_AI_API_BASE` (og function-key) settes som build-time miljøvariabel.

### c) Anthropic-nøkkel blir server-side (opprydding)
Med delt server-side `ANTHROPIC_API_KEY` fjernes klient-nøkkel-flyten: `getAnthropicKey()`-gating i komponentene, Anthropic-feltene i `Login.tsx`/`Settings.tsx`, og endepunktet `/auth/set-anthropic-key`. Dette er uavhengig av apikey-innloggingsmodus (§8d). Bekreftes under planlegging.

### d) API-nøkkel-innlogging beholdes som midlertidig reserve
OAuth per bruker er ikke ferdig verifisert i produksjon ennå. Til det er bekreftet, beholdes `auth/apikey`-modus — både endepunktet (§5) og innloggings-UI-en i `Login.tsx`/`Settings.tsx` — som reserve-innlogging. Den fjernes når OAuth er bekreftet å fungere i prod (se §15). Merk: dette betyr at et personlig/delt Atlassian-token lagres i den krypterte cookien på lik linje med OAuth-tokens; akseptabelt som midlertidig tilstand ved denne skalaen.

## 9. staticwebapp.config.json
```json
{
  "platform": { "apiRuntime": "node:20" },
  "navigationFallback": { "rewrite": "/index.html", "exclude": ["/assets/*"] }
}
```
SPA-fallback sikrer klientruting; `/api/*` proxyes til managed functions og omfattes ikke av fallback.

## 10. Lokalt utviklingsløp

`npm start` (concurrently proxy + vite) erstattes:
- **Managed functions + SPA:** SWA CLI (`swa start`) foran en kjørende `func`-instans for `api/`, som emulerer `/api`-ruting likt Azure.
- **AI Function App:** en andre `func`-instans på egen port; `VITE_AI_API_BASE` peker dit lokalt.

**Advarsel (fra bruker):** `swa start` håndhever **ikke** 45s-taket. Lokal kjøring er derfor **ikke** bevis på at et kall holder seg innenfor plattformgrensen. Timing-antakelser verifiseres i Azure, ikke lokalt. (Dette er også hovedgrunnen til at AI ble flyttet ut av `/api`.)

## 11. Observability

Application Insights slås på fra dag én på **begge** kjøremiljøer (SWA managed functions og AI Function App) — uten det gir managed functions ingen brukbare logger. Sett `APPLICATIONINSIGHTS_CONNECTION_STRING` som app setting (ikke via Key Vault, jf. §3).

## 12. Secrets / app settings

Ingen i repoet; settes som app settings i klartekst (bevisst valg — managed functions støtter ikke MI/KV).

- **SWA (managed functions):** `SESSION_SECRET` (32 byte), `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` (= `https://<domene>/api/auth/callback`), `FRONTEND_URL` (= domenerot), `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `APPLICATIONINSIGHTS_CONNECTION_STRING`.
- **AI Function App:** `ANTHROPIC_API_KEY`, CORS-allowlist (SWA-domenet), `APPLICATIONINSIGHTS_CONNECTION_STRING`.
- **Reserverte prefikser:** unngå app-setting-navn med SWA-reserverte prefikser (`WEBSITE_`, `FUNCTIONS_`, `IDENTITY_`, `SCM_`, m.fl.).

## 13. CI/CD, domene og OAuth-registrering

- **SPA + managed functions:** GitHub Actions `Azure/static-web-apps-deploy` med `app_location: "/"`, `api_location: "api"`, `output_location: "dist"`.
- **AI Function App:** egen deploy-jobb (Functions-deploy-action eller `func azure functionapp publish`).
- **Domene:** legges til i SWA og valideres via DNS (CNAME/TXT); gratis managed SSL. Free tillater inntil 2 egendefinerte domener.
- **Atlassian-app:** registrer produksjons-callback `https://<domene>/api/auth/callback` i utviklerkonsollen; sett `OAUTH_REDIRECT_URI` og `FRONTEND_URL` til domenet.

## 14. SWA-plan: Free (begrunnet)

AI-valget (frittstående Function App, uavhengig av SWA-plan) og resten av arkitekturen (managed functions finnes på alle planer, eget domene og App Insights finnes på Free) krever ikke Standard. Free velges. Konsekvens: **ingen SLA**, lavere kvoter (bl.a. båndbredde, app-størrelse, staging-miljøer) og ingen managed identity/Key Vault (som vi uansett ikke bruker). Kan oppgraderes til Standard senere uten arkitekturendring dersom SLA/headroom trengs.

## 15. Risikoer og åpne punkter

1. **AI-endepunkt-sikkerhet:** function-key i frontend er ikke en ekte hemmelighet. Demp med Anthropic-forbrukstak/varsling og `max_tokens`-cap; vurder sterkere beskyttelse kun hvis bruken utvides utover internt team.
2. **Cookie-størrelse:** overvåk at session-cookien holder seg < ~4 KB; fallback er å droppe `availableClouds` fra cookien.
3. **Node 20-status:** dokumentavvik (preview vs. GA). Verifiser `node:20` ved første deploy; `node:22` er alternativ.
4. **Roterende refresh-tokens:** akseptert engangs re-login i sjeldne fler-fane-race. Revurderes kun ved skala-økning (da: delt lager med låsing).
5. **Ingen lokal håndheving av 45s:** verifiser managed-function-responstider i Azure, ikke lokalt.
6. **Midlertidig apikey-reserve:** API-nøkkel-innlogging beholdes bevisst til OAuth er verifisert i prod, og fjernes deretter. Ikke behandle den som permanent — den lagrer et personlig/delt Atlassian-token i cookien. Definer et konkret «OAuth verifisert»-kriterium under planleggingen som utløser fjerningen.

## 16. Ikke-mål / YAGNI

- Ingen delt session-lagring (Table/Redis) — cookie holder ved 1–10 brukere.
- Ingen asynkron jobb-/pollemodell for AI — 230s på AI Function App dekker behovet.
- Ingen oppdeling av `project-documents` i migreringen (valgfri senere UX-forbedring).
- Ingen managed identity / Key Vault — bevisst utelatt.
- Ingen pnpm i denne migreringen — Oryx og Functions-deploy motarbeider pnpm; npm beholdes. Multi-pakke-ergonomi kan evt. dekkes av npm workspaces (avgjøres i planfasen). pnpm er en mulig senere, isolert endring.

---

### Kilder
- Overview of API support in Azure Static Web Apps — https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview
- API support with Azure Functions (managed vs. bring-your-own, triggere, MI/KV, logging) — https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions
- API support with Azure App Service (linked backend) — https://learn.microsoft.com/en-us/azure/static-web-apps/apis-app-service
- Configure Azure Static Web Apps (apiRuntime, navigationFallback) — https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
- Azure Functions HTTP 230s-grense (Microsoft Q&A) — https://learn.microsoft.com/en-us/answers/questions/1332955/
- Oryx pnpm-støtte (åpne feature-requests) — https://github.com/microsoft/Oryx/issues/1150 og https://github.com/microsoft/Oryx/issues/2340
- pnpm + Azure Functions symlink/deploy-problem — https://github.com/Azure/functions-action/discussions/172 og https://github.com/pnpm/pnpm/issues/6259
