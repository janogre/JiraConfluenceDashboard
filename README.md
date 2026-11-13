# Jira & Confluence Dashboard

Et React-basert prosjektstyringsverktøy som integrerer Jira og Confluence i ett grensesnitt. Bygget for intern bruk med NEAS Energi Telekom-profil.

---

## Funksjoner

### Dashboard
Samlet oversikt over prosjekter, nylige Jira-saker, aktivitetsgraf og teamarbeidsbelastning.

### Prosjekter & Tavle (Board)
- Bla gjennom alle Jira-prosjekter og -saker
- Filtrering, sortering og detaljvisning
- Sprint-visning
- Tidslinje med blokkerings-visualisering mellom avhengige saker
- AI-generert tidslinjerapport (Claude Sonnet 4.6)

### Confluence
- Bla gjennom spaces og sider
- Søk med CQL på tvers av spaces
- Møtenotat-editor med AI-omskriving til strukturert referat

### Mine oppgaver (Todos)
- Privat gjøremålsliste lagret lokalt
- Kobling mot Jira-saker og Kanban-kort
- Prioritet og frist per oppgave

### Risikoanalyse
Visuell risikoregister koblet mot Jira-saker.

### Digest
AI-generert daglig oppsummering av Jira-aktivitet.

### Teamkalender
Oversikt over frister, sprinter og milepæler på tvers av prosjekter.

### Mine målinger (My Metrics)
Personlig statistikk for løste saker, arbeidsbelastning og produktivitet.

### Prosjektwizard
Veiledet oppretting av oppgave eller prosjekt i to varianter:

**Enkel oppgave (Type 1) — 4 steg**
1. Velg type
2. Fyll inn oppgavenavn, ansvarlig, Jira-prosjekt og frist
3. AI foreslår underoppgaver (redigerbar liste)
4. Oppretter Oppgave + Underoppgaver direkte i Jira — klikkbare lenker i suksess-boks

**Større prosjekt (Type 2) — 6 steg**
1. Velg type
2. Fyll inn prosjektinfo med Jira-prosjekt og Confluence-space
3. Velg dokumenttyper (Prosjektmandat, Behovsanalyse, Risikoanalyse m.fl.)
4. Tilleggsinformasjon til AI (formål, mål, interessenter, budsjett)
5. AI foreslår Jira-oppgaver under Oppgavesamlingen (redigerbar liste)
6. Publiserer alt med ett klikk:
   - Confluence-prosjektmappe med alle dokumenter
   - Jira Oppgavesamling med tilhørende Oppgaver
   - Remote link fra Jira-saken til Confluence-mappen

### Innstillinger
Konfigurasjon av Jira-URL, Confluence-URL og API-token for Atlassian apikey-innlogging.

---

## Teknisk stack

| Teknologi | Bruk |
|-----------|------|
| React 19 + TypeScript | Frontend |
| Vite | Bundler / dev-server (port 5173) |
| react-router-dom | Routing |
| TanStack Query | Server-state (Jira/Confluence API) |
| Zustand | Lokal state (Kanban, Todos) med localStorage-persistering |
| @hello-pangea/dnd | Drag-and-drop (Kanban) |
| Axios | HTTP-klient mot managed functions og AI Function App |
| CSS Modules | Styling |
| Azure Functions (`api/`) | Managed functions under samme domene (`/api/*`) — Atlassian-proxy, auth (OAuth/apikey, kryptert cookie-session), Business Central |
| Azure Functions (`ai-api/`) | Frittstående AI Function App (`/api/ai/*`) — AI-endepunkter med server-side Anthropic-nøkkel |
| Claude Sonnet 4.6 | AI-funksjoner (dokumentgenerering, møtereferat, forslag) |

---

## Kom i gang

### Krav
- Node.js 20 eller 22 for lokal `swa start` (SWA CLI sine innebygde Core Tools avviser Node 24) — `api/`- og `ai-api/`-funksjonene kan selv kjøre videre på Node 22/24
- [Azure Static Web Apps CLI](https://www.npmjs.com/package/@azure/static-web-apps-cli) (`npm i -g @azure/static-web-apps-cli`)
- Azure Functions Core Tools v4 (`func --version` → 4.x)
- Jira Cloud- og/eller Confluence Cloud-konto med API-token
- Anthropic API-nøkkel (settes server-side som `ANTHROPIC_API_KEY` i AI Function App-en, se Konfigurasjon)

### Installasjon

```bash
npm install
```

### Utvikling

```bash
# Start AI-funksjonene (ai-api, port 7072) + SWA CLI
# (Vite dev-server + managed functions i api/, samlet på http://localhost:4280)
npm start

# Kun Vite dev-server, uten backend
npm run dev
```

> Lokal `swa start` (kjøres av `npm start`) krever Node 20 eller 22 — SWA CLI sine innebygde Core Tools avviser Node 24.

### Produksjonsbygg

```bash
npm run build
npm run preview
```

### Lint

```bash
npm run lint
```

---

## Konfigurasjon

Åpne appen og gå til **Innstillinger**. Fyll inn (apikey-innlogging mot Atlassian):

| Felt | Eksempel |
|------|---------|
| Jira base URL | `https://dinorg.atlassian.net` |
| Confluence base URL | `https://dinorg.atlassian.net` |
| Brukernavn | din Atlassian e-postadresse |
| API-token | fra [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |

Innstillingene lagres i en kryptert, stateless cookie-session (satt av `api/`) og i nettleserens localStorage for URL-oppslag.

AI-funksjonene krever ingen nøkkel fra brukeren i grensesnittet — `ANTHROPIC_API_KEY` settes server-side som app-setting på AI Function App-en (`ai-api/`). Frontend trenger i tillegg build-time miljøvariablene `VITE_AI_API_BASE` (AI-appens URL) og `VITE_AI_FUNCTION_KEY` (function-key), se `.env.example`.

---

## Arkitektur

```
Browser (localhost:5173, via SWA CLI på :4280 i lokal dev)
    ↓ Axios + X-Target-URL-header → /api/*
Managed Azure Functions (api/, samme domene i prod)
    ↓
Atlassian Cloud APIs

Browser
    ↓ fetch + x-functions-key → ${VITE_AI_API_BASE}/api/ai/*
AI Function App (ai-api/, eget origin)
    ↓
Anthropic API
```

```
src/
├── components/       # Delte UI-komponenter (Layout, Button, LoadingSpinner m.fl.)
├── pages/            # En mappe per side/modul
│   ├── Dashboard/
│   ├── Board/        # Tavle, Sprint, Tidslinje, TimelineReport
│   ├── Confluence/   # Sidevisning, MeetingNoteEditor
│   ├── Todos/
│   ├── Risk/
│   ├── Digest/
│   ├── Calendar/
│   ├── MyMetrics/
│   ├── ProjectWizard/
│   └── Settings/
├── services/         # API-lag: jiraService.ts, confluenceService.ts, api.ts (Atlassian/auth mot api/), aiApi.ts (mot ai-api/)
├── store/            # Zustand-stores: kanbanStore.ts, todoStore.ts
├── types/            # Delte TypeScript-typer (index.ts)
└── index.css         # Globale CSS-variabler (NEAS-tema)

api/                   # Managed Azure Functions (SWA /api)
└── src/functions/     # Atlassian-proxy, auth (OAuth/apikey, kryptert cookie-session), Business Central

ai-api/                # Frittstående AI Function App
└── src/functions/     # AI-endepunkter (server-side ANTHROPIC_API_KEY, x-functions-key)
```

Alle Atlassian API-kall rutes gjennom de managed Azure Functions-ene i `api/` (samme domene, `/api/atlassian/proxy`) via en `X-Target-URL`-header, for å unngå CORS-problemer og holde innloggingen i en kryptert, stateless cookie-session.

### AI-endepunkter (ai-api/)

Endepunktene betjenes på et eget origin (`${VITE_AI_API_BASE}/api/ai/*`) og krever en `x-functions-key`-header. Anthropic-nøkkelen er satt server-side som `ANTHROPIC_API_KEY` i AI Function App-en — ingen nøkkel sendes fra klienten.

| Endepunkt | Beskrivelse |
|-----------|-------------|
| `POST /api/ai/digest` | Daglig oppsummering av Jira-aktivitet |
| `POST /api/ai/timeline-report` | Prosjektstatusrapport fra tidslinje |
| `POST /api/ai/rewrite-meeting` | Omskriving av møtenotater |
| `POST /api/ai/project-documents` | Generering av prosjektdokumenter |
| `POST /api/ai/suggest-subtasks` | Forslag til underoppgaver / Jira-oppgaver |

---

## Datalagring

| Data | Lagringssted |
|------|-------------|
| API-konfigurasjon | localStorage (`jira-confluence-config`) |
| Kanban-tavle | localStorage (`kanban-storage`) |
| Privat todo-liste | localStorage (`todo-storage`) |

---

## Lisens

Privat prosjekt – alle rettigheter forbeholdt.
