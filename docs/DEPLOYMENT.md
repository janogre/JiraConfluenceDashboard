# Deploy til Azure — sjekkliste

Runbook for å deploye dette dashboardet til Azure Static Web Apps (SWA) + en frittstående AI Function App. Følg fasene i rekkefølge — **rekkefølgen betyr noe** (AI-appen må finnes før SPA-en bygges, fordi AI-appens URL bakes inn i klient-bundelen).

**Arkitektur (to Azure-ressurser):**
- **Static Web App** — serverer SPA-en (`dist/`) og managed functions under `/api/*` (fra `api/`): Atlassian-proxy, OAuth/auth, Business Central.
- **Frittstående Function App** — AI-endepunktene under `/api/ai/*` (fra `ai-api/`), på eget origin med server-side Anthropic-nøkkel.

**Repo/branch:** `janogre/JiraConfluenceDashboard`, gren `master`.

> ⚠️ **Sikkerhetskritisk** (markert med 🔒 under): CORS-allowlisten på AI-appen er den reelle sikkerhetsperimeteren siden function-key ligger i klient-bundelen; og env-apikey-fallback-variablene må ALDRI settes i prod.

---

## Fase 0 — Forberedelser

- [ ] Bestem **domenet** appen skal kjøre på (egendefinert NEAS-domene, eller SWA-standarden `https://<navn>.azurestaticapps.net`). Flere verdier under avhenger av dette — bruk SWA-standarddomenet først hvis du skal legge til egendefinert domene senere, og oppdater `OAUTH_REDIRECT_URI`/`FRONTEND_URL` etterpå.
- [ ] Ha klart: Atlassian OAuth `client_id`/`client_secret` (fra Atlassian Developer Console), BC-kredensialer (Entra ID app: tenant/client/secret + company-id + environment), og en Anthropic API-nøkkel.
- [ ] Velg **én region** og bruk den for begge ressursene.

---

## Fase 1 — Frittstående AI Function App (opprett FØRST)

Denne må finnes før SWA-bygget, fordi SPA-en trenger AI-appens URL + function-key ved build-time.

- [ ] Opprett en **Function App**:
  - Runtime stack: **Node.js 22**
  - Plan: **Consumption** (serverless), Linux
  - Navn: f.eks. `neas-jcd-ai` → gir origin `https://neas-jcd-ai.azurewebsites.net`
- [ ] App settings (Configuration → Application settings):
  - `ANTHROPIC_API_KEY` = din Anthropic-nøkkel (modell `claude-sonnet-4-6` brukes)
  - `APPLICATIONINSIGHTS_CONNECTION_STRING` = fra en Application Insights-ressurs (slå på App Insights fra dag én — managed/standalone functions gir ellers ingen brukbare logger)
- [ ] 🔒 **CORS** (Function App → CORS): fjern `*`, legg til **kun** SWA-domenet som «Allowed Origin» (`https://<domene>`). La «Enable Access-Control-Allow-Credentials» stå **av** (AI-kallene bruker ikke cookies).
- [ ] Hent verdiene du trenger til GitHub-secrets (Fase 5):
  - **Function-key:** Function App → App keys (eller en spesifikk funksjon → Function Keys) → kopier en nøkkel → `VITE_AI_FUNCTION_KEY`
  - **URL:** `https://<navn>.azurewebsites.net` → `VITE_AI_API_BASE`
  - **Publish profile:** «Get publish profile» (last ned) → `AI_FUNCTION_APP_PUBLISH_PROFILE`
  - **App-navn:** → `AI_FUNCTION_APP_NAME`

> Første deploy av selve koden skjer via CI (Fase 6). Ressursen kan stå «tom» inntil workflowen kjører.

---

## Fase 2 — Static Web App (Free)

- [ ] Opprett en **Static Web App**, plan **Free**, samme region.
- [ ] **Deployment source — viktig valg:** velg **«Other»** (IKKE la portalen koble til GitHub automatisk).
  - Grunn: portal-GitHub-koblingen genererer sin *egen* workflow-fil i repoet, som ville duplisere/konflikte med den vi allerede har (`.github/workflows/azure-swa.yml`) — og vår injiserer `VITE_*`-byggvariablene, noe portalens standard ikke gjør.
  - Hvis du likevel kobler GitHub: **slett** den auto-genererte `.github/workflows/azure-static-web-apps-*.yml` og behold vår `azure-swa.yml`.
- [ ] Hent **deployment token:** SWA → «Manage deployment token» → kopier → GitHub-secret `AZURE_STATIC_WEB_APPS_API_TOKEN` (Fase 5).
- [ ] Konfig som allerede ligger i repoet (til info — trenger ingen handling):
  - `staticwebapp.config.json`: `platform.apiRuntime: "node:22"` + SPA-fallback
  - Build-kontrakt i workflowen: `app_location: "/"`, `api_location: "api"`, `output_location: "dist"`
- [ ] Slå på **Application Insights** for SWA-en.

---

## Fase 3 — App settings for managed functions (på SWA-ressursen)

SWA → Configuration → Application settings. Disse gjelder managed functions i `api/` (auth/proxy/BC):

- [ ] `SESSION_SECRET` = tilfeldig streng **≥ 32 tegn** (nøkkel for cookie-krypteringen)
- [ ] `ATLASSIAN_CLIENT_ID`
- [ ] `ATLASSIAN_CLIENT_SECRET`
- [ ] `OAUTH_REDIRECT_URI` = `https://<domene>/api/auth/callback`
- [ ] `FRONTEND_URL` = `https://<domene>` (domenerot)
- [ ] `BC_TENANT_ID`
- [ ] `BC_CLIENT_ID`
- [ ] `BC_CLIENT_SECRET`
- [ ] `BC_COMPANY_ID`  ← **påkrevd** (ellers 500 på BC-kall)
- [ ] `BC_ENVIRONMENT`  ← **påkrevd** (f.eks. `Production`)
- [ ] `BC_ITEM_GROUPS` (valgfri, default `KOM,DRIFT`)
- [ ] `APPLICATIONINSIGHTS_CONNECTION_STRING`
- [ ] 🔒 **Sett ALDRI** `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` eller `JIRA_BASE_URL` her. De aktiverer en delt-token env-apikey-fallback som ville gjort `/api/atlassian/proxy` til en åpen, uautentisert proxy. Fallbacken er gated bak `ALLOW_ENV_APIKEY` og skal forbli av i prod — la alle fire være usatt.

---

## Fase 4 — Atlassian OAuth-registrering

- [ ] I Atlassian Developer Console, på OAuth 2.0 (3LO)-appen: legg til callback-URL **`https://<domene>/api/auth/callback`** (samme verdi som `OAUTH_REDIRECT_URI`).
- [ ] Bekreft at scopes matcher appen (Jira read/write, Confluence read/write, `offline_access`).
- [ ] (Atlassian **apikey-innlogging** er beholdt som reserve og trenger ingen registrering — brukeren oppgir e-post + API-token i skjemaet.)

---

## Fase 5 — GitHub-secrets

Repo → Settings → Secrets and variables → Actions → New repository secret. Disse konsumeres av workflowene i `.github/workflows/`:

- [ ] `AZURE_STATIC_WEB_APPS_API_TOKEN` (fra Fase 2)
- [ ] `VITE_AI_API_BASE` = `https://<ai-app>.azurewebsites.net` (fra Fase 1)
- [ ] `VITE_AI_FUNCTION_KEY` = function-key (fra Fase 1)
- [ ] `AI_FUNCTION_APP_NAME` (fra Fase 1)
- [ ] `AI_FUNCTION_APP_PUBLISH_PROFILE` (fra Fase 1)

> `VITE_*` bakes inn i klient-bundelen ved bygg — derfor må de være satt **før** SWA-workflowen kjører.

---

## Fase 6 — Deploy (merge → CI)

- [ ] Merge PR-en (eller push) til **`master`**. Da fyrer:
  - `azure-swa.yml` → bygger SPA + managed functions og deployer til SWA.
  - `ai-function-app.yml` → deployer `ai-api/` til Function App-en (kjører kun når `ai-api/**` endres; kjør den manuelt via «Run workflow» første gang hvis nødvendig, eller gjør en liten `ai-api/`-endring).
- [ ] Følg kjøringen i repoets **Actions**-fane; rett evt. feil (vanligst: manglende/feil secret).

> Hvis frontend-bygget feiler på Node-versjon i SWA/Oryx, legg til et `engines`-felt i `package.json` eller et `setup-node`-steg — men standardoppsettet bygger normalt fint.

---

## Fase 7 — Egendefinert domene (valgfritt)

- [ ] SWA → Custom domains → legg til NEAS-domenet, valider via DNS (CNAME/TXT). Gratis managed SSL.
- [ ] Hvis du satte `OAUTH_REDIRECT_URI`/`FRONTEND_URL` til SWA-standarddomenet i Fase 3: **oppdater dem til det egendefinerte domenet**, og oppdater callback-URL i Atlassian (Fase 4) tilsvarende.
- [ ] Oppdater 🔒 CORS-origin på AI-appen (Fase 1) til det egendefinerte domenet.

---

## Fase 8 — Verifiser i Azure (ikke lokalt)

Åpne appen på prod-domenet og bekreft, i nettleseren:

- [ ] **Innlogging** — OAuth-flyt (eller apikey-login) fullfører og `/api/auth/me` returnerer `authenticated: true`.
- [ ] **Jira/Confluence** — board/sprint/tidslinje og Confluence-visning henter data via `/api/atlassian/proxy`.
- [ ] **Business Central** — Lager-fanen svarer (ingen 500 → `BC_COMPANY_ID`/`BC_ENVIRONMENT` er satt).
- [ ] 🔒 **AI + CORS-preflight** — kjør et AI-kall (f.eks. Digest) **fra nettleseren på prod-domenet** (ikke bare curl). Custom-headeren `x-functions-key` utløser en CORS-preflight (OPTIONS) mot AI-appen; bekreft i nettverksfanen at preflight lykkes og at selve kallet returnerer `200`. Feiler den, sjekk CORS-allowlisten på AI-appen.
- [ ] **Logger** — bekreft at Application Insights får telemetri fra begge apper.

---

## Feilsøkingshint

| Symptom | Sannsynlig årsak |
|---|---|
| AI-kall gir CORS-feil i nettleseren | AI-appens CORS-origin mangler prod-domenet (Fase 1/7) |
| AI-kall gir `500 Server mangler ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` ikke satt på AI-appen |
| BC-kall gir `500` | `BC_COMPANY_ID`/`BC_ENVIRONMENT` mangler på SWA |
| OAuth redirecter tilbake med `?auth_error=...` | `OAUTH_REDIRECT_URI`/callback matcher ikke domenet, eller feil client-secret |
| `/api/auth/me` alltid `authenticated:false` etter login | `SESSION_SECRET` ikke satt, eller domene-mismatch på cookien |
| SWA-workflow kjører ikke | Trigger-gren er `master` (rettet); sjekk at `AZURE_STATIC_WEB_APPS_API_TOKEN` finnes |

---

*Denne runbooken hører til migreringen dokumentert i `docs/superpowers/specs/2026-07-14-azure-swa-functions-migrering-design.md` og planene i `docs/superpowers/plans/`.*
