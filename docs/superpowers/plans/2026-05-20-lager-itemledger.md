# Lager – ItemLedgerEntries (Fase 1) — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Berik Lager-tab'en med "Forbruk 30/90d" og "Sist beveget" per vare, og legg til en lazy-lastet bevegelseslogg i expand-raden. Henter data fra BC `ItemLedgerEntries` via ODataV4 (samme mønster som `inventoryByLocationService.js`).

**Architecture:** Ny `itemLedgerEntriesService.js` på server-side eksponerer to operasjoner: `getItemConsumption()` (aggregat over siste 90 dager, 30 min cache) og `getItemLedgerEntries(itemNumber, fromDate)` (per-vare-detalj, ingen server-cache). `itemsService.js` beriker items med `consumption`. Frontend får to nye kolonner og en utvidet expand-rad i `LagerTab`.

**Tech Stack:** Node.js (Express-proxy), React 19 + TypeScript, CSS Modules, TanStack Query (uendret).

**Test-strategi:** Prosjektet har ingen test-runner. Rene aggregeringsfunksjoner får JSDoc med worked examples. Ende-til-ende verifiseres manuelt via browser i Oppgave 9.

**Språk:** Norsk bokmål for alle kode-kommentarer, UI-tekster og commit-meldinger.

**Referanse-spec:** `docs/superpowers/specs/2026-05-20-lager-itemledger-transferorders-design.md`

**Scope-avgrensning (Fase 1):** Denne planen dekker *kun* ItemLedgerEntries. TransferOrders (Fase 2) er blokkert på at NEAS-BC-admin må publisere Page 5740/5741 som web service (se probe-resultat i spec'en). `OverforingerTab.tsx` og `getBcTransferOrders` er **ikke** del av denne planen.

---

## Filstruktur

| Fil | Handling | Ansvar |
|---|---|---|
| `server/businessCentral/itemLedgerEntriesService.js` | NY | `getItemConsumption`, `getItemLedgerEntries`, `classifyMovement` |
| `server/businessCentral/itemsService.js` | Modifiser | Legg til `enrichWithConsumption` i berikelseskjeden |
| `server/businessCentral/index.js` | Modifiser | To nye ruter: `/item-consumption` og `/item-ledger-entries` |
| `src/types/index.ts` | Modifiser | Nye typer: `BcItemLedgerEntry`, `BcItemConsumption`, response-typer; utvid `BcItem` med `consumption` |
| `src/services/bcService.ts` | Modifiser | `fetchBcItemLedgerEntries(itemNumber, fromDate?)`, (consumption hentes via items – ingen separat fetcher trengs i klient) |
| `src/pages/Lager/LagerTab.tsx` | Modifiser | Nye kolonner, sortering, "Skjul døde varer"-toggle, expand viser bevegelser |
| `src/pages/Lager/Lager.module.css` | Modifiser | Nye stiler: `inventoryDead`, `movementsTable`, `movementBadge*`, `lastMovementBadge*` |

Ingen endringer i: `inventoryByLocationService.js`, `purchaseOrdersService.js`, `locationsService.js`, `auth.js`, `api.ts`, `Lager.tsx`, `BestillingerTab.tsx`.

---

## Oppgave 1: `itemLedgerEntriesService.js` – grunnstruktur og hjelpere

**Files:**
- Create: `server/businessCentral/itemLedgerEntriesService.js`

- [ ] **Step 1: Opprett fil med imports og caches**

Opprett `server/businessCentral/itemLedgerEntriesService.js` med følgende innledning:

```javascript
import { getBcToken, invalidateBcTokenCache } from './auth.js';

const CONSUMPTION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min – tungt aggregat
let consumptionCache = { data: null, expiresAt: 0 };

let companyNameCache = null;
```

`companyNameCache` dupliseres fra `inventoryByLocationService.js` med vilje – refaktorering til delt helper er flagget som egen oppgave i spec'en og er ikke i scope her.

- [ ] **Step 2: Legg til `resolveCompanyName(token)`**

Kopier hele `resolveCompanyName`-funksjonen fra `server/businessCentral/inventoryByLocationService.js` (linjer 7–31) inn i den nye fila. Bytt log-prefiks fra `[BC invByLoc]` til `[BC ledger]`. Funksjonen er privat – ikke eksporter.

- [ ] **Step 3: Legg til ren klassifiseringsfunksjon `classifyMovement` med JSDoc**

Etter `resolveCompanyName`, legg til:

```javascript
/**
 * Klassifiserer en BC ItemLedgerEntry som "uttak" eller "innskudd" for
 * forbruksberegning. Brukes til å summere |Quantity| for uttak siste 30/90 dager.
 *
 * Verifisert mot NEAS-data (scripts/probe-bc-item-ledger.mjs):
 * dominerende Entry_Type er Sale, Negative Adjmt., Transfer.
 *
 * @param {string} entryType   BC `Entry_Type`
 * @param {number} quantity    BC `Quantity` (signert: negativ = uttak fra lager)
 * @returns {'uttak' | 'innskudd' | 'overforing' | 'annet'}
 *
 * @example
 *   classifyMovement('Sale', -3)              // 'uttak'
 *   classifyMovement('Purchase', 20)          // 'innskudd'
 *   classifyMovement('Negative Adjmt.', -1)   // 'uttak'
 *   classifyMovement('Positive Adjmt.', 5)    // 'innskudd'
 *   classifyMovement('Transfer', -2)          // 'overforing'   (negativ side, ikke regnet som forbruk)
 *   classifyMovement('Transfer', 2)           // 'overforing'
 *   classifyMovement('Consumption', -4)       // 'uttak'
 *   classifyMovement('Output', 10)            // 'innskudd'
 */
export function classifyMovement(entryType, quantity) {
  if (entryType === 'Transfer') return 'overforing';
  if (entryType === 'Sale' || entryType === 'Consumption' || entryType === 'Negative Adjmt.') {
    return 'uttak';
  }
  if (entryType === 'Purchase' || entryType === 'Output' || entryType === 'Positive Adjmt.') {
    return 'innskudd';
  }
  return 'annet';
}
```

Begrunnelse for valg: `Transfer` ekskluderes fra forbruksaggregatet fordi en overføring mellom NEAS-lokasjoner ikke er reelt forbruk – det er bare en flytting. Hvis vi inkluderte den ville samme bevegelse telt på begge sider (positiv på mottakende lokasjon, negativ på sendende).

- [ ] **Step 4: Verifiser at fila parser**

Kjør fra prosjektrot:
```bash
node -e "import('./server/businessCentral/itemLedgerEntriesService.js').then(m => console.log(Object.keys(m)))"
```

Forventet output: `[ 'classifyMovement' ]`. Hvis feil – sjekk syntaks.

**Acceptance:** Fila finnes, `classifyMovement` eksporteres med JSDoc som dekker alle fem retur-grener.

---

## Oppgave 2: `getItemConsumption()` – aggregat siste 90 dager

**Files:**
- Modify: `server/businessCentral/itemLedgerEntriesService.js`

- [ ] **Step 1: Skriv `fetchEntriesLast90Days(token)`**

Legg til intern (ikke-eksportert) funksjon som henter alle ItemLedgerEntries siste 90 dager via paginering. Bruk samme mønster som `fetchOpenLedgerPages` i `inventoryByLocationService.js`:

```javascript
async function fetchEntriesLast90Days(token) {
  const companyName = await resolveCompanyName(token);
  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/ODataV4`;
  const companyUrl = `${base}/Company('${encodeURIComponent(companyName)}')`;

  const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().substring(0, 10);
  const filter = encodeURIComponent(`Posting_Date ge ${fromDate}`);
  const select = 'Item_No,Posting_Date,Entry_Type,Quantity';
  let url = `${companyUrl}/ItemLedgerEntries?$filter=${filter}&$select=${select}&$top=10000`;

  const rows = [];
  let pages = 0;
  while (url) {
    pages++;
    console.log(`[BC ledger] consumption side ${pages}…`);
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[BC ledger] API-feil ${resp.status}:`, body.substring(0, 300));
      const err = new Error(`BC API feilet (${resp.status})`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    const data = await resp.json();
    rows.push(...(data.value ?? []));
    url = data['@odata.nextLink'] ?? null;
  }
  console.log(`[BC ledger] consumption hentet ${rows.length} entries over ${pages} side(r)`);
  return rows;
}
```

- [ ] **Step 2: Skriv ren aggregeringsfunksjon `aggregateConsumption(rows)` med JSDoc**

```javascript
/**
 * Aggregerer ItemLedgerEntry-rader til per-vare-forbruk siste 30 og 90 dager,
 * samt dato for siste bevegelse.
 *
 * Kun rader klassifisert som 'uttak' (Sale, Consumption, Negative Adjmt.)
 * telles som forbruk. `Transfer` ekskluderes for å unngå dobbelttelling
 * mellom lokasjoner. `Innskudd` (Purchase/Output/Positive Adjmt.) bidrar
 * til `lastMovementDate` men ikke til forbruk.
 *
 * @param {Array<{Item_No: string, Posting_Date: string, Entry_Type: string, Quantity: number}>} rows
 * @param {Date} [now=new Date()]  Referansetidspunkt (eksponert for testbarhet)
 * @returns {Record<string, { last30d: number, last90d: number, lastMovementDate: string | null }>}
 *
 * @example
 *   aggregateConsumption([
 *     { Item_No: 'A', Posting_Date: '2026-05-15', Entry_Type: 'Sale',     Quantity: -3 },
 *     { Item_No: 'A', Posting_Date: '2026-04-01', Entry_Type: 'Sale',     Quantity: -2 },
 *     { Item_No: 'A', Posting_Date: '2026-05-10', Entry_Type: 'Transfer', Quantity: -1 },
 *   ], new Date('2026-05-20'))
 *   // → { A: { last30d: 3, last90d: 5, lastMovementDate: '2026-05-15' } }
 */
export function aggregateConsumption(rows, now = new Date()) {
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms90 = 90 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const result = {};

  for (const r of rows) {
    if (!r.Item_No || !r.Posting_Date) continue;
    const cur = result[r.Item_No] ??= { last30d: 0, last90d: 0, lastMovementDate: null };

    if (!cur.lastMovementDate || r.Posting_Date > cur.lastMovementDate) {
      cur.lastMovementDate = r.Posting_Date;
    }

    const klass = classifyMovement(r.Entry_Type, r.Quantity ?? 0);
    if (klass !== 'uttak') continue;

    const qty = Math.abs(r.Quantity ?? 0);
    const ageMs = nowMs - new Date(r.Posting_Date).getTime();
    if (ageMs <= ms30) cur.last30d += qty;
    if (ageMs <= ms90) cur.last90d += qty;
  }

  return result;
}
```

- [ ] **Step 3: Skriv eksportert `getItemConsumption()` med cache og 401-retry**

```javascript
export async function getItemConsumption() {
  if (consumptionCache.data && Date.now() < consumptionCache.expiresAt) {
    console.log('[BC ledger] consumption cache-treff');
    return consumptionCache.data;
  }

  let token = await getBcToken();
  try {
    const rows = await fetchEntriesLast90Days(token);
    const data = aggregateConsumption(rows);
    consumptionCache = { data, expiresAt: Date.now() + CONSUMPTION_CACHE_TTL_MS };
    return data;
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC ledger] 401 – invaliderer token og prøver igjen');
      invalidateBcTokenCache();
      token = await getBcToken();
      const rows = await fetchEntriesLast90Days(token);
      const data = aggregateConsumption(rows);
      consumptionCache = { data, expiresAt: Date.now() + CONSUMPTION_CACHE_TTL_MS };
      return data;
    }
    throw err;
  }
}

export function invalidateConsumptionCache() {
  consumptionCache = { data: null, expiresAt: 0 };
  console.log('[BC ledger] consumption cache invalidert');
}
```

- [ ] **Step 4: Verifiser aggregeringen manuelt**

Kjør fra prosjektrot:
```bash
node -e "import('./server/businessCentral/itemLedgerEntriesService.js').then(async m => { const a = m.aggregateConsumption([{Item_No:'A',Posting_Date:'2026-05-15',Entry_Type:'Sale',Quantity:-3},{Item_No:'A',Posting_Date:'2026-04-01',Entry_Type:'Sale',Quantity:-2},{Item_No:'A',Posting_Date:'2026-05-10',Entry_Type:'Transfer',Quantity:-1}], new Date('2026-05-20')); console.log(JSON.stringify(a, null, 2)); })"
```

Forventet:
```json
{ "A": { "last30d": 3, "last90d": 5, "lastMovementDate": "2026-05-15" } }
```

**Acceptance:** `getItemConsumption` returnerer et map fra varenr til `{last30d, last90d, lastMovementDate}`, cacher i 30 min, retry'er ved 401.

---

## Oppgave 3: `getItemLedgerEntries(itemNumber, fromDate)` – per-vare-historikk

**Files:**
- Modify: `server/businessCentral/itemLedgerEntriesService.js`

- [ ] **Step 1: Skriv funksjonen**

```javascript
/**
 * Henter full bevegelseshistorikk for én vare, sortert nyeste først.
 * Ingen server-side cache – frontend bruker TanStack Query (5 min staleTime).
 *
 * @param {string} itemNumber     Eksakt match på BC `Item_No`
 * @param {string} [fromDate]     ISO-dato (YYYY-MM-DD). Default: ett år tilbake
 * @returns {Promise<Array<object>>}  Råe BC-rader (ikke transformerte feltnavn)
 */
export async function getItemLedgerEntries(itemNumber, fromDate) {
  if (!itemNumber || typeof itemNumber !== 'string') {
    const err = new Error('itemNumber er påkrevd');
    err.status = 400;
    throw err;
  }
  // Beskytt mot OData-injeksjon: BC bruker '' for å escape enkeltfnutt.
  const safeItem = itemNumber.replace(/'/g, "''");
  const from = fromDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString().substring(0, 10);

  const fetchOnce = async (token) => {
    const companyName = await resolveCompanyName(token);
    const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/ODataV4`;
    const filter = encodeURIComponent(`Item_No eq '${safeItem}' and Posting_Date ge ${from}`);
    const select = 'Entry_No,Item_No,Posting_Date,Entry_Type,Document_No,Document_Type,' +
      'Location_Code,Quantity,Remaining_Quantity,Item_Description,Unit_of_Measure_Code';
    const url = `${base}/Company('${encodeURIComponent(companyName)}')/ItemLedgerEntries` +
      `?$filter=${filter}&$select=${select}&$orderby=Posting_Date desc,Entry_No desc&$top=1000`;

    console.log(`[BC ledger] entries for ${itemNumber} fra ${from}`);
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!resp.ok) {
      const body = await resp.text();
      const err = new Error(`BC API feilet (${resp.status})`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    const data = await resp.json();
    return data.value ?? [];
  };

  let token = await getBcToken();
  try {
    return await fetchOnce(token);
  } catch (err) {
    if (err.status === 401) {
      invalidateBcTokenCache();
      token = await getBcToken();
      return await fetchOnce(token);
    }
    throw err;
  }
}
```

Per-vare-historikk pagineres ikke (vi setter `$top=1000`); det er svært lite sannsynlig at én vare har > 1000 bevegelser siste år hos NEAS. Hvis det skjer, viser vi de 1000 nyeste – akseptabelt for Fase 1.

- [ ] **Step 2: Verifiser mot ekte vare**

Bruk en varenr du finner i probe-output (eller spør gjennom curl mot proxy senere). Test:
```bash
node -e "import('dotenv/config').then(()=>import('./server/businessCentral/itemLedgerEntriesService.js')).then(async m => { const r = await m.getItemLedgerEntries('<VARENR>'); console.log('Antall:', r.length); console.log(r.slice(0,3)); })"
```

**Acceptance:** Returnerer array med rader, nyeste først. Avviser tom/ikke-string `itemNumber` med 400. Retry ved 401.

---

## Oppgave 4: Berik items med `consumption`

**Files:**
- Modify: `server/businessCentral/itemsService.js`

- [ ] **Step 1: Importer**

Etter linje 3 (`import { getOpenOrdersByItem } from './purchaseOrdersService.js';`), legg til:

```javascript
import { getItemConsumption } from './itemLedgerEntriesService.js';
```

- [ ] **Step 2: Legg til berikelsesfunksjon**

Etter `enrichWithOpenOrders` (rundt linje 74), legg til:

```javascript
async function enrichWithConsumption(items) {
  try {
    const byItem = await getItemConsumption();
    return items.map((item) => ({
      ...item,
      consumption: byItem[item.number] ?? { last30d: 0, last90d: 0, lastMovementDate: null },
    }));
  } catch (err) {
    console.warn('[BC items] Kunne ikke hente consumption – returnerer uten:', err.message);
    return items.map((item) => ({
      ...item,
      consumption: { last30d: 0, last90d: 0, lastMovementDate: null },
    }));
  }
}
```

- [ ] **Step 3: Kjede inn i `getBcItems`**

Erstatt begge stedene i `getBcItems` (rundt linje 80 og linje 87) der det står:

```javascript
return await enrichWithOpenOrders(await enrichWithInventoryByLocation(items));
```

med:

```javascript
return await enrichWithConsumption(
  await enrichWithOpenOrders(await enrichWithInventoryByLocation(items)),
);
```

**Acceptance:** Hver item har `consumption: { last30d, last90d, lastMovementDate }`. Feiler graceful – returnerer nullverdier hvis ledger-API er nede.

---

## Oppgave 5: To nye ruter i `index.js`

**Files:**
- Modify: `server/businessCentral/index.js`

- [ ] **Step 1: Importer**

Etter linje 3 (`import { getBcPurchaseOrders } …`), legg til:

```javascript
import { getItemConsumption, getItemLedgerEntries } from './itemLedgerEntriesService.js';
```

- [ ] **Step 2: Legg til ruter etter `/purchase-orders` (etter linje 58)**

```javascript
router.get('/item-consumption', async (req, res) => {
  const start = Date.now();
  try {
    const consumption = await getItemConsumption();
    console.log(`[BC router] /item-consumption → ${Object.keys(consumption).length} varer, ${Date.now() - start}ms`);
    res.json({ consumption, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/item-consumption');
  }
});

router.get('/item-ledger-entries', async (req, res) => {
  const start = Date.now();
  const { itemNumber, fromDate } = req.query;
  if (!itemNumber || typeof itemNumber !== 'string') {
    return res.status(400).json({ error: 'Mangler `itemNumber` query-parameter' });
  }
  try {
    const rawEntries = await getItemLedgerEntries(itemNumber, fromDate);
    const entries = rawEntries.map((r) => ({
      entryNo: r.Entry_No,
      itemNumber: r.Item_No,
      postingDate: r.Posting_Date,
      entryType: r.Entry_Type,
      documentNumber: r.Document_No,
      documentType: r.Document_Type,
      locationCode: r.Location_Code ?? 'UKJENT',
      quantity: r.Quantity ?? 0,
      remainingQuantity: r.Remaining_Quantity ?? 0,
      description: r.Item_Description ?? '',
      unitOfMeasureCode: r.Unit_of_Measure_Code ?? '',
    }));
    console.log(`[BC router] /item-ledger-entries(${itemNumber}) → ${entries.length} rader, ${Date.now() - start}ms`);
    res.json({ entries, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, `/item-ledger-entries(${itemNumber})`);
  }
});
```

Felttransformasjon (snake → camel) skjer her, *ikke* i `getItemLedgerEntries`, slik at service-funksjonen forblir gjenbrukbar for evt. fremtidig server-side bruk med BC-feltnavn.

- [ ] **Step 3: Verifiser at proxy starter**

```bash
npm run proxy
```

Sjekk at output viser ingen feil. Stopp deretter (`Ctrl+C`).

**Acceptance:** Begge ruter eksisterer; `index.js` har gyldig syntaks; proxy starter uten feil.

---

## Oppgave 6: TypeScript-typer

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Finn `BcItem`-interfacet**

Søk i `src/types/index.ts` etter `interface BcItem` for å lokalisere riktig sted.

- [ ] **Step 2: Legg til nye typer rett før `BcItem`**

```typescript
export type BcItemLedgerEntryType =
  | 'Purchase' | 'Sale' | 'Positive Adjmt.' | 'Negative Adjmt.'
  | 'Transfer' | 'Consumption' | 'Output';

export interface BcItemLedgerEntry {
  entryNo: number;
  itemNumber: string;
  postingDate: string;
  entryType: BcItemLedgerEntryType | string; // string-fallback for ukjente typer fra BC
  documentNumber: string;
  documentType: string;
  locationCode: string;
  quantity: number;
  remainingQuantity: number;
  description: string;
  unitOfMeasureCode: string;
}

export interface BcItemConsumption {
  last30d: number;
  last90d: number;
  lastMovementDate: string | null;
}

export interface BcItemLedgerEntriesResponse {
  entries: BcItemLedgerEntry[];
  fetchedAt: string;
}
```

- [ ] **Step 3: Utvid `BcItem`**

Legg til feltet `consumption: BcItemConsumption;` (påkrevd – server beriker alltid, evt. med nullverdier).

- [ ] **Step 4: Verifiser typesjekk**

```bash
npm run build
```

Forventet: passerer uten feil (eller bare allerede eksisterende feil hvis noen).

**Acceptance:** Build passerer; `BcItem.consumption` er typesatt; `BcItemLedgerEntry` finnes.

---

## Oppgave 7: Frontend-service

**Files:**
- Modify: `src/services/bcService.ts`

- [ ] **Step 1: Legg til ny fetcher**

```typescript
import type {
  BcItemsResponse, BcLocationsResponse, BcPurchaseOrdersResponse,
  BcItemLedgerEntriesResponse,
} from '../types';

export async function fetchBcItemLedgerEntries(
  itemNumber: string,
  fromDate?: string,
): Promise<BcItemLedgerEntriesResponse> {
  const params = new URLSearchParams({ itemNumber });
  if (fromDate) params.set('fromDate', fromDate);
  const resp = await getApi().get<BcItemLedgerEntriesResponse>(
    `/api/bc/item-ledger-entries?${params.toString()}`,
  );
  return resp.data;
}
```

Ingen separat consumption-fetcher: feltet er allerede beriket på `BcItem` via `/api/bc/items`.

**Acceptance:** Build passerer; ny eksport tilgjengelig.

---

## Oppgave 8: LagerTab – kolonner, sortering, toggle, expand

**Files:**
- Modify: `src/pages/Lager/LagerTab.tsx`
- Modify: `src/pages/Lager/Lager.module.css`

- [ ] **Step 1: Importer ny query og service**

Øverst i `LagerTab.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchBcItemLedgerEntries } from '../../services/bcService';
import type { BcItemLedgerEntry } from '../../types';
```

- [ ] **Step 2: Utvid `SortField`-typen**

Erstatt:
```typescript
type SortField = 'number' | 'displayName' | 'inventory';
```
med:
```typescript
type SortField = 'number' | 'displayName' | 'inventory' | 'consumption90d' | 'lastMovement';
```

- [ ] **Step 3: Legg til `hideDead`-state og helpers**

I komponentens state-blokk:
```typescript
const [hideDead, setHideDead] = useState(false);
```

Etter `inventoryClass`-helperen, legg til:

```typescript
function formatRelative(iso: string | null): string {
  if (!iso) return 'Ingen bevegelse';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'I dag';
  if (days === 1) return 'I går';
  if (days < 30) return `${days} d siden`;
  if (days < 365) return `${Math.floor(days / 30)} mnd siden`;
  return `${Math.floor(days / 365)} år siden`;
}

function isDead(item: BcItem): boolean {
  return (item.consumption?.last90d ?? 0) === 0;
}

function isStale(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > 365 * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Utvid filtrering og sortering**

I `filtered`-memoen, legg til etter eksisterende filtre:
```typescript
.filter((item) => (hideDead ? !isDead(item) : true))
```

I `sorted`-memoen, utvid switch-en for `sortField`:
```typescript
case 'consumption90d':
  return (a.consumption?.last90d ?? 0) - (b.consumption?.last90d ?? 0);
case 'lastMovement': {
  const aTime = a.consumption?.lastMovementDate ? new Date(a.consumption.lastMovementDate).getTime() : 0;
  const bTime = b.consumption?.lastMovementDate ? new Date(b.consumption.lastMovementDate).getTime() : 0;
  return aTime - bTime;
}
```

- [ ] **Step 5: Legg til toolbar-toggle**

Ved siden av eksisterende "Skjul tomt lager"-toggle, legg til:
```tsx
<label className={styles.toggle}>
  <input type="checkbox" checked={hideDead} onChange={(e) => setHideDead(e.target.checked)} />
  Skjul døde varer (0 forbruk 90d)
</label>
```

- [ ] **Step 6: Legg til to nye tabellkolonner**

I tabell-header:
```tsx
<th onClick={() => toggleSort('consumption90d')} className={styles.sortable}>
  Forbruk 90d{sortIcon('consumption90d', sortField, sortDir)}
</th>
<th onClick={() => toggleSort('lastMovement')} className={styles.sortable}>
  Sist beveget{sortIcon('lastMovement', sortField, sortDir)}
</th>
```

I tabell-rad (samme posisjon i samme rekkefølge):
```tsx
<td className={styles.right}>
  <span className={(item.consumption?.last90d ?? 0) === 0 ? styles.inventoryDead : ''}>
    {item.consumption?.last90d ?? 0}
  </span>
</td>
<td>
  {isStale(item.consumption?.lastMovementDate ?? null) ? (
    <span className={styles.lastMovementBadgeStale} title="Ingen bevegelse siste 365 dager">
      {formatRelative(item.consumption?.lastMovementDate ?? null)}
    </span>
  ) : (
    <span className={styles.lastMovementBadgeOk}>
      {formatRelative(item.consumption?.lastMovementDate ?? null)}
    </span>
  )}
</td>
```

- [ ] **Step 7: Lag underkomponent `MovementsList` for expand-rad**

I bunnen av samme fil:

```tsx
function MovementsList({ itemNumber }: { itemNumber: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bc-item-ledger', itemNumber],
    queryFn: () => fetchBcItemLedgerEntries(itemNumber),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <div className={styles.movementsLoading}>Laster bevegelser…</div>;
  if (isError) return <div className={styles.movementsError}>Kunne ikke laste bevegelser.</div>;
  const entries = data?.entries ?? [];
  if (entries.length === 0) return <div className={styles.movementsEmpty}>Ingen bevegelser siste år.</div>;

  return (
    <table className={styles.movementsTable}>
      <thead>
        <tr>
          <th>Dato</th><th>Type</th><th>Dok.nr</th><th>Lokasjon</th>
          <th className={styles.right}>Antall</th>
        </tr>
      </thead>
      <tbody>
        {entries.slice(0, 50).map((e: BcItemLedgerEntry) => (
          <tr key={e.entryNo}>
            <td>{formatDate(e.postingDate)}</td>
            <td><span className={movementBadgeClass(e.entryType)}>{e.entryType}</span></td>
            <td className={styles.mono}>{e.documentNumber}</td>
            <td>{e.locationCode}</td>
            <td className={`${styles.right} ${e.quantity < 0 ? styles.qtyNeg : styles.qtyPos}`}>
              {e.quantity > 0 ? '+' : ''}{e.quantity}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function movementBadgeClass(entryType: string): string {
  switch (entryType) {
    case 'Sale':            return styles.movementBadgeSale;
    case 'Purchase':        return styles.movementBadgePurchase;
    case 'Transfer':        return styles.movementBadgeTransfer;
    case 'Positive Adjmt.': return styles.movementBadgeAdjPos;
    case 'Negative Adjmt.': return styles.movementBadgeAdjNeg;
    default:                return styles.movementBadgeOther;
  }
}
```

- [ ] **Step 8: Vis `MovementsList` i expand-rad**

I expand-raden, etter den eksisterende lokasjonsfordelingen, legg til:
```tsx
<MovementsList itemNumber={item.number} />
```

- [ ] **Step 9: CSS – nye klasser**

I `src/pages/Lager/Lager.module.css`, legg til (tilpass farger til eksisterende palett):

```css
.inventoryDead { color: var(--color-text-muted); opacity: 0.6; }
.lastMovementBadgeOk { color: var(--color-text); }
.lastMovementBadgeStale { color: var(--color-danger); font-weight: 500; }
.movementsTable { width: 100%; margin-top: 0.75rem; font-size: 0.85rem; }
.movementsTable th { text-align: left; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--color-border); }
.movementsTable td { padding: 0.25rem 0.5rem; }
.movementsLoading, .movementsEmpty, .movementsError {
  padding: 0.75rem; color: var(--color-text-muted); font-style: italic;
}
.movementsError { color: var(--color-danger); }
.qtyPos { color: var(--color-success); }
.qtyNeg { color: var(--color-danger); }
.movementBadgeSale,
.movementBadgePurchase,
.movementBadgeTransfer,
.movementBadgeAdjPos,
.movementBadgeAdjNeg,
.movementBadgeOther {
  display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px;
  font-size: 0.75rem; font-weight: 500;
}
.movementBadgeSale     { background: var(--color-info-bg);    color: var(--color-info); }
.movementBadgePurchase { background: var(--color-success-bg); color: var(--color-success); }
.movementBadgeTransfer { background: var(--color-accent-bg);  color: var(--color-accent); }
.movementBadgeAdjPos   { background: var(--color-success-bg); color: var(--color-success); }
.movementBadgeAdjNeg   { background: var(--color-warning-bg); color: var(--color-warning); }
.movementBadgeOther    { background: var(--color-bg-alt);     color: var(--color-text-muted); }
```

Hvis noen av disse CSS-variablene ikke finnes i eksisterende palett – sjekk `Lager.module.css` for hvilke som faktisk er definert og bruk nærmeste motstykke. Ikke definer nye globale variabler i denne planen.

- [ ] **Step 10: Verifiser build + lint**

```bash
npm run build
npm run lint
```

**Acceptance:** Build og lint passerer; LagerTab har to nye kolonner, ny toggle, og expand viser bevegelser.

---

## Oppgave 9: Manuell ende-til-ende-verifisering

- [ ] **Step 1: Start dev-miljø**

```bash
npm start
```

- [ ] **Step 2: Last Lager-fanen**

Åpne http://localhost:5173/, naviger til Lager.

- [ ] **Step 3: Verifiser nye kolonner**
- "Forbruk 90d" viser tall (eller 0/dempet for varer uten uttak).
- "Sist beveget" viser relativ tid eller rødt "Ingen bevegelse"-badge.
- Klikk på header-kolonnen for å sortere – stigende/synkende.

- [ ] **Step 4: Verifiser "Skjul døde varer"-toggle**
- Hak av → rader med 0 forbruk forsvinner.
- Hak av → rader kommer tilbake.

- [ ] **Step 5: Verifiser bevegelseslogg**
- Ekspander en vare som du vet har bevegelser (f.eks. høyt forbruk 90d).
- Bekreft at tabellen viser dato, type-badge, dok.nr, lokasjon, antall.
- Negative tall (uttak) er røde, positive er grønne.
- Type-badge har farge: Sale=blå, Purchase=grønn, Transfer=accent, Negative Adjmt.=oransje.

- [ ] **Step 6: Verifiser at consumption-feilkomponering ikke knekker Lager**

Stopp `npm start`, simuler feil ved midlertidig å bytte URL i `itemLedgerEntriesService.js` til `/ItemLedgerEntriesXXX` (typo). Start på nytt. Lager-fanen skal fortsatt laste, men alle varer viser "Forbruk 90d = 0" og "Ingen bevegelse". Tilbakestill typoen.

- [ ] **Step 7: Verifiser ingen regresjon**
- Bestillinger-fanen laster og fungerer som før.
- Krysslinking varenr Bestillinger → Lager fungerer.
- Eksisterende kolonner og expand-innhold uendret.

**Acceptance:** Alle steg over verifisert i browser. Skjermbilder/notater dokumenteres i PR-beskrivelse om ønskelig.

---

## Definisjon av ferdig

- [ ] `itemLedgerEntriesService.js` har `getItemConsumption`, `getItemLedgerEntries`, `classifyMovement`, `aggregateConsumption` – alle eksportert, alle med JSDoc.
- [ ] `aggregateConsumption` og `classifyMovement` har JSDoc med worked examples som dekker alle grener.
- [ ] To nye ruter (`/item-consumption`, `/item-ledger-entries`) eksisterer i `index.js` med standard `handleBcError`.
- [ ] `itemsService.js` beriker hver vare med `consumption` (feiler graceful).
- [ ] `BcItemLedgerEntry`, `BcItemConsumption`, `BcItemLedgerEntriesResponse` finnes i `src/types/index.ts`; `BcItem.consumption` påkrevd.
- [ ] `LagerTab` viser "Forbruk 90d" + "Sist beveget", sorterbart, med "Skjul døde varer"-toggle og bevegelseslogg i expand.
- [ ] CSS for nye badges og dempet/farget tekst.
- [ ] `npm run build` og `npm run lint` passerer.
- [ ] Ende-til-ende verifisert manuelt (Oppgave 9).
- [ ] Ingen regresjon i Bestillinger-fanen.
