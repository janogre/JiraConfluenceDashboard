# BC derivedStatus og UI-opprydning — implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beregn `derivedStatus` server-side fra purchase-order-linjer, fjern all bruk av BC-feltet `status`, skjul ufullstendige ordrer som default med toggle, marker gamle ordrer (>1 år) visuelt, og vis "(ikke satt)" for ubrukelige `expectedReceiptDate`-verdier.

**Architecture:** Ren helper-funksjon `computeDerivedStatus(lines)` i `purchaseOrdersService.js` beriker ordrer server-side. TypeScript-typen oppdateres. `BestillingerTab.tsx` bruker `derivedStatus` til filter, badges og toggle. CSS-opprydning i `Lager.module.css`.

**Tech Stack:** Node.js (Express-proxy), React 19 + TypeScript, CSS Modules, TanStack Query (uendret).

**Test-strategi:** Prosjektet har ingen test-runner. `computeDerivedStatus` dokumenteres med JSDoc som inkluderer alle fire utfall som worked examples. Ende-til-ende verifiseres manuelt via browser på slutten (Oppgave 8).

**Språk:** Norsk bokmål for alle kode-kommentarer, UI-tekster og commit-meldinger.

**Referanse-spec:** `docs/superpowers/specs/2026-04-21-bc-derived-status-design.md`

---

## Filstruktur

| Fil | Handling | Ansvar |
|---|---|---|
| `server/businessCentral/purchaseOrdersService.js` | Modifiser | Legg til `computeDerivedStatus`, `enrichWithDerivedStatus`, dropp `status` fra `$select` |
| `src/types/index.ts` | Modifiser | `BcPurchaseOrder`: fjern `status`, legg til `derivedStatus` |
| `src/pages/Lager/BestillingerTab.tsx` | Modifiser | Bruk `derivedStatus`, toggle, badges, gammel-rad, dato-helper |
| `src/pages/Lager/Lager.module.css` | Modifiser | Nye klasser for badges/rad/dato, fjern gamle Draft/Open-klasser |

Ingen nye filer. Ingen endringer i `itemsService.js`, `locationsService.js`, `api.ts`, `bcService.ts`, `LagerTab.tsx`, `Lager.tsx`.

---

## Oppgave 1: `computeDerivedStatus` med JSDoc-eksempler

**Files:**
- Modify: `server/businessCentral/purchaseOrdersService.js` (øverst i fila, før `fetchAllPages`)

- [ ] **Step 1: Legg til ren funksjon `computeDerivedStatus` med JSDoc-eksempler**

Åpne `server/businessCentral/purchaseOrdersService.js`. Rett etter `import`-linjene (linje 2), legg til:

```javascript
/**
 * Beregner utledet status for en innkjøpsordre basert på linjedata.
 *
 * BC-feltet `status` (Draft/Open) matcher ikke det brukerne ser i BC-klienten,
 * og NEAS bruker ikke kladd-funksjonen som en ekte arbeidsflate. `fullyReceived`
 * avviker fra linjedata i ~10% av tilfellene. Derfor ignorerer vi begge felter
 * og beregner status fra sum av bestilte vs. mottatte antall.
 *
 * Ref: docs/superpowers/specs/2026-04-21-bc-derived-status-design.md
 *
 * @param {Array<{quantity: number, receivedQuantity: number}>} lines
 * @returns {'Bestilt' | 'Delvis mottatt' | 'Mottatt' | 'Ufullstendig'}
 *
 * @example
 *   computeDerivedStatus([])                                           // 'Ufullstendig'
 *   computeDerivedStatus([{quantity: 5, receivedQuantity: 0}])         // 'Bestilt'
 *   computeDerivedStatus([{quantity: 5, receivedQuantity: 2}])         // 'Delvis mottatt'
 *   computeDerivedStatus([{quantity: 5, receivedQuantity: 5}])         // 'Mottatt'
 *   computeDerivedStatus([                                              // 'Delvis mottatt'
 *     {quantity: 3, receivedQuantity: 3},
 *     {quantity: 2, receivedQuantity: 0},
 *   ])
 *   computeDerivedStatus([{quantity: 5, receivedQuantity: 7}])         // 'Mottatt' (over-mottak)
 */
export function computeDerivedStatus(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return 'Ufullstendig';
  const totalQty = lines.reduce((s, l) => s + (l.quantity ?? 0), 0);
  const totalRecv = lines.reduce((s, l) => s + (l.receivedQuantity ?? 0), 0);
  if (totalRecv === 0) return 'Bestilt';
  if (totalRecv < totalQty) return 'Delvis mottatt';
  return 'Mottatt';
}
```

- [ ] **Step 2: Verifiser funksjonen manuelt i Node REPL**

Kjør fra prosjektrot:

```bash
node --input-type=module -e "
import('./server/businessCentral/purchaseOrdersService.js').then(({ computeDerivedStatus }) => {
  const assert = (actual, expected, label) => {
    const ok = actual === expected;
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + label + ' → ' + actual);
    if (!ok) process.exit(1);
  };
  assert(computeDerivedStatus([]), 'Ufullstendig', 'tom');
  assert(computeDerivedStatus([{quantity: 5, receivedQuantity: 0}]), 'Bestilt', 'ingenting mottatt');
  assert(computeDerivedStatus([{quantity: 5, receivedQuantity: 2}]), 'Delvis mottatt', 'delvis');
  assert(computeDerivedStatus([{quantity: 5, receivedQuantity: 5}]), 'Mottatt', 'likt');
  assert(computeDerivedStatus([{quantity: 5, receivedQuantity: 7}]), 'Mottatt', 'over-mottak');
  assert(computeDerivedStatus([{quantity: 3, receivedQuantity: 3},{quantity: 2, receivedQuantity: 0}]), 'Delvis mottatt', 'flere linjer');
  console.log('Alle 6 verifikasjoner OK');
});
"
```

Forventet utskrift: alle linjer starter med `OK` og siste linje er `Alle 6 verifikasjoner OK`.

**NB:** Hvis Node klager over ES-moduler, sjekk at `server/` eller `package.json` har `"type": "module"`. `purchaseOrdersService.js` bruker allerede `import`/`export`, så det skal være på plass.

- [ ] **Step 3: Commit**

```bash
git add server/businessCentral/purchaseOrdersService.js
git commit -m "feat(bc): legg til computeDerivedStatus for innkjøpsordrer

Ren helper som beregner status fra linjedata (quantity vs.
receivedQuantity). Erstatter bruk av BC-feltet status som ikke
matcher det brukerne ser i BC-klienten. JSDoc dokumenterer alle
fire utfall med worked examples i stedet for enhetstester, siden
prosjektet ikke har test-runner."
```

---

## Oppgave 2: Berik ordrer med `derivedStatus` og dropp `status` fra `$select`

**Files:**
- Modify: `server/businessCentral/purchaseOrdersService.js:5-6` (`$select`-string)
- Modify: `server/businessCentral/purchaseOrdersService.js:65-80` (`getBcPurchaseOrders`-pipeline)

- [ ] **Step 1: Dropp `status` fra `$select`-strengen**

I `fetchAllPages`, bytt linje 5–6:

```javascript
  const select =
    'id,number,orderDate,vendorNumber,vendorName,status,shipToName,purchaser,fullyReceived,lastModifiedDateTime';
```

til:

```javascript
  // status droppet – erstattet av derivedStatus, se computeDerivedStatus
  const select =
    'id,number,orderDate,vendorNumber,vendorName,shipToName,purchaser,fullyReceived,lastModifiedDateTime';
```

- [ ] **Step 2: Legg til `enrichWithDerivedStatus` rett etter `enrichWithLocationCodes`**

Legg til denne funksjonen under `enrichWithLocationCodes` (før `getBcPurchaseOrders`):

```javascript
function enrichWithDerivedStatus(orders) {
  return orders.map((order) => ({
    ...order,
    derivedStatus: computeDerivedStatus(order.purchaseOrderLines),
  }));
}
```

- [ ] **Step 3: Oppdater `getBcPurchaseOrders` til å kalle begge berikelsesstegene**

Finn de to kallene til `enrichWithLocationCodes` i `getBcPurchaseOrders` (linje 69 og 76). Erstatt hele funksjonen:

```javascript
export async function getBcPurchaseOrders() {
  let token = await getBcToken();
  try {
    const orders = await fetchAllPages(token);
    return enrichWithDerivedStatus(await enrichWithLocationCodes(orders));
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC orders] 401 – invaliderer token-cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      const orders = await fetchAllPages(token);
      return enrichWithDerivedStatus(await enrichWithLocationCodes(orders));
    }
    throw err;
  }
}
```

- [ ] **Step 4: Verifiser end-to-end at `derivedStatus` er i respons**

Start proxy-serveren:

```bash
npm run proxy
```

I en annen terminal, kall endepunktet og sjekk at `derivedStatus` finnes og at `status` ikke finnes:

```bash
curl -s http://localhost:3001/api/bc/purchase-orders | node -e "
let d=''; process.stdin.on('data', c => d+=c); process.stdin.on('end', () => {
  const { orders } = JSON.parse(d);
  console.log('Antall ordrer:', orders.length);
  const first = orders[0];
  console.log('Første ordre nr:', first?.number);
  console.log('derivedStatus:', first?.derivedStatus);
  console.log('status finnes:', 'status' in (first ?? {}));
  const dist = orders.reduce((m, o) => (m[o.derivedStatus] = (m[o.derivedStatus]||0)+1, m), {});
  console.log('Fordeling:', dist);
});
"
```

Forventet: `derivedStatus` har en av de fire verdiene, `status finnes: false`, og `Fordeling` viser 2–4 kategorier.

Stopp proxy-serveren (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add server/businessCentral/purchaseOrdersService.js
git commit -m "feat(bc): beriker innkjøpsordrer med derivedStatus server-side

Nytt berikelsessteg enrichWithDerivedStatus kjøres etter
lokasjonsberikelsen. \$select dropper status-feltet, som ikke
skal brukes i klienten. Ordrer leveres nå med derivedStatus-feltet
og uten status-feltet."
```

---

## Oppgave 3: Oppdater TypeScript-typen

**Files:**
- Modify: `src/types/index.ts:300-312` (`BcPurchaseOrder`-interface)

- [ ] **Step 1: Erstatt `status`-feltet med `derivedStatus`**

I `src/types/index.ts`, finn interfacet `BcPurchaseOrder` (linje 300). Bytt ut hele blokken:

```typescript
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
```

med:

```typescript
export interface BcPurchaseOrder {
  id: string;
  number: string;
  orderDate: string;
  vendorNumber: string;
  vendorName: string;
  derivedStatus: 'Bestilt' | 'Delvis mottatt' | 'Mottatt' | 'Ufullstendig';
  shipToName: string;
  purchaser: string;
  fullyReceived: boolean;
  lastModifiedDateTime: string;
  purchaseOrderLines: BcPurchaseOrderLine[];
}
```

- [ ] **Step 2: Identifiser kompileringsfeil**

Kjør:

```bash
npx tsc -b --noEmit
```

Forventet: feil i `src/pages/Lager/BestillingerTab.tsx` som refererer til `order.status` og `allStatuses`. Dette er forventet — fikses i Oppgave 4. Noter hvilke linjer som feiler.

- [ ] **Step 3: Commit (også med midlertidig TS-feil — det er OK, fikses i neste oppgave)**

```bash
git add src/types/index.ts
git commit -m "feat(types): bytt BcPurchaseOrder.status med derivedStatus

Speiler servers nye respons-format. TypeScript-feil i
BestillingerTab.tsx er forventet og fikses i neste commit."
```

---

## Oppgave 4: Bruk `derivedStatus` i `BestillingerTab.tsx`

**Files:**
- Modify: `src/pages/Lager/BestillingerTab.tsx` (flere steder)

- [ ] **Step 1: Fjern `allStatuses`-memo**

Finn og slett hele blokken (linje 55–58):

```typescript
  const allStatuses = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.orders.map((o) => o.status))].sort();
  }, [data]);
```

- [ ] **Step 2: Oppdater filterlogikk til å bruke `derivedStatus`**

I `filtered`-memo (linje 60–79), bytt ut linjen:

```typescript
      if (statusFilter && order.status !== statusFilter) return false;
```

med:

```typescript
      if (statusFilter && order.derivedStatus !== statusFilter) return false;
```

- [ ] **Step 3: Erstatt statusfilter-dropdown med statiske verdier**

Finn dropdown'en (linje 141–144):

```tsx
        <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Alle statuser</option>
          {allStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
```

Bytt ut med:

```tsx
        <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Alle statuser</option>
          <option value="Bestilt">Bestilt</option>
          <option value="Delvis mottatt">Delvis mottatt</option>
          <option value="Mottatt">Mottatt</option>
        </select>
```

(Merk: `Ufullstendig` er **ikke** i dropdown'en — den nås bare via toggle i Oppgave 5.)

- [ ] **Step 4: Legg til ny `statusClass`-helper øverst i fila**

Rett etter `sortIcon`-funksjonen (linje 16–19), legg til:

```typescript
function statusClass(status: string): string {
  switch (status) {
    case 'Bestilt':        return styles.statusBadgeBestilt;
    case 'Delvis mottatt': return styles.statusBadgeDelvis;
    case 'Mottatt':        return styles.statusBadgeMottatt;
    case 'Ufullstendig':   return styles.statusBadgeUfullstendig;
    default:               return styles.statusBadgeUfullstendig;
  }
}
```

- [ ] **Step 5: Oppdater status-badge i rad-rendering**

Finn badge-rendringen (linje 226–230):

```tsx
                      <td>
                        <span className={order.status === 'Open' ? styles.statusBadgeOpen : styles.statusBadgeDraft}>
                          {order.status}
                        </span>
                      </td>
```

Bytt ut med:

```tsx
                      <td>
                        <span className={statusClass(order.derivedStatus)}>
                          {order.derivedStatus}
                        </span>
                      </td>
```

- [ ] **Step 6: Fjern `orderRowDraft`-klassen fra rad-elementet**

Finn `<tr>`-åpningen (linje 216–219):

```tsx
                    <tr
                      className={`${styles.orderRow} ${order.status === 'Draft' ? styles.orderRowDraft : ''}`}
                      onClick={() => toggleOrder(order.id)}
                    >
```

Bytt ut med (midlertidig — utvides med `orderRowOld` i Oppgave 6):

```tsx
                    <tr
                      className={styles.orderRow}
                      onClick={() => toggleOrder(order.id)}
                    >
```

- [ ] **Step 7: Verifiser at typesjekk går gjennom**

```bash
npx tsc -b --noEmit
```

Forventet: ingen feil. Hvis det gjenstår referanser til `order.status` eller `allStatuses`, fiks dem. (Grep: `git grep "order\.status\|allStatuses" src/pages/Lager/`.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/Lager/BestillingerTab.tsx
git commit -m "feat(lager): bytt status til derivedStatus i Bestillinger-fanen

Fjerner all bruk av BC-feltet status. Statusfilter bruker nå
statiske derivedStatus-verdier. Ny statusClass-helper mapper
status til badge-CSS-klasse. orderRowDraft-klassen er droppet
– erstattes av orderRowOld i neste commit."
```

---

## Oppgave 5: Toggle for "Vis ufullstendige ordrer"

**Files:**
- Modify: `src/pages/Lager/BestillingerTab.tsx`

- [ ] **Step 1: Legg til `showIncomplete`-state**

I `BestillingerTab`-komponentens state-seksjon (rett etter `vendorFilter`-staten, ca. linje 30), legg til:

```typescript
  const [showIncomplete, setShowIncomplete] = useState(false);
```

- [ ] **Step 2: Oppdater filter-memo til å skjule ufullstendige som default**

Øverst i `filter`-callback'en inni `filtered`-memo (rett etter `return data.orders.filter((order) => {`), legg til som første sjekk:

```typescript
      if (!showIncomplete && order.derivedStatus === 'Ufullstendig') return false;
```

Oppdater deretter dependency-arrayen nederst i `useMemo`:

```typescript
  }, [data, search, statusFilter, locationFilter, vendorFilter, showIncomplete]);
```

- [ ] **Step 3: Legg til toggle i toolbaren**

Finn refresh-knappen i toolbaren (rett før `<button className={styles.refreshBtn}`). Legg til toggle rett før den:

```tsx
        <label className={styles.toggleLabel}>
          <div
            className={`${styles.toggle} ${showIncomplete ? styles.toggleActive : ''}`}
            onClick={() => setShowIncomplete((v) => !v)}
          />
          Vis ufullstendige
        </label>
```

(Dette gjenbruker samme `toggle`/`toggleActive`/`toggleLabel`-klasser som `LagerTab` bruker for "Skjul tomt lager".)

- [ ] **Step 4: Oppdater statuslinjen til å vise antall skjulte ufullstendige**

Finn `<div className={styles.statusBar}>`-blokken (ca. linje 163–170). Bytt ut innholdet i span'en:

```tsx
          <span>
            Viser {sorted.length} av {data.orders.length} ordrer · {totalLines} linjer totalt
          </span>
```

med:

```tsx
          <span>
            Viser {sorted.length} av {data.orders.length} ordrer · {totalLines} linjer totalt
            {!showIncomplete && (() => {
              const hidden = data.orders.filter((o) => o.derivedStatus === 'Ufullstendig').length;
              return hidden > 0 ? ` (${hidden} ufullstendige skjult)` : '';
            })()}
          </span>
```

- [ ] **Step 5: Verifiser typesjekk**

```bash
npx tsc -b --noEmit
```

Forventet: ingen feil.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Lager/BestillingerTab.tsx
git commit -m "feat(lager): toggle for å vise ufullstendige bestillinger

Default skjult. Når av: ordrer med derivedStatus='Ufullstendig'
filtreres vekk før resten av filterne kjører. Statuslinjen viser
antall skjulte for transparens. Bruker eksisterende toggle-CSS."
```

---

## Oppgave 6: Gammel-markering og `expectedReceiptDate`-helper

**Files:**
- Modify: `src/pages/Lager/BestillingerTab.tsx`

- [ ] **Step 1: Legg til `isOldOrder`-helper**

Etter `statusClass`-funksjonen (fra Oppgave 4, Step 4), legg til:

```typescript
/**
 * Ordrer som har ligget åpne over ett år er nesten alltid et
 * BC-oppryddingsproblem (ikke lukket korrekt), ikke reelle aktive
 * bestillinger. Markeres visuelt så brukeren kan vurdere opprydning –
 * men skjules ikke: NEAS vil se dem for å kunne rydde.
 */
function isOldOrder(orderDate: string): boolean {
  if (!orderDate) return false;
  const age = Date.now() - new Date(orderDate).getTime();
  return age > 365 * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Legg til `formatExpectedDate`-helper**

Under `isOldOrder`, legg til:

```typescript
/**
 * expectedReceiptDate i BC er ofte identisk med orderDate fordi
 * realistiske leveringsdatoer ikke finnes i systemet p.t. Viser
 * feltet ærlig: "(ikke satt)" når det er tomt, `0001-01-01` eller
 * likt orderDate, ellers formatert dato.
 */
function formatExpectedDate(expected: string, orderDate: string): React.ReactNode {
  if (!expected || expected.startsWith('0001-') || expected === orderDate) {
    return <span className={styles.dateMuted}>(ikke satt)</span>;
  }
  return formatDate(expected);
}
```

- [ ] **Step 3: Legg `orderRowOld`-klassen på gamle rader**

Fra Oppgave 4, Step 6 har `<tr>` nå `className={styles.orderRow}`. Bytt ut med:

```tsx
                    <tr
                      className={`${styles.orderRow} ${isOldOrder(order.orderDate) ? styles.orderRowOld : ''}`}
                      onClick={() => toggleOrder(order.id)}
                      title={isOldOrder(order.orderDate) ? 'Bestilt for over ett år siden – muligens ikke lukket korrekt' : undefined}
                    >
```

- [ ] **Step 4: Bruk `formatExpectedDate` i linjetabellen**

Finn cellen for forventet dato i linjetabellen (linje 274):

```tsx
                                  <td className={styles.dateCell}>{formatDate(line.expectedReceiptDate)}</td>
```

Bytt ut med:

```tsx
                                  <td className={styles.dateCell}>{formatExpectedDate(line.expectedReceiptDate, order.orderDate)}</td>
```

- [ ] **Step 5: Verifiser typesjekk**

```bash
npx tsc -b --noEmit
```

Forventet: ingen feil.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Lager/BestillingerTab.tsx
git commit -m "feat(lager): marker gamle ordrer og vis ærlig forv.-dato

isOldOrder: ordrer >1 år får orderRowOld-klasse + tooltip.
formatExpectedDate: viser '(ikke satt)' når expectedReceiptDate
er tom, 0001-01-01, eller lik orderDate – fordi BC sjelden har
reelle leveringsdatoer. Begge helperne har dokumenterende
JSDoc som forklarer hvorfor."
```

---

## Oppgave 7: CSS-opprydning

**Files:**
- Modify: `src/pages/Lager/Lager.module.css`

- [ ] **Step 1: Fjern gamle status- og Draft-klasser**

Slett linje 314–316 (`.orderRowDraft`):

```css
.orderRowDraft {
  opacity: 0.6;
}
```

Slett linje 325–346 (`.statusBadgeOpen` og `.statusBadgeDraft`). Behold overskriftskommentaren `/* ── Status-badges ── */`.

- [ ] **Step 2: Legg til de nye badge-klassene**

Under kommentaren `/* ── Status-badges ── */`, legg til:

```css
.statusBadgeBestilt {
  background: #3b82f622;
  color: #3b82f6;
  border: 1px solid #3b82f644;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.statusBadgeDelvis {
  background: #f59e0b22;
  color: #f59e0b;
  border: 1px solid #f59e0b44;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.statusBadgeMottatt {
  background: #22c55e22;
  color: #22c55e;
  border: 1px solid #22c55e44;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.statusBadgeUfullstendig {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
```

(Stilen dupliseres bevisst — matcher eksisterende mønster i fila; ingen andre steder bruker `composes`.)

- [ ] **Step 3: Legg til `.orderRowOld`**

Der `.orderRowDraft` lå (under `.orderRow:hover`-blokken), legg til:

```css
.orderRowOld {
  border-left: 3px solid #f59e0b;
}

.orderRowOld td:first-child {
  padding-left: 9px;
}
```

(`f59e0b` er samme oransje som brukes i `error`-border og `inventoryOrange` — holder paletten konsistent. `td:first-child`-justering kompenserer for border'ens 3px så rad-innhold ikke hopper.)

- [ ] **Step 4: Legg til `.dateMuted`**

Under `.dateCell`-blokken (ca. linje 205):

```css
.dateMuted {
  color: var(--color-text-secondary);
  font-style: italic;
  opacity: 0.7;
}
```

- [ ] **Step 5: Verifiser at build går gjennom**

```bash
npm run build
```

Forventet: bygget fullføres uten feil. TypeScript må godta at `styles.statusBadgeBestilt`, `styles.statusBadgeDelvis`, `styles.statusBadgeMottatt`, `styles.statusBadgeUfullstendig`, `styles.orderRowOld` og `styles.dateMuted` finnes. Hvis build feiler med "property does not exist on type", sjekk at CSS-klassenavnene er identiske i `.module.css` og `.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Lager/Lager.module.css
git commit -m "style(lager): nye status-badges, gammel-rad og dempet dato

Fire nye badge-klasser som matcher derivedStatus-verdiene.
orderRowOld: venstre-border i samme oransje som resten av UI-et.
dateMuted: dempet italic for '(ikke satt)'. Fjerner de gamle
statusBadgeOpen/Draft og orderRowDraft som ikke lenger brukes."
```

---

## Oppgave 8: Manuell verifisering i browser

**Files:** Ingen endringer — kun verifisering.

- [ ] **Step 1: Start hele stacken**

```bash
npm start
```

Forventet: både proxy (port 3001) og Vite (port 5173) starter. Åpne `http://localhost:5173` i browser.

- [ ] **Step 2: Gå til Lager-siden og Bestillinger-fanen**

Klikk `Lager` i menyen, så `Bestillinger`-fanen.

Forventet:
- Tabellen laster ordrer.
- STATUS-kolonnen viser `Bestilt`, `Delvis mottatt`, eller `Mottatt` — **ikke** `Draft` eller `Open`.
- Ingen rad med status `Ufullstendig` synlig (skjult som default).

- [ ] **Step 3: Verifiser at ufullstendige skjules/vises via toggle**

Se statuslinjen øverst: står det "(N ufullstendige skjult)" der N > 0? Hvis ja, slå på `Vis ufullstendige`-toggle.

Forventet: antallet i tabellen øker, og ufullstendige ordrer får grå `Ufullstendig`-badge. Slå av — de forsvinner igjen.

Hvis N=0 i datasettet, hopp over verifiseringen her (men funksjonen skal fortsatt være til stede).

- [ ] **Step 4: Verifiser statusfilter-dropdown**

Velg `Bestilt` i statusfilteret. Forventet: kun ordrer med blå `Bestilt`-badge. Gjenta for `Delvis mottatt` (oransje) og `Mottatt` (grønn). `Ufullstendig` skal **ikke** være et valg i dropdown'en.

- [ ] **Step 5: Verifiser gammel-markering**

Sorter på DATO ascending (klikk kolonne til eldste er øverst). Forventet: hvis det finnes ordrer eldre enn ett år, har de en oransje venstre-border, og hover viser tooltipen "Bestilt for over ett år siden – muligens ikke lukket korrekt".

Hvis ingen ordrer er >1 år gamle, hopp over visuell verifisering her.

- [ ] **Step 6: Verifiser `expectedReceiptDate`-håndtering**

Ekspandér en ordre (klikk raden). Se linjetabellen, kolonne `FORV. DATO`.

Forventet: der `expectedReceiptDate` er tom eller lik `orderDate`, vises `(ikke satt)` i dempet italic. Ellers normal dato.

- [ ] **Step 7: Regresjonssjekk — Lager-fanen**

Klikk `Lager`-fanen. Forventet: fungerer helt som før (ingen endring — urørt).

Klikk "Bestillinger →"-knappen på en rad i Lager. Forventet: bytter til Bestillinger-fanen med varenummer forhåndsutfylt i søkefeltet.

- [ ] **Step 8: Regresjonssjekk — krysslinking**

I en ekspandert ordre i Bestillinger, klikk et varenummer. Forventet: bytter til Lager-fanen med varenummeret i søkefeltet.

- [ ] **Step 9: Oppsummer og commit eventuelle oppfølgingsfiks**

Hvis alle steg 1–8 er OK: ingen ekstra commit. Hvis noe feilet, fiks og commit separat med prefiks `fix(lager): ...`.

---

## Self-review-sjekk før oppgaven er ferdig

- [ ] `git grep "order\.status" src/` gir ingen treff.
- [ ] `git grep "allStatuses" src/` gir ingen treff.
- [ ] `git grep "statusBadgeOpen\|statusBadgeDraft\|orderRowDraft" src/` gir ingen treff.
- [ ] `npm run build` passerer.
- [ ] `npm run lint` passerer (eller minst ikke nye feil vs. master).
- [ ] Alle 8 commits har norsk melding og følger eksisterende stil (ingen `[Claude]`-prefiks i selve meldingen).

---

## Definisjon av ferdig (fra spec)

- [x] `computeDerivedStatus` implementert med JSDoc som viser alle fire utfall — Oppgave 1.
- [x] `derivedStatus` finnes på hver ordre i API-respons — Oppgave 2.
- [x] `status`-feltet forekommer ikke lenger i `BcPurchaseOrder`-typen eller klientkode — Oppgave 3, 4.
- [x] Toggle "Vis ufullstendige ordrer" fungerer, default av — Oppgave 5.
- [x] Statusfilter-dropdown bruker statiske `derivedStatus`-verdier — Oppgave 4.
- [x] Gamle ordrer (>1 år) har visuell markering og tooltip — Oppgave 6, 7.
- [x] `expectedReceiptDate` viser "(ikke satt)" når tom eller lik `orderDate` — Oppgave 6.
- [x] Kode-kommentarer dokumenterer databegrensningene — Oppgave 1 (server), 6 (UI).
- [x] `npm run build` passerer — Oppgave 7.
- [x] Manuell verifisering i browser — Oppgave 8.
