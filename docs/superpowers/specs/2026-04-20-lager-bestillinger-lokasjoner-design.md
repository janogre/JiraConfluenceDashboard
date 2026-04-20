# Lager – Bestillinger og lokasjoner

**Dato:** 2026-04-20
**Status:** Godkjent

## Oversikt

Tillegg til eksisterende BC-integrasjon (se `2026-04-17-lager-bc-design.md`). Lager-siden utvides med to faner: «Lager» (eksisterende visning) og «Bestillinger» (ny). To nye dataområder hentes fra BC: lokasjoner og innkjøpsordrer med linjer. All BC-kommunikasjon skjer server-side via eksisterende proxy-server.

## Arkitektur

### Server-side tillegg

```
server/businessCentral/
  auth.js              ← uendret
  itemsService.js      ← uendret
  locationsService.js  ← NY
  purchaseOrdersService.js ← NY
  index.js             ← utvides med to nye ruter
```

`server/proxy.js` er uendret – bcRouter er allerede montert på `/api/bc/`.

### Frontend-tillegg

```
src/
  types/index.ts          ← nye typer: BcLocation, BcPurchaseOrder, BcPurchaseOrderLine
  services/bcService.ts   ← nye funksjoner: fetchBcLocations, fetchBcPurchaseOrders
  pages/Lager/
    Lager.tsx             ← refaktoreres til tab-layout med delt state
    Lager.module.css      ← nye stiler: faner, ordre-rader, linje-rader
```

## Dataflyt

### Lokasjoner
1. Frontend kaller `GET /api/bc/locations` via TanStack Query (`queryKey: ['bc-locations']`)
2. `locationsService.js` sjekker in-memory cache (24h TTL)
3. Ved cache-miss: henter fra BC OData, lagrer i cache
4. Router returnerer `{ locations: BcLocation[], fetchedAt: string }`
5. Frontend bruker locations-data til å mappe `locationId` → `code` i bestillingslinjer

### Innkjøpsordrer
1. Frontend kaller `GET /api/bc/purchase-orders` via TanStack Query (`queryKey: ['bc-purchase-orders']`, `staleTime: 5 min`)
2. `purchaseOrdersService.js` kaller `auth.js` for gyldig token
3. Henter alle sider fra BC via `@odata.nextLink`-løkke (inkl. `$expand=purchaseOrderLines`)
4. Beriker hver linje med `locationCode` fra locations-cache
5. Router returnerer `{ orders: BcPurchaseOrder[], fetchedAt: string }`

## Token-caching og paginering

Gjenbruker eksisterende `getBcToken()` og `invalidateBcTokenCache()` fra `auth.js`. Paginering: `while (url)`-løkke som følger `@odata.nextLink` – identisk mønster som `itemsService.js`.

## Locations-caching (`locationsService.js`)

```js
let locationsCache = { data: null, expiresAt: 0 };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 timer

export async function getBcLocations() {
  if (locationsCache.data && Date.now() < locationsCache.expiresAt) {
    console.log('[BC locations] Cache-treff');
    return locationsCache.data;
  }
  // hent fra BC, lagre i cache
  locationsCache = { data: locations, expiresAt: Date.now() + CACHE_TTL_MS };
  return locations;
}
```

## BC API-kall

**Base URL** (samme som items):
```
https://api.businesscentral.dynamics.com/v2.0/{BC_TENANT_ID}/{BC_ENVIRONMENT}/api/v2.0/companies({BC_COMPANY_ID})
```

**Lokasjoner:**
```
/locations?$select=id,code,displayName
```

**Innkjøpsordrer:**
```
/purchaseOrders
  ?$select=id,number,orderDate,vendorNumber,vendorName,status,shipToName,purchaser,fullyReceived,lastModifiedDateTime
  &$expand=purchaseOrderLines($select=lineObjectNumber,description,quantity,receivedQuantity,invoicedQuantity,expectedReceiptDate,locationId,unitOfMeasureCode)
  &$orderby=orderDate desc
  &$top=1000
```

## API-kontrakt (proxy → frontend)

```
GET /api/bc/locations
200 OK: { locations: BcLocation[], fetchedAt: string }
401:    { error: 'BC-autentisering feilet...' }
503:    { error: 'Kunne ikke nå Business Central...' }
500:    { error: string, detail?: string }

GET /api/bc/purchase-orders
200 OK: { orders: BcPurchaseOrder[], fetchedAt: string }
401:    { error: 'BC-autentisering feilet...' }
503:    { error: 'Kunne ikke nå Business Central...' }
500:    { error: string, detail?: string }
```

## TypeScript-typer (legges til i `src/types/index.ts`)

```ts
export interface BcLocation {
  id: string;
  code: string;
  displayName: string;
}

export interface BcLocationsResponse {
  locations: BcLocation[];
  fetchedAt: string;
}

export interface BcPurchaseOrderLine {
  lineObjectNumber: string;
  description: string;
  quantity: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  expectedReceiptDate: string;
  locationId: string;
  unitOfMeasureCode: string;
  locationCode: string; // beriket server-side; 'UKJENT' hvis locationId ikke finnes i cache
}

export interface BcPurchaseOrder {
  id: string;
  number: string;
  orderDate: string;
  vendorNumber: string;
  vendorName: string;
  status: 'Draft' | 'Open' | 'Released' | string;
  shipToName: string;
  purchaser: string;
  fullyReceived: boolean;
  lastModifiedDateTime: string;
  lines: BcPurchaseOrderLine[];
}

export interface BcPurchaseOrdersResponse {
  orders: BcPurchaseOrder[];
  fetchedAt: string;
}
```

## Frontend – Lager-siden med faner

### Tab-state (løftet til toppen av `Lager.tsx`)

```ts
type ActiveTab = 'lager' | 'bestillinger';
const [activeTab, setActiveTab] = useState<ActiveTab>('lager');
const [crossTabFilter, setCrossTabFilter] = useState('');
```

To-veis navigasjon:
- Klikk på `lineObjectNumber` i bestillingslinje → `setActiveTab('lager'); setCrossTabFilter(varenr)`
- «Vis bestillinger»-lenke på lager-rad (vises ved `inventory <= 3`) → `setActiveTab('bestillinger'); setCrossTabFilter(varenr)`
- `crossTabFilter` forsvinner automatisk når brukeren endrer søkefeltet manuelt i den aktive fanen

### Bestillinger-fanen

**Toolbar:**
- Fritekst-søk på `number`, `vendorName` og `lineObjectNumber` (client-side, case-insensitiv)
- Status-dropdown: «Alle statuser» / «Open» / «Draft» – standardvisning viser begge
- Lokasjons-dropdown: «Alle lokasjoner» + NEAS-whitelist-lokasjoner utledet fra returnerte data
- Leverandør-dropdown: «Alle leverandører» + utledet fra returnerte data
- Oppdater-knapp kaller TanStack Query `refetch()`

**Ordretabell (kolonner):**

| Kolonne | Felt | Merknader |
|---|---|---|
| (expand) | – | ▶/▼-ikon, klikk ekspanderer/kollapserer |
| Ordrenr | `number` | Monospace, sorterbar |
| Dato | `orderDate` | Norsk datoformat, sorterbar |
| Leverandør | `vendorName` | Sorterbar |
| Leveres til | `shipToName` | |
| Innkjøper | `purchaser` | Initialer |
| Status | `status` | Badge: Open=grønn, Draft=grå |
| Linjer | `lines.length` | Høyrejustert |

Draft-ordrer vises dempet (opacity).

**Linje-rader (under ekspandert ordre):**

| Kolonne | Felt | Merknader |
|---|---|---|
| Varenr | `lineObjectNumber` | Monospace, klikkbar lenke → Lager-fanen |
| Beskrivelse | `description` | |
| Lokasjon | `locationCode` | Badge |
| Bestilt | `quantity` | |
| Mottatt | `receivedQuantity` | Grønn hvis lik quantity |
| Enhet | `unitOfMeasureCode` | |
| Forv. dato | `expectedReceiptDate` | Norsk datoformat |

**Statuslinje:** Viser antall ordrer totalt, antall synlige etter filtrering, antall linjer totalt, hentetidspunkt.

### TanStack Query

```ts
// I Bestillinger-komponenten/fanen:
useQuery({
  queryKey: ['bc-purchase-orders'],
  queryFn: fetchBcPurchaseOrders,
  staleTime: 1000 * 60 * 5,
})

// Locations deles mellom begge faner (hentes én gang):
useQuery({
  queryKey: ['bc-locations'],
  queryFn: fetchBcLocations,
  staleTime: 1000 * 60 * 60 * 24, // 24 timer
})
```

## NEAS-lokasjonsliste (whitelist)

Definert som konstant i `locationsService.js` (ikke env-variabel – endres sjelden):

```js
const NEAS_LOCATION_CODES = ['M1', 'OPPDAL HK', 'RØROS HK', 'CAMPUS', 'DIR', 'SINUS BNN', 'SINUS SSJ'];
```

Lokasjons-dropdown i Bestillinger-fanen viser kun disse. Øvrige lokasjoner eksponeres ikke i UI, men `locationCode` på linjer settes uansett (for full dataintegritet).

## Feilhåndtering

Samme mønster som eksisterende `/items`:

| Scenario | HTTP | Brukermelding |
|---|---|---|
| 401 / isAuthError | 401 | «BC-autentisering feilet. Kontakt administrator.» |
| Nettverksfeil | 503 | «Kunne ikke nå Business Central. Sjekk nettverkstilkobling.» |
| BC API 4xx/5xx | 500 | «Business Central returnerte en feil (HTTP {status}).» |
| locationId ikke i cache | – (server-side) | `locationCode = 'UKJENT'`, console.warn med GUID |

Feilvisning erstatter tabellen i den aktuelle fanen. «Prøv igjen»-knapp ved nettverks- og auth-feil.

## Kjente begrensninger (dokumenteres i kode)

- `/purchaseInvoices` (historiske/fakturerte innkjøp) krever utvidet permission set i BC og er ikke tilgjengelig per nå.
- `expectedReceiptDate` er ofte identisk med `orderDate` – realistiske leveringsdatoer finnes ikke i systemet p.t.
- `inventory` på items er totalt på tvers av lokasjoner, ikke per sted.
- Locations-listen inneholder også eksterne aktørers lagre – whitelist brukes for å filtrere til NEAS-relevante lokasjoner i dropdown.

## Ingen nye miljøvariabler

Bruker eksisterende `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `BC_ENVIRONMENT`, `BC_COMPANY_ID`.

## Sikkerhet

- Alle BC-kall skjer utelukkende server-side
- `BC_CLIENT_SECRET` leses kun av `auth.js`
- Frontend mottar aldri credentials, kun ferdig transformerte objekter

## Definisjon av ferdig

- [ ] Lokasjoner hentes og caches server-side (24h TTL)
- [ ] Innkjøpsordrer hentes med linjer i ett kall (`$expand`)
- [ ] `locationId` → `locationCode` beriket på alle linjer
- [ ] Paginering via `@odata.nextLink` fungerer
- [ ] Lager-siden har to faner: «Lager» og «Bestillinger»
- [ ] Bestillinger vises i ordre-orientert tabell med expand/collapse
- [ ] To-veis navigasjon mellom faner via varenr fungerer
- [ ] Filtere (status, lokasjon, leverandør, søk) fungerer client-side
- [ ] Feilhåndtering implementert for begge nye endepunkter
- [ ] Kjente begrensninger dokumentert i kode
- [ ] Ingen regresjon i eksisterende items/Lager-funksjonalitet
