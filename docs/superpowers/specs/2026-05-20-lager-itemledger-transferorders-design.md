# Lager – ItemLedgerEntries og TransferOrders

**Dato:** 2026-05-20
**Status:** Utkast – ItemLedgerEntries-delen er klar for plan. TransferOrders blokkert: krever at BC-administrator publiserer Page 5740/5741 som ODataV4 web service (se *Probe-resultat 2026-05-20*).

## Probe-resultat 2026-05-20

Kjørt via `scripts/probe-bc-transfer-orders.mjs` mot `NEAS AS (Marked)` / `Production`:

| Endepunkt | Resultat | Konklusjon |
|---|---|---|
| `api/v2.0/.../transferOrders` | 404 `BadRequest_NotFound` | Som ventet – ikke i standard BC API v2.0 |
| `ODataV4/.../TransferOrders` | 404 | Page 5740 ikke publisert |
| `ODataV4/.../Transfer_Order`, `TransferHeader`, `Transfer_Header`, `TransferOrderLine`, `Transfer_Line`, `TransferShipmentHeader`, `TransferReceiptHeader` m.fl. | 404 | Ingen alternative navn fungerer |
| `ODataV4/.../$metadata` | 404 | NEAS' tenant eksponerer ikke service-metadata – kun en håndplukket whitelist av Pages er publisert |
| `ODataV4/.../ItemLedgerEntries` | **200 OK** | Klar til bruk – samme mønster som `inventoryByLocationService.js` |

**Aksjon:** Spec for **ItemLedgerEntries kan implementeres umiddelbart.** For **TransferOrders må NEAS-BC-administrator publisere Page 5740 (Transfer Orders) og Page 5741 (Transfer Order Subform) som web services** før denne delen kan bygges. Frem til det er gjort, splittes denne spec'en i to leveranser.

## Oversikt

Utvidelse av eksisterende BC-integrasjon (se `2026-04-17-lager-bc-design.md`, `2026-04-20-lager-bestillinger-lokasjoner-design.md`, `2026-04-21-bc-derived-status-design.md`). Lager-funksjonen får to nye dataområder fra Business Central:

1. **ItemLedgerEntries (lagertransaksjoner)** – full bevegelseshistorikk per vare. Brukes til å berike Lager-tab'en med "forbruk siste 90 dager" og "siste bevegelse", samt en ny *Bevegelser*-visning per vare.
2. **TransferOrders (overføringsordrer)** – varer i transitt mellom NEAS-lokasjoner. Vises som egen tab ved siden av Bestillinger, og beriker `inventoryByLocation` med "på vei inn / på vei ut" per lokasjon.

Følger samme arkitekturmønster som eksisterende BC-services: server-side henting med token-cache, paginering via `@odata.nextLink`, og berikelse før frontend mottar data.

## Bakgrunn / verdi

- Lager-tab'en viser i dag *statisk lagernivå* uten kontekst om bevegelse. Et lavt nivå på en vare med null forbruk siste 6 mnd er ikke kritisk – det motsatte er.
- NEAS har 7 whitelistede lokasjoner og overfører varer mellom dem. Disse vises i dag ikke noe sted; brukerne må sjekke i BC-klienten.
- Vi har allerede bevist at `ItemLedgerEntries` er tilgjengelig via ODataV4 (`inventoryByLocationService.js`). Det reduserer risiko betraktelig.

## Åpen avklaring (blokkerer ikke spec'en, men plan)

**TransferOrders – API-tilgang:** Standard BC API v2.0 har *ikke* `transferOrders`-endepunkt. Vi har to alternativer:

| Alt. | Vei | Krav | Anbefaling |
|---|---|---|---|
| A | ODataV4 Page-basert: `…/ODataV4/Company('…')/TransferOrders` (Page 5740 «Transfer Orders» + Page 5741 «Transfer Order Subform») | Page må være publisert som web service i BC. Ukjent status. | **Foretrukket** – samme mønster som `inventoryByLocationService.js` |
| B | Custom AL API page publisert av BC-utvikler | Krever AL-utvikling og deploy i NEAS' BC-tenant | Fallback hvis A ikke kan publiseres |

**Action før implementasjon:** verifisere via et lite probe-script (`scripts/probe-bc-transfer-orders.mjs`) om `TransferOrders` og `TransferOrderLine`/`Transfer_Line` er tilgjengelig via ODataV4. Resten av spec'en antar Alt. A.

## Arkitektur

### Server-side – nye filer

```
server/businessCentral/
  itemLedgerEntriesService.js   ← NY  (full historikk, brukes for forbruk + bevegelser)
  transferOrdersService.js      ← NY  (åpne overføringer + in-transit aggregat)
  index.js                      ← utvides med tre nye ruter
  itemsService.js               ← utvides: ny berikelse fra ItemLedgerEntries
  inventoryByLocationService.js ← uendret (men kandidat for fremtidig samkjøring)
```

### Frontend – nye/endrede filer

```
src/
  types/index.ts                ← nye typer (se under)
  services/bcService.ts         ← nye fetch-funksjoner
  pages/Lager/
    Lager.tsx                   ← legger til tredje tab «Overføringer»
    LagerTab.tsx                ← nye kolonner "Forbruk 90d" + "Sist beveget", expand viser bevegelser
    OverforingerTab.tsx         ← NY
    Lager.module.css            ← nye stiler
```

## API-kontrakt (proxy → frontend)

```
GET /api/bc/item-ledger-entries?itemNumber=<nr>&fromDate=<ISO>
  → { entries: BcItemLedgerEntry[], fetchedAt: string }
  - itemNumber: påkrevd (vi henter aldri alle på én gang – kun ved klikk/expand)
  - fromDate:   valgfri, default = i dag - 1 år

GET /api/bc/item-consumption
  → { consumption: Record<itemNumber, { last30d: number; last90d: number; lastMovementDate: string | null }>, fetchedAt: string }
  - Hentes én gang, brukes til å berike Lager-tab'en
  - Server-side aggregat over ItemLedgerEntries, ikke per-rad til klient

GET /api/bc/transfer-orders
  → { orders: BcTransferOrder[], fetchedAt: string }
  - Kun åpne (status 'Released' eller 'Open') – fullførte filtreres ut server-side
```

Feilhåndtering: samme `handleBcError`-mønster som eksisterende ruter (401 → reauth-melding, 503 → nettverk, 500 → generisk).

## BC API-detaljer

**Base URL** (ODataV4, samme som inventoryByLocationService):
```
https://api.businesscentral.dynamics.com/v2.0/{BC_TENANT_ID}/{BC_ENVIRONMENT}/ODataV4/Company('{name}')
```
Companynavn slås opp via eksisterende `resolveCompanyName(token)`-mønster (bør trekkes ut til delt helper – se *Refaktoreringsmuligheter*).

### ItemLedgerEntries (per vare + aggregat)

```
/ItemLedgerEntries
  ?$filter=Item_No eq '{itemNo}' and Posting_Date ge {fromDate}
  &$select=Entry_No,Item_No,Posting_Date,Entry_Type,Document_No,Location_Code,Quantity,Remaining_Quantity,Description
  &$orderby=Posting_Date desc
  &$top=1000
```

`Entry_Type` brukes til å klassifisere bevegelsen:
- `Purchase`, `Sale`, `Positive Adjmt.`, `Negative Adjmt.`, `Transfer`, `Consumption`, `Output`

For **consumption-aggregatet** henter vi *alle* entries siste 90 dager én gang (ikke per vare) og summerer per `Item_No`:
- `last30d = Σ |Quantity|` der `Entry_Type ∈ { Sale, Consumption, Negative Adjmt., Transfer (utgående) }` siste 30 dager.
- `last90d` tilsvarende for 90 dager.
- `lastMovementDate = max(Posting_Date)` over alle entries (uavhengig av type).

Volumvurdering: KOM+DRIFT-varer i NEAS er ~hundretalls; entries siste 90 dager forventes maks noen tusen rader. Akseptabelt for én server-side aggregering hver 30. minutt.

### TransferOrders

Forutsatt at Page 5740 er publisert (verifiseres via probe-script):

```
/TransferOrders
  ?$filter=Status ne 'Finished'
  &$select=No,Transfer_from_Code,Transfer_to_Code,Posting_Date,Shipment_Date,Receipt_Date,Status,Assigned_User_ID
  &$expand=TransferOrderLine($select=Item_No,Description,Quantity,Quantity_Shipped,Quantity_Received,Unit_of_Measure_Code)
  &$top=1000
```

Hvis `$expand` ikke virker på den publiserte page'en, gjør vi to kall (én for header, én for linjer filtrert på `Document_No in (...)`) og joiner server-side. Dette dokumenteres i kode hvis det blir nødvendig.

**Status-mapping** (samme filosofi som `derivedStatus` på purchaseOrders – BC-feltet er upålitelig):

```
totalShipped  = Σ Quantity_Shipped
totalReceived = Σ Quantity_Received
totalQty      = Σ Quantity

totalShipped === 0                          → 'Planlagt'
totalShipped > 0 && totalReceived < totalShipped → 'I transitt'
totalReceived >= totalShipped && totalReceived < totalQty → 'Delvis mottatt'
totalReceived >= totalQty                   → 'Mottatt'
```

Ren funksjon `computeTransferStatus(lines)` med JSDoc som dokumenterer alle utfall – samme stil som `computeDerivedStatus` i `purchaseOrdersService.js`.

## TypeScript-typer (nytt i `src/types/index.ts`)

```ts
export type BcItemLedgerEntryType =
  | 'Purchase' | 'Sale' | 'Positive Adjmt.' | 'Negative Adjmt.'
  | 'Transfer' | 'Consumption' | 'Output';

export interface BcItemLedgerEntry {
  entryNo: number;
  itemNumber: string;
  postingDate: string;          // ISO
  entryType: BcItemLedgerEntryType;
  documentNumber: string;
  locationCode: string;
  quantity: number;             // negativ for uttak
  remainingQuantity: number;
  description: string;
}

export interface BcItemConsumption {
  last30d: number;
  last90d: number;
  lastMovementDate: string | null;
}

export type BcItemConsumptionMap = Record<string, BcItemConsumption>;

export type BcTransferStatus = 'Planlagt' | 'I transitt' | 'Delvis mottatt' | 'Mottatt';

export interface BcTransferOrderLine {
  itemNumber: string;
  description: string;
  quantity: number;
  quantityShipped: number;
  quantityReceived: number;
  unitOfMeasureCode: string;
  inTransitQuantity: number;    // beriket: quantityShipped - quantityReceived
}

export interface BcTransferOrder {
  number: string;
  fromLocationCode: string;
  toLocationCode: string;
  postingDate: string;
  shipmentDate: string;
  receiptDate: string;
  assignedUser: string;
  derivedStatus: BcTransferStatus;
  lines: BcTransferOrderLine[];
}

export interface BcItemLedgerEntriesResponse {
  entries: BcItemLedgerEntry[];
  fetchedAt: string;
}
export interface BcItemConsumptionResponse {
  consumption: BcItemConsumptionMap;
  fetchedAt: string;
}
export interface BcTransferOrdersResponse {
  orders: BcTransferOrder[];
  fetchedAt: string;
}
```

Eksisterende `BcItem` utvides:

```ts
export interface BcItem {
  // …eksisterende felter…
  consumption?: BcItemConsumption;   // beriket server-side fra ItemLedgerEntries
}
```

## Frontend-endringer

### Lager-tab (`LagerTab.tsx`)

**Nye kolonner i hovedtabellen:**

| Kolonne | Felt | Visning |
|---|---|---|
| Forbruk 90d | `consumption.last90d` | Tall, høyrejustert. Dempet hvis 0. |
| Sist beveget | `consumption.lastMovementDate` | Relativ tid ("3 d siden", "2 mnd siden"). Rød badge "Ingen bevegelse" hvis null eller > 365 dager. |

**Ny sortering:** sortField utvides med `'consumption90d'` og `'lastMovement'`.

**Nytt filter (toggle):** "Skjul døde varer" – skjuler rader med `last90d === 0`. Default av.

**Expand-rad utvides:** under den eksisterende lokasjonsfordelingen vises de siste 10 bevegelsene for varen (lazy-loadet via `/api/bc/item-ledger-entries?itemNumber=…`). Hver rad: dato, type-badge, dokumentnr, lokasjon, antall (rød hvis negativ).

### Ny tab: Overføringer (`OverforingerTab.tsx`)

Plassert som tredje tab etter Lager og Bestillinger.

**Toolbar:**
- Fritekst-søk (`number`, `Item_No`, `Description`)
- Status-dropdown: Alle / Planlagt / I transitt / Delvis mottatt / Mottatt
- Fra-lokasjon (whitelist)
- Til-lokasjon (whitelist)
- Toggle "Vis fullførte" (default av – samme prinsipp som "Vis ufullstendige" i Bestillinger)

**Ordretabell:**

| Kolonne | Felt |
|---|---|
| (expand) | – |
| Ordrenr | `number` |
| Fra | `fromLocationCode` (badge) |
| Til | `toLocationCode` (badge) |
| Sendt | `shipmentDate` |
| Forventet mottatt | `receiptDate` (samme `(ikke satt)`-håndtering som Bestillinger hvis lik postingDate) |
| Bruker | `assignedUser` |
| Status | `derivedStatus` (badge med samme fargesystem som Bestillinger) |
| Linjer | `lines.length` |

**Linje-rader (expand):** Varenr (klikkbar → Lager-tab), beskrivelse, bestilt, sendt, mottatt, i transitt, enhet.

**Krysslinking:** Varenr-klikk åpner Lager-tab med søk satt (samme mønster som dagens `goToLager`).

### Lager.tsx (router for tabs)

Utvides analogt med dagens kode – tredje state-bit (`overfNavKey`, `overfInitialSearch`) og en `goToOverforinger(varenr)`-funksjon. Bestillinger og Lager får også mulighet til å åpne Overføringer for en gitt varenr (lenke i expand-raden hvis varen har åpne overføringer).

## Caching

Følger eksisterende mønster:

| Service | TTL | Begrunnelse |
|---|---|---|
| `transferOrdersService` (åpne ordrer) | 5 min | Samme som purchaseOrders |
| `itemLedgerEntriesService` (consumption-aggregat) | 30 min | Tungt aggregat; bevegelser endrer seg ikke ofte nok til å rettferdiggjøre 5 min |
| `itemLedgerEntriesService` (per-vare-historikk ved expand) | Ingen server-side cache | Bruker TanStack Query (5 min `staleTime`) på klient – sjelden samme vare i raskt rekkefølge |

TanStack Query-nøkler:
```
['bc-transfer-orders']
['bc-item-consumption']
['bc-item-ledger', itemNumber]
```

## Berikelse av items

`itemsService.js` får et nytt berikelsessteg `enrichWithConsumption(items)` analogt med `enrichWithOpenOrders`. Den henter `getItemConsumption()` fra `itemLedgerEntriesService.js` og legger på `item.consumption`. Feiler graceful (samme `try/catch + warn`-mønster).

Berikelseskjede i `getBcItems()` blir:
```
items → withInventoryByLocation → withOpenOrders → withConsumption
```

## Refaktoreringsmuligheter (egen oppgave – ikke i denne spec'en)

- `resolveCompanyName(token)` duplisert mellom `inventoryByLocationService.js` og fremtidig `itemLedgerEntriesService.js` / `transferOrdersService.js`. Bør trekkes ut til `server/businessCentral/companyHelper.js`.
- `inventoryByLocationService.js` henter åpne ledger entries; `itemLedgerEntriesService.js` henter alle entries siste 90 dager. Disse kan i fremtiden konsolideres til én service som returnerer både remainingQty og bevegelser, men koples nå adskilt for å minimere risiko i denne leveransen.

## Probe-script (kjøres før implementasjon)

`scripts/probe-bc-transfer-orders.mjs`:
- Authentiserer via samme `auth.js`
- Forsøker `GET /ODataV4/Company('…')/TransferOrders?$top=1`
- Logger HTTP-status og første rad (eller feilmelding)
- Forsøker også `$expand=TransferOrderLine`
- Logger hvilken status NEAS' BC-tenant har på denne page-eksponering

Hvis 404: vi må be NEAS-BC-administrator publisere Page 5740/5741 som web service, eller akseptere fallback til custom AL-API (out of scope for denne spec'en).

## Feilhåndtering

| Scenario | HTTP til frontend | Brukermelding |
|---|---|---|
| 401 / isAuthError | 401 | «BC-autentisering feilet. Kontakt administrator.» |
| Nettverk (`ECONNREFUSED`/`ETIMEDOUT`/`AbortError`) | 503 | «Kunne ikke nå Business Central. Sjekk nettverkstilkobling.» |
| BC 4xx/5xx | 500 | «Business Central returnerte en feil (HTTP {status}).» |
| TransferOrders 404 (page ikke publisert) | 501 | «Overføringsordrer er ikke aktivert mot BC. Kontakt administrator.» |
| Vare ikke funnet ved ledger-detalj | 200 + tom liste | – |

Per-tab feilvisning – feil i Overføringer-fanen påvirker ikke Lager eller Bestillinger.

## Ingen nye miljøvariabler

Bruker eksisterende `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `BC_ENVIRONMENT`, `BC_COMPANY_ID`. Det kreves *ikke* nye permission sets utover det som allerede gir tilgang til `ItemLedgerEntries`.

Forutsetning som kan kreve handling: BC-rollen som `BC_CLIENT_ID` benytter må ha lesetilgang til Transfer Order-tabellene (5740/5741). Verifiseres av probe-script.

## Sikkerhet

- All BC-kommunikasjon server-side.
- Klient sender kun `itemNumber` og valgfri `fromDate` til `/api/bc/item-ledger-entries`. Server validerer at `itemNumber` ikke inneholder enkeltfnutt (escape `''`).
- Ingen credentials returneres til klient.

## Risiko og regresjon

| Risiko | Sannsynlighet | Mitigering |
|---|---|---|
| TransferOrders-page ikke publisert | Middels | Probe-script først; fallback-spec for custom API hvis nødvendig |
| ItemLedgerEntries siste 90 dager > 50 000 rader | Lav | Paginering allerede løst; aggregat skjer rad-for-rad uten å holde alt i minne ved behov |
| Treg lasting av Lager-tab pga ny berikelse | Middels | `enrichWithConsumption` feiler graceful → items vises uten consumption-felter |
| Krysstab-navigasjon blir uoversiktlig med 3 tabs | Lav | Vurdere å samle goto-funksjonene i en context hvis det vokser – ikke nødvendig nå |

## Definisjon av ferdig

- [ ] Probe-script kjørt og dokumentert resultat
- [ ] `itemLedgerEntriesService.js`: `getItemLedgerEntries(itemNumber, fromDate)` + `getItemConsumption()` med 30 min cache
- [ ] `transferOrdersService.js`: `getBcTransferOrders()` med `computeTransferStatus`-JSDoc som dekker alle 4 utfall
- [ ] Tre nye ruter i `index.js` med standard feilhåndtering
- [ ] `itemsService.js` beriker med `consumption`
- [ ] Nye TypeScript-typer i `src/types/index.ts`
- [ ] `bcService.ts`: tre nye fetch-funksjoner
- [ ] `LagerTab`: to nye kolonner, sortering, "Skjul døde varer"-toggle, expand viser bevegelser
- [ ] Ny `OverforingerTab` med toolbar, tabell, expand-linjer
- [ ] `Lager.tsx`: tredje tab + krysslinking varenr → andre tabs
- [ ] CSS-klasser for nye badges (transfer-status, "Ingen bevegelse")
- [ ] Kode-kommentarer dokumenterer hvorfor BC-`Status`-feltet ignoreres for TransferOrders (analogt med purchaseOrders)
- [ ] `npm run build` og `npm run lint` passerer
- [ ] Manuell verifisering i browser: alle tre tabs laster, krysslinking fungerer, en kjent vare viser realistisk forbruk
- [ ] Ingen regresjon i Lager- eller Bestillinger-fanen
