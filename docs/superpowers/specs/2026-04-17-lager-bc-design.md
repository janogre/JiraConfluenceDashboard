# Lager – Business Central integrasjon

**Dato:** 2026-04-17
**Status:** Godkjent

## Oversikt

Nytt menyvalg «Lager» som henter og viser lagerdata for telekom-relevante varer fra Microsoft Business Central (BC) via OAuth 2.0 client credentials mot Entra ID. All BC-kommunikasjon skjer server-side gjennom proxy-serveren.

## Arkitektur

### Server-side modul

```
server/
  businessCentral/
    index.js        ← Express router, monteres på /api/bc/
    auth.js         ← Token-henting og in-memory cache
    itemsService.js ← Fetch med paginering via @odata.nextLink
```

`server/proxy.js` importerer og monterer routeren:

```js
import bcRouter from './businessCentral/index.js';
app.use('/api/bc', bcRouter);
```

### Frontend

```
src/
  services/bcService.ts
  pages/Lager/
    Lager.tsx
    Lager.module.css
```

## Dataflyt

1. Frontend kaller `GET /api/bc/items` via TanStack Query
2. Router delegerer til `itemsService.js`
3. `itemsService.js` kaller `auth.js` for gyldig token
4. `auth.js` returnerer cachet token eller henter nytt fra Entra ID
5. `itemsService.js` henter alle sider fra BC OData API med `@odata.nextLink`-løkke
6. Router returnerer `{ items: BcItem[], fetchedAt: string }`
7. Frontend filtrerer og søker client-side

## Token-caching (`auth.js`)

- In-memory modulnivå-variabel `{ token, expiresAt }`
- Nytt token hentes kun når `Date.now() > expiresAt`
- Token-endpoint: `https://login.microsoftonline.com/{BC_TENANT_ID}/oauth2/v2.0/token`
- Scope: `https://api.businesscentral.dynamics.com/.default`
- Ved 401 fra BC: cache invalideres og retry gjøres én gang
- Logger cache-treff/miss til konsoll for verifisering

## BC API-kall (`itemsService.js`)

**Base URL:**
```
https://api.businesscentral.dynamics.com/v2.0/{BC_TENANT_ID}/{BC_ENVIRONMENT}/api/v2.0
```

**Endepunkt:**
```
/companies({BC_COMPANY_ID})/items
  ?$filter=inventoryPostingGroupCode eq 'KOM' or inventoryPostingGroupCode eq 'DRIFT'
  &$select=number,displayName,displayName2,inventory,inventoryPostingGroupCode,lastModifiedDateTime
  &$top=1000
```

Grupper leses fra `BC_ITEM_GROUPS`-miljøvariabelen (kommaseparert, f.eks. `KOM,DRIFT`). Standardverdi hvis variabelen ikke er satt: `KOM,DRIFT`. OData `$filter` bygges dynamisk fra listen.

`$top=1000` settes som sidestørrelse. BC kan returnere færre rader per side og en `@odata.nextLink` for neste side.

**Paginering:** Løkke over `@odata.nextLink` til den er `undefined`. Alle sider slås sammen til ett flatt array.

## API-kontrakt (proxy → frontend)

```
GET /api/bc/items
200 OK: { items: BcItem[], fetchedAt: string }
500:    { error: string, detail?: string }
401:    { error: 'BC-autentisering feilet' }
503:    { error: 'Kunne ikke nå Business Central' }
```

## TypeScript-type

Legges til i `src/types/index.ts`:

```ts
export interface BcItem {
  number: string;
  displayName: string;
  displayName2: string;
  inventory: number;
  inventoryPostingGroupCode: string;
  lastModifiedDateTime: string;
}
```

## Frontend – Lager-siden

### Toolbar
- Fritekst-søk på `number` og `displayName` (client-side, case-insensitiv)
- Gruppe-dropdown: «Alle grupper» + individuelle grupper utledet fra returnerte data
- Toggle «Skjul tomt lager» – skjuler rader der `inventory === 0`
- Oppdater-knapp kaller TanStack Query `refetch()`

### Tabell (kolonner)
Sortering er client-side. Standardsortering: `number` stigende.

| Kolonne | Felt | Merknader |
|---|---|---|
| Varenr | `number` | Monospace, sorterbar |
| Navn | `displayName` | Sorterbar |
| Beskrivelse 2 | `displayName2` | Dempet tekst |
| Gruppe | `inventoryPostingGroupCode` | Badge |
| Lager | `inventory` | Høyrejustert, fargekodet: ≥10 grønn, 1–9 oransje, 0 rød + dempet rad |
| Oppdatert | `lastModifiedDateTime` | Norsk datoformat |

### Statuslinje
Viser antall varer totalt, antall synlige etter filtrering, hentetidspunkt og lastetid.

### TanStack Query
```ts
useQuery({
  queryKey: ['bc-items'],
  queryFn: fetchBcItems,
  staleTime: 1000 * 60 * 5,
})
```
Oppdater-knapp kaller `refetch()`.

## Feilhåndtering

| Scenario | Brukermelding | Teknisk logging |
|---|---|---|
| Nettverksfeil | «Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.» | `console.error` med full feil |
| 401 / token-feil | «BC-token kunne ikke hentes. Kontakt administrator – sjekk BC_CLIENT_SECRET i .env.» | Logger token-respons |
| BC API-feil (4xx/5xx) | «Business Central returnerte en feil (HTTP {status}).» | Logger respons-body |

Feilvisning erstatter tabellen. «Prøv igjen»-knapp vises ved tilkoblings- og token-feil.

## Navigasjon

- Ny route `/lager` i `App.tsx`
- Nytt nav-innslag i `LayoutV2.tsx` med `Package`-ikon fra lucide-react, label «Lager»
- Plasseres mellom «Team» og «Mine oppgaver»

## Miljøvariabler (`.env`)

```
BC_TENANT_ID=25138f26-f059-4e5b-a9af-095e3f965684
BC_CLIENT_ID=9e72f2d0-d0fb-4828-896f-b61ce518038f
BC_CLIENT_SECRET=<secret – aldri i git>
BC_ENVIRONMENT=Production
BC_COMPANY_ID=4a3dede8-1019-eb11-bf6a-000d3ab0b154
BC_ITEM_GROUPS=KOM,DRIFT
```

`.env` skal være i `.gitignore`. `BC_CLIENT_SECRET` eksponeres aldri til frontend.

## Sikkerhet

- Alle BC-kall skjer utelukkende server-side
- `BC_CLIENT_SECRET` leses kun av `server/businessCentral/auth.js`
- Frontend mottar aldri credentials, kun ferdig transformerte `BcItem`-objekter

## Definisjon av ferdig

- [ ] Lagerdata kan hentes fra BC med spesifiserte felter
- [ ] Data vises i appen på menyvalg «Lager»
- [ ] Token-caching fungerer (verifisert med logging)
- [ ] Paginering håndterer > 1000 items
- [ ] Feilhåndtering er implementert
- [ ] `BC_CLIENT_SECRET` er ikke sjekket inn i git
- [ ] `.env.example` er oppdatert med BC-variabler (uten secret)
