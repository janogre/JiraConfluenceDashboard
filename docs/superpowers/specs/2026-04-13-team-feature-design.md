# Team-funksjon — Designdokument

**Dato:** 2026-04-13  
**Status:** Godkjent av bruker

---

## Oversikt

Legger til et nytt menyvalg «Team» i applikasjonen. Formålet er å gi teamkoordinatorer en dedikert oversikt over oppgaver knyttet til sitt team, samt et verktøy for å tildele ansvarlig på oppgaver som ennå mangler dette. Hvert team identifiseres ved at visse Jira-komponenter knyttes til det.

De fire teamene er faste: **Administrasjon**, **System**, **Nettverk**, **NOC**. Alle team jobber på tvers av alle Jira-prosjekter.

---

## Navigasjon

- Nytt menyvalg **«Team»** legges til i `LayoutV2.tsx` med passende ikon (f.eks. `Users` fra lucide-react)
- Rute `/team` legges til i `App.tsx`
- Siden har fire faner øverst — én per team
- Sist valgt team-fane lagres i `localStorage` (`team-active-tab`), standard er «Administrasjon»

---

## Team-siden (`/team`)

### Fanelayout
Øverst på siden vises fire klikk-bare faner:  
`Administrasjon` | `System` | `Nettverk` | `NOC`

Under fanene vises to underfaner for valgt team:  
`Koordinator` | `Utildelte oppgaver`

---

### Underfane 1: Koordinator

**Statistikkort (4 stk øverst):**
| Kort | Innhold |
|------|---------|
| Åpne saker | Antall saker med `statusCategory !== done` |
| Forfalt | Antall saker med `dueDate < today` og ikke ferdig |
| Uten ansvarlig | Antall saker uten `assignee` |
| Høy prioritet | Antall saker med prioritet «High» eller «Highest» |

**Arbeidsbelastning per person:**
- Én rad per unikt teammedlem med tildelte saker
- Horisontal stolpe viser antall saker relativt til den med flest
- Viser antall saker som tall

**Statusfordeling:**
- Farget horisontal bar: grønn (ferdig) / blå (pågår) / grå (å gjøre)
- Legende under

**Saksliste:**
- Viser alle saker tilhørende teamets komponenter (åpne og lukkede)
- Kolonner: nøkkel, tittel, prosjekt, komponent, prioritet, status, ansvarlig, forfallsdato
- Filtrering på: prioritet, status, komponent
- Klikk på sak åpner eksisterende saksmodal (gjenbruk fra `Board.tsx`)

---

### Underfane 2: Utildelte oppgaver

Viser kun saker tilhørende teamets komponenter der `assignee` er `null`.

**Bulktildeling:**
- Avkrysningsboks per rad
- Verktøylinje vises når ≥1 rad er valgt: «X valgt» + «Tildel valgte ▾»
- Klikk på «Tildel valgte» åpner søkbart brukersøk — velger man en bruker tildeles alle valgte saker

**Enkeltvis tildeling:**
- «+ Tildel»-knapp per rad åpner søkbart brukersøk inline under raden
- Valg av bruker tildeler kun den ene saken

**Tildeling:**
- Kaller `PUT /rest/api/3/issue/{issueKey}/assignee` via ny `assignIssue(issueKey, accountId)` i `jiraService.ts`
- Brukerliste hentes via `GET /rest/api/3/user/search?query=` (søk ved inntasting)
- Etter vellykket tildeling fjernes saken fra listen uten full reload (TanStack Query cache-oppdatering)

---

## Innstillinger — Team-oppsett

Ny seksjon i `Settings.tsx` under eksisterende API-konfig, med tittel **«Team-oppsett»**.

- Fire bokser, én per team, i et 2×2 grid
- Hver boks viser:
  - Teamnavn
  - Eksisterende komponenter som fargede chips med ×-knapp for fjerning
  - Søkbart input: viser dropdown med Jira-komponenter (hentet fra alle tilgjengelige prosjekter) som ikke allerede er tildelt noe team
- En komponent kan kun tilhøre **ett** team
- «Lagre oppsett»-knapp lagrer til `localStorage` med nøkkel `team-component-config`

**Komponent-autocomplete:**
Komponenter hentes fra alle tilgjengelige Jira-prosjekter via `getProjects()` (allerede i cachen) etterfulgt av `GET /rest/api/3/project/{projectKey}/components` for hvert prosjekt. Resultatet caches i TanStack Query med lang staleTime (30 min) siden komponentlister endres sjelden.

**Datastruktur i localStorage:**
```json
{
  "Administrasjon": ["HR-system", "Økonomi"],
  "System": ["Netadmin", "Power BI"],
  "Nettverk": ["Fiber"],
  "NOC": ["Overvåking"]
}
```

---

## Dataflyt

| Data | Kilde | Metode |
|------|-------|--------|
| Team-komponent-konfig | localStorage | Leses ved oppstart av Team-siden |
| Jira-saker for team | Jira API via proxy | Ny `getIssuesByComponents(componentNames[])` med JQL: `component in ("X","Y") ORDER BY updated DESC` |
| Brukerliste for tildeling | Jira API | Ny `searchUsers(query)` i `jiraService.ts` |
| Tildeling | Jira API | Ny `assignIssue(issueKey, accountId)` i `jiraService.ts` |
| Komponentliste (for oppsett) | Jira API | Ny `getAllProjectComponents()` i `jiraService.ts` — henter fra alle prosjekter og deduplicerer |

**Caching:** Saker hentes med TanStack Query (5 min staleTime). Komponentliste caches med 30 min staleTime. Etter tildeling oppdateres cache direkte med `queryClient.setQueryData` — ingen full re-fetch nødvendig.

---

## Nye filer

```
src/pages/Team/
  Team.tsx               — Hovedside: team-faner + underfaner
  TeamCoordinator.tsx    — Koordinator-visning
  TeamUnassigned.tsx     — Utildelte oppgaver med tildeling
  Team.module.css        — Felles stiler for Team-sidene
```

**Endrede filer:**
- `src/App.tsx` — ny rute `/team`
- `src/components/Layout/LayoutV2.tsx` — nytt menyvalg
- `src/pages/Settings/Settings.tsx` — ny seksjon for team-oppsett
- `src/services/jiraService.ts` — fire nye funksjoner: `getIssuesByComponents`, `searchUsers`, `assignIssue`, `getAllProjectComponents`

---

## Avgrensninger

- Teams er hardkodet (Administrasjon, System, Nettverk, NOC) — ingen CRUD for team i denne omgang
- Koordinator-visningen inkluderer ikke sprint-informasjon
- Sakslisten i koordinator-visningen gjenbruker eksisterende saksmodal fra Board
- Saker uten komponent-tilknytning vises ikke i noen teamvisning
