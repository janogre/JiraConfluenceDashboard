# Lager – Bestillinger og lokasjoner – Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utvid Lager-siden med en Bestillinger-fane som viser åpne innkjøpsordrer med linjer fra Business Central, med to-veis navigasjon mellom faner via varenummer.

**Architecture:** To nye server-side tjenester (`locationsService.js`, `purchaseOrdersService.js`) følger eksisterende mønster fra `itemsService.js`. Lager-siden refaktoreres til en tab-container med to sub-komponenter (`LagerTab`, `BestillingerTab`). Lokasjoner caches 24 timer server-side; bestillinger bruker TanStack Query (staleTime 5 min) på frontend.

**Tech Stack:** Node.js ES modules (server), React 19 + TypeScript + TanStack Query + CSS Modules (frontend), lucide-react for ikoner.

---

## Filstruktur

**Nye filer:**
- `server/businessCentral/locationsService.js` – henter og cacher lokasjoner 24h
- `server/businessCentral/purchaseOrdersService.js` – henter ordrer med linjer, beriker locationCode
- `src/pages/Lager/LagerTab.tsx` – eksisterende lager-innhold (uttrukket fra Lager.tsx)
- `src/pages/Lager/BestillingerTab.tsx` – ny bestillinger-tabell

**Modifiserte filer:**
- `server/businessCentral/index.js` – to nye ruter: GET /locations, GET /purchase-orders
- `src/types/index.ts` – nye typer: BcLocation, BcLocationsResponse, BcPurchaseOrder, BcPurchaseOrderLine, BcPurchaseOrdersResponse
- `src/services/bcService.ts` – to nye funksjoner: fetchBcLocations, fetchBcPurchaseOrders
- `src/pages/Lager/Lager.tsx` – refaktoreres til tab-container
- `src/pages/Lager/Lager.module.css` – nye stiler for faner, ordretabell, linjetabell

---

## Task 1: TypeScript-typer

**Files:**
- Modify: `src/types/index.ts` (legg til etter linje 274, etter `BcItemsResponse`)

- [ ] **Steg 1: Legg til typer i `src/types/index.ts`**

Legg til følgende rett etter den eksisterende `BcItemsResponse`-interfacen (etter linje 274):

```ts
export interface BcLocation {
  id: string;
  code: string;
  displayName: string;
}

export interface BcLocationsResponse {
  locations: BcLocation[];
  neasLocationCodes: string[];
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
  purchaseOrderLines: BcPurchaseOrderLine[];
}

export interface BcPurchaseOrdersResponse {
  orders: BcPurchaseOrder[];
  fetchedAt: string;
}
```

- [ ] **Steg 2: Verifiser TypeScript-kompilering**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: legg til BC-typer for lokasjoner og innkjøpsordrer"
```

---

## Task 2: `locationsService.js`

**Files:**
- Create: `server/businessCentral/locationsService.js`

- [ ] **Steg 1: Opprett `server/businessCentral/locationsService.js`**

```js
import { getBcToken, invalidateBcTokenCache } from './auth.js';

// Lokasjoner endres sjelden – cache i 24 timer
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let locationsCache = { data: null, expiresAt: 0 };

// NEAS-relevante lokasjoner – øvrige tilhører eksterne aktører
export const NEAS_LOCATION_CODES = [
  'M1', 'OPPDAL HK', 'RØROS HK', 'CAMPUS', 'DIR', 'SINUS BNN', 'SINUS SSJ',
];

async function fetchLocationsFromBc(token) {
  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/api/v2.0`;
  const url = `${base}/companies(${process.env.BC_COMPANY_ID})/locations?$select=id,code,displayName`;

  console.log('[BC locations] Henter lokasjoner fra BC');
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error(`[BC locations] API-feil ${resp.status}:`, body.substring(0, 300));
    const err = new Error(`BC API feilet (${resp.status})`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  return data.value ?? [];
}

export async function getBcLocations() {
  if (locationsCache.data && Date.now() < locationsCache.expiresAt) {
    console.log('[BC locations] Cache-treff');
    return locationsCache.data;
  }

  let token = await getBcToken();
  try {
    const locations = await fetchLocationsFromBc(token);
    locationsCache = { data: locations, expiresAt: Date.now() + CACHE_TTL_MS };
    console.log(`[BC locations] ${locations.length} lokasjoner cachet i 24 timer`);
    return locations;
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC locations] 401 – invaliderer token-cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      const locations = await fetchLocationsFromBc(token);
      locationsCache = { data: locations, expiresAt: Date.now() + CACHE_TTL_MS };
      return locations;
    }
    throw err;
  }
}

export function invalidateBcLocationsCache() {
  locationsCache = { data: null, expiresAt: 0 };
  console.log('[BC locations] Cache invalidert');
}
```

- [ ] **Steg 2: Start proxy-server og verifiser at modulen laster uten feil**

```bash
npm run proxy
```

Forventet: serveren starter på port 3001 uten import-feil.

- [ ] **Steg 3: Commit**

```bash
git add server/businessCentral/locationsService.js
git commit -m "feat: legg til locationsService med 24h cache"
```

---

## Task 3: `purchaseOrdersService.js`

**Files:**
- Create: `server/businessCentral/purchaseOrdersService.js`

- [ ] **Steg 1: Opprett `server/businessCentral/purchaseOrdersService.js`**

```js
import { getBcToken, invalidateBcTokenCache } from './auth.js';
import { getBcLocations } from './locationsService.js';

async function fetchAllPages(token) {
  const select =
    'id,number,orderDate,vendorNumber,vendorName,status,shipToName,purchaser,fullyReceived,lastModifiedDateTime';
  const expand =
    'purchaseOrderLines($select=lineObjectNumber,description,quantity,receivedQuantity,' +
    'invoicedQuantity,expectedReceiptDate,locationId,unitOfMeasureCode)';
  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/api/v2.0`;
  let url =
    `${base}/companies(${process.env.BC_COMPANY_ID})/purchaseOrders` +
    `?$select=${select}&$expand=${expand}&$orderby=orderDate desc&$top=1000`;

  const orders = [];
  let pageCount = 0;

  while (url) {
    pageCount++;
    console.log(`[BC orders] Henter side ${pageCount}: ${url.substring(0, 120)}…`);

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[BC orders] API-feil ${resp.status}:`, body.substring(0, 300));
      const err = new Error(`BC API feilet (${resp.status})`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }

    const data = await resp.json();
    orders.push(...(data.value ?? []));
    url = data['@odata.nextLink'] ?? null;
  }

  console.log(`[BC orders] Totalt ${orders.length} ordrer hentet over ${pageCount} side(r)`);
  return orders;
}

async function enrichWithLocationCodes(orders) {
  const locations = await getBcLocations();
  const locationMap = new Map(locations.map((l) => [l.id, l.code]));

  return orders.map((order) => ({
    ...order,
    purchaseOrderLines: (order.purchaseOrderLines ?? []).map((line) => {
      const locationCode = locationMap.get(line.locationId);
      if (!locationCode && line.locationId) {
        console.warn(`[BC orders] Ukjent locationId: ${line.locationId} – setter UKJENT`);
      }
      return { ...line, locationCode: locationCode ?? 'UKJENT' };
    }),
  }));
}

export async function getBcPurchaseOrders() {
  let token = await getBcToken();
  try {
    const orders = await fetchAllPages(token);
    return await enrichWithLocationCodes(orders);
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC orders] 401 – invaliderer token-cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      const orders = await fetchAllPages(token);
      return await enrichWithLocationCodes(orders);
    }
    throw err;
  }
}
```

- [ ] **Steg 2: Start proxy-server og verifiser at modulen laster uten feil**

```bash
npm run proxy
```

Forventet: serveren starter på port 3001 uten import-feil.

- [ ] **Steg 3: Commit**

```bash
git add server/businessCentral/purchaseOrdersService.js
git commit -m "feat: legg til purchaseOrdersService med paginering og location-berikelse"
```

---

## Task 4: Nye ruter i `index.js`

**Files:**
- Modify: `server/businessCentral/index.js`

- [ ] **Steg 1: Erstatt hele `server/businessCentral/index.js` med**

```js
import { Router } from 'express';
import { getBcItems } from './itemsService.js';
import { getBcLocations, NEAS_LOCATION_CODES } from './locationsService.js';
import { getBcPurchaseOrders } from './purchaseOrdersService.js';

const router = Router();

function handleBcError(err, res, context) {
  console.error(`[BC router] ${context} feil:`, err.message);
  if (err.status === 401 || err.isAuthError) {
    return res.status(401).json({
      error: 'BC-autentisering feilet. Kontakt administrator – sjekk BC_CLIENT_SECRET i .env.',
    });
  }
  if (
    err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ||
    err.name === 'TimeoutError' || err.name === 'AbortError'
  ) {
    return res.status(503).json({ error: 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.' });
  }
  res.status(500).json({
    error: `Business Central returnerte en feil (HTTP ${err.status ?? 500}).`,
    detail: err.message,
  });
}

router.get('/items', async (req, res) => {
  const start = Date.now();
  try {
    const items = await getBcItems();
    console.log(`[BC router] /items → ${items.length} varer, ${Date.now() - start}ms`);
    res.json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/items');
  }
});

router.get('/locations', async (req, res) => {
  const start = Date.now();
  try {
    const locations = await getBcLocations();
    console.log(`[BC router] /locations → ${locations.length} lokasjoner, ${Date.now() - start}ms`);
    res.json({ locations, neasLocationCodes: NEAS_LOCATION_CODES, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/locations');
  }
});

router.get('/purchase-orders', async (req, res) => {
  const start = Date.now();
  try {
    const orders = await getBcPurchaseOrders();
    console.log(`[BC router] /purchase-orders → ${orders.length} ordrer, ${Date.now() - start}ms`);
    res.json({ orders, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/purchase-orders');
  }
});

export default router;
```

- [ ] **Steg 2: Start proxy-server og test manuelt**

```bash
npm run proxy
```

I et annet terminalvindu:
```bash
curl http://localhost:3001/api/bc/locations
```

Forventet: `{"locations":[...],"neasLocationCodes":[...],"fetchedAt":"..."}` eller en kjent feilmelding (auth/network) – ikke en JavaScript-feilkrasj.

```bash
curl http://localhost:3001/api/bc/purchase-orders
```

Forventet: `{"orders":[...],"fetchedAt":"..."}` (kan ta noen sekunder ved cache-miss).

- [ ] **Steg 3: Commit**

```bash
git add server/businessCentral/index.js
git commit -m "feat: legg til ruter for /locations og /purchase-orders"
```

---

## Task 5: `bcService.ts` – frontend-tjenester

**Files:**
- Modify: `src/services/bcService.ts`

- [ ] **Steg 1: Erstatt hele `src/services/bcService.ts` med**

```ts
import { getApi } from './api';
import type { BcItemsResponse, BcLocationsResponse, BcPurchaseOrdersResponse } from '../types';

export async function fetchBcItems(): Promise<BcItemsResponse> {
  const resp = await getApi().get<BcItemsResponse>('/api/bc/items');
  return resp.data;
}

export async function fetchBcLocations(): Promise<BcLocationsResponse> {
  const resp = await getApi().get<BcLocationsResponse>('/api/bc/locations');
  return resp.data;
}

export async function fetchBcPurchaseOrders(): Promise<BcPurchaseOrdersResponse> {
  const resp = await getApi().get<BcPurchaseOrdersResponse>('/api/bc/purchase-orders');
  return resp.data;
}
```

- [ ] **Steg 2: Verifiser TypeScript-kompilering**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/services/bcService.ts
git commit -m "feat: legg til fetchBcLocations og fetchBcPurchaseOrders i bcService"
```

---

## Task 6: `LagerTab.tsx` – uttrukket lager-innhold

**Files:**
- Create: `src/pages/Lager/LagerTab.tsx`

Dette er i hovedsak eksisterende `Lager.tsx`-innhold, tilpasset med props for cross-tab-navigasjon.

- [ ] **Steg 1: Opprett `src/pages/Lager/LagerTab.tsx`**

```tsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Package } from 'lucide-react';
import { fetchBcItems } from '../../services/bcService';
import type { BcItem } from '../../types';
import styles from './Lager.module.css';

type SortField = 'number' | 'displayName' | 'inventory';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function inventoryClass(n: number): string {
  if (n >= 10) return styles.inventoryGreen;
  if (n >= 1)  return styles.inventoryOrange;
  return styles.inventoryRed;
}

function sortIcon(field: SortField, current: SortField, dir: SortDir): string {
  if (field !== current) return ' ↕';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

interface Props {
  initialSearch?: string;
  onGoToBestillinger: (varenr: string) => void;
}

export function LagerTab({ initialSearch = '', onGoToBestillinger }: Props) {
  const [search, setSearch]         = useState(initialSearch);
  const [group, setGroup]           = useState('');
  const [hideEmpty, setHideEmpty]   = useState(false);
  const [sortField, setSortField]   = useState<SortField>('number');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['bc-items'],
    queryFn: fetchBcItems,
    staleTime: 1000 * 60 * 5,
  });

  const allGroups = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((i) => i.inventoryPostingGroupCode))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.items.filter((item) => {
      if (hideEmpty && item.inventory === 0) return false;
      if (group && item.inventoryPostingGroupCode !== group) return false;
      if (q && !item.number.toLowerCase().includes(q) && !item.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, group, hideEmpty]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'number')      cmp = a.number.localeCompare(b.number);
      if (sortField === 'displayName') cmp = a.displayName.localeCompare(b.displayName);
      if (sortField === 'inventory')   cmp = a.inventory - b.inventory;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const fetchedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
    : null;

  const errorMessage = (() => {
    if (!isError || !error) return null;
    const msg = (error as { response?: { data?: { error?: string } }; message?: string })
      ?.response?.data?.error ?? (error as Error).message;
    if (msg?.includes('autentisering')) return msg;
    if (msg?.includes('Business Central')) return msg;
    return 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.';
  })();

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Søk varenr / navn…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className={styles.select}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">Alle grupper</option>
          {allGroups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <label className={styles.toggleLabel}>
          <div
            className={`${styles.toggle} ${hideEmpty ? styles.toggleActive : ''}`}
            onClick={() => setHideEmpty((v) => !v)}
          />
          Skjul tomt lager
        </label>

        <button
          className={styles.refreshBtn}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} />
          {isFetching ? 'Henter…' : 'Oppdater'}
        </button>
      </div>

      {data && (
        <div className={styles.statusBar}>
          <span>
            Viser {sorted.length} av {data.items.length} varer
            {hideEmpty && ` (${data.items.filter(i => i.inventory === 0).length} med lager = 0 skjult)`}
          </span>
          {fetchedAt && <span>Hentet kl. {fetchedAt}</span>}
        </div>
      )}

      {isError && (
        <div className={styles.error}>
          <div className={styles.errorTitle}>⚠ Feil ved henting av lagerdata</div>
          <div className={styles.errorText}>{errorMessage}</div>
          <button className={styles.retryBtn} onClick={() => refetch()}>↻ Prøv igjen</button>
        </div>
      )}

      {isLoading && (
        <div className={styles.loading}>
          <Package size={20} />
          Henter lagerdata fra Business Central…
        </div>
      )}

      {data && !isError && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.sortable} onClick={() => toggleSort('number')}>
                  VARENR{sortIcon('number', sortField, sortDir)}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('displayName')}>
                  NAVN{sortIcon('displayName', sortField, sortDir)}
                </th>
                <th>BESKRIVELSE 2</th>
                <th>GRUPPE</th>
                <th
                  className={styles.sortable}
                  style={{ textAlign: 'right' }}
                  onClick={() => toggleSort('inventory')}
                >
                  LAGER{sortIcon('inventory', sortField, sortDir)}
                </th>
                <th>OPPDATERT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item: BcItem) => (
                <tr
                  key={item.number}
                  className={`${styles.row} ${item.inventory === 0 ? styles.rowEmpty : ''}`}
                >
                  <td className={styles.varenr}>{item.number}</td>
                  <td>{item.displayName}</td>
                  <td className={styles.desc2}>{item.displayName2 ?? ''}</td>
                  <td><span className={styles.groupBadge}>{item.inventoryPostingGroupCode}</span></td>
                  <td className={`${styles.inventory} ${inventoryClass(item.inventory)}`}>
                    {item.inventory}
                  </td>
                  <td className={styles.dateCell}>{formatDate(item.lastModifiedDateTime)}</td>
                  <td>
                    {item.inventory <= 3 && (
                      <button
                        className={styles.crossTabLink}
                        onClick={() => onGoToBestillinger(item.number)}
                        title="Vis bestillinger for denne varen"
                      >
                        Bestillinger →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                    Ingen varer matcher søket.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Steg 2: Verifiser TypeScript-kompilering**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/pages/Lager/LagerTab.tsx
git commit -m "feat: trekk ut LagerTab fra Lager.tsx med cross-tab-navigasjon"
```

---

## Task 7: `BestillingerTab.tsx`

**Files:**
- Create: `src/pages/Lager/BestillingerTab.tsx`

- [ ] **Steg 1: Opprett `src/pages/Lager/BestillingerTab.tsx`**

```tsx
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, ShoppingCart } from 'lucide-react';
import { fetchBcPurchaseOrders, fetchBcLocations } from '../../services/bcService';
import type { BcPurchaseOrder, BcPurchaseOrderLine } from '../../types';
import styles from './Lager.module.css';

type OrderSortField = 'number' | 'orderDate' | 'vendorName';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sortIcon(field: OrderSortField, current: OrderSortField, dir: SortDir): string {
  if (field !== current) return ' ↕';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

interface Props {
  initialSearch?: string;
  onGoToLager: (varenr: string) => void;
}

export function BestillingerTab({ initialSearch = '', onGoToLager }: Props) {
  const [search, setSearch]           = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [sortField, setSortField]     = useState<OrderSortField>('orderDate');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['bc-purchase-orders'],
    queryFn: fetchBcPurchaseOrders,
    staleTime: 1000 * 60 * 5,
  });

  // Locations hentes for NEAS-whitelist til dropdown
  const { data: locData } = useQuery({
    queryKey: ['bc-locations'],
    queryFn: fetchBcLocations,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const neasLocations: string[] = locData?.neasLocationCodes ?? [];

  const allVendors = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.orders.map((o) => o.vendorName))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.orders.filter((order) => {
      if (statusFilter && order.status !== statusFilter) return false;
      if (vendorFilter && order.vendorName !== vendorFilter) return false;
      if (locationFilter) {
        const hasLocation = order.purchaseOrderLines.some((l) => l.locationCode === locationFilter);
        if (!hasLocation) return false;
      }
      if (q) {
        const matchOrder = order.number.toLowerCase().includes(q) || order.vendorName.toLowerCase().includes(q);
        const matchLine = order.purchaseOrderLines.some((l) =>
          l.lineObjectNumber.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
        );
        if (!matchOrder && !matchLine) return false;
      }
      return true;
    });
  }, [data, search, statusFilter, locationFilter, vendorFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'number')    cmp = a.number.localeCompare(b.number);
      if (sortField === 'orderDate') cmp = a.orderDate.localeCompare(b.orderDate);
      if (sortField === 'vendorName') cmp = a.vendorName.localeCompare(b.vendorName);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: OrderSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function toggleOrder(id: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalLines = useMemo(
    () => (data?.orders ?? []).reduce((sum, o) => sum + o.purchaseOrderLines.length, 0),
    [data]
  );

  const fetchedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
    : null;

  const errorMessage = (() => {
    if (!isError || !error) return null;
    const msg = (error as { response?: { data?: { error?: string } }; message?: string })
      ?.response?.data?.error ?? (error as Error).message;
    if (msg?.includes('autentisering')) return msg;
    if (msg?.includes('Business Central')) return msg;
    return 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.';
  })();

  return (
    <div className={styles.tabContent}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Søk ordrenr / leverandør / vare…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Alle statuser</option>
          <option value="Open">Open</option>
          <option value="Draft">Draft</option>
        </select>

        <select className={styles.select} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
          <option value="">Alle lokasjoner</option>
          {neasLocations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <select className={styles.select} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">Alle leverandører</option>
          {allVendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <button className={styles.refreshBtn} onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} />
          {isFetching ? 'Henter…' : 'Oppdater'}
        </button>
      </div>

      {/* Statuslinje */}
      {data && (
        <div className={styles.statusBar}>
          <span>
            Viser {sorted.length} av {data.orders.length} ordrer · {totalLines} linjer totalt
          </span>
          {fetchedAt && <span>Hentet kl. {fetchedAt}</span>}
        </div>
      )}

      {/* Feilmelding */}
      {isError && (
        <div className={styles.error}>
          <div className={styles.errorTitle}>⚠ Feil ved henting av bestillinger</div>
          <div className={styles.errorText}>{errorMessage}</div>
          <button className={styles.retryBtn} onClick={() => refetch()}>↻ Prøv igjen</button>
        </div>
      )}

      {/* Laster */}
      {isLoading && (
        <div className={styles.loading}>
          <ShoppingCart size={20} />
          Henter innkjøpsordrer fra Business Central…
        </div>
      )}

      {/* Tabell */}
      {data && !isError && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '32px' }}></th>
                <th className={styles.sortable} onClick={() => toggleSort('number')}>
                  ORDRENR{sortIcon('number', sortField, sortDir)}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('orderDate')}>
                  DATO{sortIcon('orderDate', sortField, sortDir)}
                </th>
                <th className={styles.sortable} onClick={() => toggleSort('vendorName')}>
                  LEVERANDØR{sortIcon('vendorName', sortField, sortDir)}
                </th>
                <th>LEVERES TIL</th>
                <th>INNKJØPER</th>
                <th>STATUS</th>
                <th style={{ textAlign: 'right' }}>LINJER</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((order: BcPurchaseOrder) => {
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <React.Fragment key={order.id}>
                    <tr
                      className={`${styles.orderRow} ${order.status === 'Draft' ? styles.orderRowDraft : ''}`}
                      onClick={() => toggleOrder(order.id)}
                    >
                      <td className={styles.expandBtn}>{isExpanded ? '▼' : '▶'}</td>
                      <td className={styles.varenr}>{order.number}</td>
                      <td className={styles.dateCell}>{formatDate(order.orderDate)}</td>
                      <td>{order.vendorName}</td>
                      <td className={styles.dateCell}>{order.shipToName}</td>
                      <td className={styles.dateCell}>{order.purchaser}</td>
                      <td>
                        <span className={order.status === 'Open' ? styles.statusBadgeOpen : styles.statusBadgeDraft}>
                          {order.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className={styles.dateCell}>
                        {order.purchaseOrderLines.length}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={styles.linesRow}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <table className={styles.lineTable}>
                            <thead>
                              <tr>
                                <th>VARENR</th>
                                <th>BESKRIVELSE</th>
                                <th>LOKASJON</th>
                                <th style={{ textAlign: 'right' }}>BESTILT</th>
                                <th style={{ textAlign: 'right' }}>MOTTATT</th>
                                <th>ENHET</th>
                                <th>FORV. DATO</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.purchaseOrderLines.map((line: BcPurchaseOrderLine, idx) => (
                                <tr key={idx} className={styles.lineRow}>
                                  <td>
                                    <button
                                      className={styles.lineVarenr}
                                      onClick={(e) => { e.stopPropagation(); onGoToLager(line.lineObjectNumber); }}
                                      title="Vis i Lager-fanen"
                                    >
                                      {line.lineObjectNumber}
                                    </button>
                                  </td>
                                  <td>{line.description}</td>
                                  <td>
                                    <span className={styles.locationBadge}>{line.locationCode}</span>
                                  </td>
                                  <td style={{ textAlign: 'right' }} className={styles.dateCell}>{line.quantity}</td>
                                  <td
                                    style={{ textAlign: 'right' }}
                                    className={`${styles.dateCell} ${line.receivedQuantity >= line.quantity ? styles.receivedFull : ''}`}
                                  >
                                    {line.receivedQuantity}
                                  </td>
                                  <td className={styles.dateCell}>{line.unitOfMeasureCode}</td>
                                  <td className={styles.dateCell}>{formatDate(line.expectedReceiptDate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {sorted.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                    Ingen ordrer matcher søket.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Steg 2: Verifiser TypeScript-kompilering**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/pages/Lager/BestillingerTab.tsx
git commit -m "feat: legg til BestillingerTab med ordre-visning og expand/collapse"
```

---

## Task 8: Refaktorere `Lager.tsx` til tab-container

**Files:**
- Modify: `src/pages/Lager/Lager.tsx`

- [ ] **Steg 1: Erstatt hele `src/pages/Lager/Lager.tsx` med**

```tsx
import { useState } from 'react';
import { Package, ShoppingCart } from 'lucide-react';
import { LagerTab } from './LagerTab';
import { BestillingerTab } from './BestillingerTab';
import styles from './Lager.module.css';

type ActiveTab = 'lager' | 'bestillinger';

export function Lager() {
  const [activeTab, setActiveTab]           = useState<ActiveTab>('lager');
  const [lagerNavKey, setLagerNavKey]       = useState(0);
  const [lagerInitialSearch, setLagerInitialSearch] = useState('');
  const [bestNavKey, setBestNavKey]         = useState(0);
  const [bestInitialSearch, setBestInitialSearch]   = useState('');

  function goToLager(varenr: string) {
    setLagerInitialSearch(varenr);
    setLagerNavKey((k) => k + 1);
    setActiveTab('lager');
  }

  function goToBestillinger(varenr: string) {
    setBestInitialSearch(varenr);
    setBestNavKey((k) => k + 1);
    setActiveTab('bestillinger');
  }

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'lager' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('lager')}
        >
          <Package size={15} /> Lager
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'bestillinger' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('bestillinger')}
        >
          <ShoppingCart size={15} /> Bestillinger
        </button>
      </div>

      {activeTab === 'lager' && (
        <LagerTab
          key={lagerNavKey}
          initialSearch={lagerInitialSearch}
          onGoToBestillinger={goToBestillinger}
        />
      )}
      {activeTab === 'bestillinger' && (
        <BestillingerTab
          key={bestNavKey}
          initialSearch={bestInitialSearch}
          onGoToLager={goToLager}
        />
      )}
    </div>
  );
}
```

- [ ] **Steg 2: Verifiser TypeScript-kompilering**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/pages/Lager/Lager.tsx
git commit -m "refactor: gjør Lager.tsx til tab-container med LagerTab og BestillingerTab"
```

---

## Task 9: CSS – nye stiler

**Files:**
- Modify: `src/pages/Lager/Lager.module.css`

- [ ] **Steg 1: Erstatt `.container`-regelen og legg til nye stiler i `src/pages/Lager/Lager.module.css`**

Finn og erstatt eksisterende `.container`-regel:

```css
.container {
  padding: 24px;
  max-width: 1400px;
}
```

Med:

```css
.container {
  max-width: 1400px;
}
```

Legg deretter til følgende nye regler **på slutten av filen**:

```css
/* ── Faner ── */
.tabs {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  padding: 0 24px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  transition: color 0.15s;
}

.tab:hover {
  color: var(--color-text);
}

.tabActive {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

/* ── Tab-innhold ── */
.tabContent {
  padding: 24px;
}

/* ── Cross-tab lenke i Lager-rader ── */
.crossTabLink {
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0.7;
}

.crossTabLink:hover {
  opacity: 1;
  background: var(--color-bg-secondary);
}

/* ── Ordre-tabell ── */
.orderRow {
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.1s;
}

.orderRow:hover {
  background: var(--color-bg-secondary);
}

.orderRowDraft {
  opacity: 0.6;
}

.expandBtn {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* ── Status-badges ── */
.statusBadgeOpen {
  background: #22c55e22;
  color: #22c55e;
  border: 1px solid #22c55e44;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.statusBadgeDraft {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

/* ── Linjetabell (innrykk under ordre) ── */
.linesRow {
  background: var(--color-bg-secondary);
}

.lineTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  padding-left: 40px;
}

.lineTable thead tr {
  border-bottom: 1px solid var(--color-border);
}

.lineTable th {
  padding: 5px 12px 5px 40px;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 600;
  text-align: left;
}

.lineRow {
  border-bottom: 1px solid var(--color-border);
}

.lineRow:last-child {
  border-bottom: none;
}

.lineRow td {
  padding: 6px 12px 6px 40px;
}

/* ── Klikkbart varenr i linjetabell ── */
.lineVarenr {
  background: none;
  border: none;
  color: var(--color-accent);
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.lineVarenr:hover {
  opacity: 0.7;
}

/* ── Lokasjonsbadge i linjetabell ── */
.locationBadge {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  white-space: nowrap;
}

/* ── Fullt mottatt ── */
.receivedFull {
  color: #22c55e;
  font-weight: 600;
}
```

- [ ] **Steg 2: Start appen og verifiser visuelt**

```bash
npm start
```

Åpne http://localhost:5173/lager og verifiser:
- To faner øverst: «Lager» og «Bestillinger»
- Lager-fanen fungerer som før (ingen regresjon)
- Bestillinger-fanen laster og viser ordrer
- Klikk på en ordre – linjer ekspanderer/kollapserer
- Klikk på varenr i en linje – hopper til Lager-fanen med søket fylt inn
- Klikk «Bestillinger →» på en vare med lager ≤ 3 – hopper til Bestillinger-fanen

- [ ] **Steg 3: Bygg for produksjon**

```bash
npm run build
```

Forventet: bygg fullføres uten TypeScript-feil.

- [ ] **Steg 4: Commit**

```bash
git add src/pages/Lager/Lager.module.css
git commit -m "feat: legg til CSS for faner, ordretabell og linjetabell"
```
