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
Konfigurasjon av Jira-URL, Confluence-URL, API-token og Anthropic API-nøkkel.

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
| Axios | HTTP-klient mot proxy |
| CSS Modules | Styling |
| Express (proxy) | CORS-omgåelse mot Atlassian API (port 3001) |
| Claude Sonnet 4.6 | AI-funksjoner (dokumentgenerering, møtereferat, forslag) |

---

## Kom i gang

### Krav
- Node.js 18+
- Jira Cloud- og/eller Confluence Cloud-konto med API-token
- Anthropic API-nøkkel (for AI-funksjoner)

### Installasjon

```bash
npm install
```

### Utvikling

```bash
# Start både proxy-server (port 3001) og Vite dev-server (port 5173)
npm start

# Kun Vite dev-server
npm run dev

# Kun proxy-server
npm run proxy
```

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

Åpne appen og gå til **Innstillinger**. Fyll inn:

| Felt | Eksempel |
|------|---------|
| Jira base URL | `https://dinorg.atlassian.net` |
| Confluence base URL | `https://dinorg.atlassian.net` |
| Brukernavn | din Atlassian e-postadresse |
| API-token | fra [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |
| Anthropic API-nøkkel | fra [console.anthropic.com](https://console.anthropic.com) |

Innstillingene lagres kun i nettleserens localStorage.

---

## Arkitektur

```
Browser (localhost:5173)
    ↓ Axios + X-Target-URL-header
Proxy Server (localhost:3001)
    ↓
Atlassian Cloud APIs  /  Anthropic API
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
├── services/         # API-lag: jiraService.ts, confluenceService.ts, api.ts
├── store/            # Zustand-stores: kanbanStore.ts, todoStore.ts
├── types/            # Delte TypeScript-typer (index.ts)
└── index.css         # Globale CSS-variabler (NEAS-tema)

server/
└── proxy.js          # Express-proxy mot Atlassian + AI-endepunkter
```

Alle Atlassian API-kall rutes gjennom proxy-serveren via `X-Target-URL`-header for å unngå CORS-problemer.

### AI-endepunkter i proxy

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
