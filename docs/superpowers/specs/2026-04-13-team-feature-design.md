# Team-funksjon — Designdokument

**Dato:** 2026-04-13  
**Status:** Godkjent av bruker

---

## Oversikt

Legger til et nytt menyvalg «Team» i applikasjonen. Formålet er å gi teamkoordinatorer en dedikert oversikt over oppgaver knyttet til sitt team, samt et verktøy for å tildele ansvarlig på oppgaver som ennå mangler dette. Hvert team identifiseres ved at visse Jira-komponenter knyttes til det.

De fire teamene er faste: **Administrasjon**, **System**, **Nettverk**, **NOC**.

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
- Viser alle saker tilhørende teamets komponenter
- Kolonner: nøkkel, tittel, komponent, prioritet, status, ansvarlig, forfallsdato
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

**Team-prosjekt:**
- Et tekstfelt for Jira-prosjektnøkkel (f.eks. `DRIFT`) som Team-siden bruker som datakilde
- Lagres som del av `team-component-config` i localStorage
- Komponentlisten i oppsett-boksen hentes fra dette prosjektet
- Vises øverst i seksjonen, over team-boksene

- Fire bokser, én per team, i et 2×2 grid
- Hver boks viser:
  - Teamnavn
  - Eksisterende komponenter som fargede chips med ×-knapp for fjerning
  - Søkbart input: viser dropdown med Jira-komponenter (hentet fra valgt prosjekt) som ikke allerede er tildelt dette teamet
- En komponent kan kun tilhøre **ett** team
- «Lagre oppsett»-knapp lagrer til `localStorage` med nøkkel `team-component-config`

**Datastruktur i localStorage:**
```json
{
  "projectKey": "DRIFT",
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
| Jira-saker | Jira API via proxy | Eksisterende `getIssues()`, filtreres på klientsiden |
| Brukerliste for tildeling | Jira API | Ny `searchUsers(query)` i `jiraService.ts` |
| Tildeling | Jira API | Ny `assignIssue(issueKey, accountId)` i `jiraService.ts` |
| Komponentliste (for oppsett) | Jira API | Ny `getProjectComponents(projectKey)` i `jiraService.ts` |

**Caching:** Saker hentes med TanStack Query (eksisterende mønster, 5 min staleTime). Etter tildeling oppdateres cache direkte med `queryClient.setQueryData` — ingen full re-fetch nødvendig.

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
- `src/services/jiraService.ts` — tre nye funksjoner: `searchUsers`, `assignIssue`, `getProjectComponents`

---

## Avgrensninger

- Teams er hardkodet (Administrasjon, System, Nettverk, NOC) — ingen CRUD for team i denne omgang
- Koordinator-visningen inkluderer ikke sprint-informasjon
- Sakslisten i koordinator-visningen gjenbruker eksisterende saksmodal fra Board
- Komponent-oppsett krever at Jira-prosjektnøkkel er konfigurert i Innstillinger
