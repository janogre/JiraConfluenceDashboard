# BC-innkjøpsordrer – derivedStatus og UI-opprydning

**Dato:** 2026-04-21
**Status:** Godkjent — klar for implementasjonsplan

## Oversikt

Oppfølging av `2026-04-20-lager-bestillinger-lokasjoner-design.md`. Base-implementasjonen henter og viser innkjøpsordrer fra Business Central, men bruker BC-feltet `status` (`Draft`/`Open`) i visning og filtrering. I følge oppdatert spec skal dette feltet ignoreres — status skal beregnes fra linjedata som `derivedStatus`.

Denne spec'en dekker:

1. `derivedStatus` beregnes server-side i `purchaseOrdersService.js` og leveres til klienten.
2. UI bruker `derivedStatus` i stedet for `status` overalt.
3. Ufullstendige ordrer skjules som default, med toggle for å vise dem.
4. To valgfrie UI-signaler: markering av gamle ordrer (>1 år) og ærlig visning av `expectedReceiptDate` når den er ubrukelig.
5. Dokumentasjon av databegrensninger som kode-kommentarer der de faktisk gjelder.

Ikke i scope: tester/test-runner (prosjektet har ingen), `fullyReceived`-avviksindikator, `/purchaseInvoices`, custom API page.

## Bakgrunn

- `status`-feltet fra BC-API-en matcher ikke det brukerne ser i BC-klienten.
- NEAS bruker ikke Draft-tilstanden som arbeidsflate — alle ordrer i BC er reelle bestillinger.
- `fullyReceived`-flagget avviker fra linjedata i ~10% av tilfellene og skal ikke brukes som kilde til mottaksstatus.
- Ordrer fra 2021 ligger fortsatt åpne i BC pga. manglende opprydning. Dette er et datakvalitetsproblem som bør være synlig i UI-et, ikke skjult.

## Arkitektur

### Server-side

`server/businessCentral/purchaseOrdersService.js`:

**`computeDerivedStatus(lines)`** — ren funksjon:

```
Hvis lines.length === 0           → "Ufullstendig"
totalQty  = sum(line.quantity)
totalRecv = sum(line.receivedQuantity)

totalRecv === 0                   → "Bestilt"
totalRecv < totalQty              → "Delvis mottatt"
totalRecv >= totalQty             → "Mottatt"
```

Funksjonen får en JSDoc-blokk som dokumenterer alle fire utfall med eksempler — erstatter enhetstester i en kodebase uten test-runner.

**`enrichWithDerivedStatus(orders)`** — nytt berikelsessteg som kjøres etter `enrichWithLocationCodes`. Setter `order.derivedStatus`. `getBcPurchaseOrders()` oppdateres til å kalle begge berikelsesstegene.

**`$select` i URL-en:** `status` dropes (brukes ikke lenger). `fullyReceived` beholdes i tilfelle vi vil ha en avviksindikator senere — datavolumet er minimalt.

### Typer

`src/types/index.ts` — `BcPurchaseOrder`:

- Fjern: `status: 'Draft' | 'Open' | 'Released' | string`
- Legg til: `derivedStatus: 'Bestilt' | 'Delvis mottatt' | 'Mottatt' | 'Ufullstendig'`
- Behold: `fullyReceived: boolean` (uendret)

### Frontend

`src/pages/Lager/BestillingerTab.tsx`:

**State:**
- `statusFilter: string` — uendret navn, men filtrerer nå på `derivedStatus`.
- `showIncomplete: boolean` (default `false`) — ny.

**Statusfilter-dropdown:**
- Statisk liste: `['Bestilt', 'Delvis mottatt', 'Mottatt']` (ikke dynamisk fra data).
- `"Ufullstendig"` er ikke et valg i dropdown'en — tilgjengelig kun via toggle.

**Toggle "Vis ufullstendige ordrer":**
- Plasseres i toolbaren, samme visuelle stil som `Skjul tomt lager` i `LagerTab`.
- Default: av (ufullstendige er skjult).

**Filterlogikk (ny rekkefølge i `filtered`-memo):**

1. Hvis `!showIncomplete && order.derivedStatus === 'Ufullstendig'` → skjul.
2. `statusFilter` — hvis satt, match mot `derivedStatus`.
3. `locationFilter`, `vendorFilter`, søk — uendret.

**Status-badge:**
- Ny funksjon `statusClass(derivedStatus)` returnerer én av fire CSS-klasser.
- Fjern `statusBadgeOpen`/`statusBadgeDraft` og tilhørende bruk.
- Farger matcher eksisterende palett:
  - `Bestilt` → blå (`--color-accent` el.)
  - `Delvis mottatt` → oransje
  - `Mottatt` → grønn
  - `Ufullstendig` → grå/dempet

**Gamle ordrer (>1 år):**
- `isOldOrder(orderDate: string): boolean` — sammenligner med `Date.now() - 365 * 24h`.
- Legger `styles.orderRowOld` på rad-elementet når sant.
- Tooltip via `title`: "Bestilt for over ett år siden – muligens ikke lukket korrekt".

**`expectedReceiptDate`-håndtering:**
- Ny helper `formatExpectedDate(expected: string, orderDate: string): ReactNode`.
- Hvis tom, `0001-01-01`, eller lik `orderDate` → `<span className={styles.dateMuted}>(ikke satt)</span>`.
- Ellers: `formatDate(expected)` som i dag.

**Fjerning av `order.status`-bruk:**
- `allStatuses`-memo fjernes.
- `statusBadgeOpen`/`statusBadgeDraft` fjernes fra JSX.
- `orderRowDraft`-klassen fjernes (ikke lenger meningsfull — erstattes av `orderRowOld`).

### CSS

`src/pages/Lager/Lager.module.css`:

- `.statusBadgeBestilt`, `.statusBadgeDelvis`, `.statusBadgeMottatt`, `.statusBadgeUfullstendig` — nye.
- `.orderRowOld` — venstre-border (3–4px) i varselfarge (`--color-warning` eller lignende). Ingen bakgrunnsendring (for å ikke kollidere med hover/expand-states).
- `.dateMuted` — dempet tekst for "(ikke satt)".
- Fjern: `.statusBadgeOpen`, `.statusBadgeDraft`, `.orderRowDraft`.

## Dokumentasjon av databegrensninger

Kommentarer plasseres der begrensningen faktisk gjelder — ikke samlet i README.

- **`purchaseOrdersService.js`** over `computeDerivedStatus`: hvorfor vi ignorerer `status` og `fullyReceived`, med referanse til spec'en.
- **`BestillingerTab.tsx`** over `formatExpectedDate`: hvorfor vi viser "(ikke satt)" når `expectedReceiptDate === orderDate`.
- **`BestillingerTab.tsx`** over `isOldOrder`: kort note om at åpne ordrer fra flere år tilbake er et BC-oppryddingsproblem, ikke en app-bug.

Andre begrensninger fra spec'en (`directUnitCost=0`, `requestedReceiptDate='0001-01-01'`, `inventory=total-på-tvers-av-lokasjoner`, manglende custom-felter) dokumenteres **ikke** her — de er ikke synlige i denne koden og hører til prosjekt-spec'en.

## Datakontrakt

Server returnerer uendret response-form, men hvert ordre-objekt:

```json
{
  "id": "…",
  "number": "100263",
  "orderDate": "2025-11-12",
  "vendorNumber": "…",
  "vendorName": "…",
  "shipToName": "M1",
  "purchaser": "JOG",
  "fullyReceived": false,
  "lastModifiedDateTime": "…",
  "derivedStatus": "Bestilt",
  "purchaseOrderLines": [ /* uendret, med locationCode */ ]
}
```

`status` er **ikke lenger i payload**.

## Endrede filer

| Fil | Endring |
|---|---|
| `server/businessCentral/purchaseOrdersService.js` | `computeDerivedStatus`, `enrichWithDerivedStatus`, `$select` drop `status` |
| `src/types/index.ts` | `BcPurchaseOrder`: fjern `status`, legg til `derivedStatus` |
| `src/pages/Lager/BestillingerTab.tsx` | Filter, toggle, badges, gammel-rad, dato-helper, fjerne all `order.status`-bruk |
| `src/pages/Lager/Lager.module.css` | Nye klasser, fjerne gamle badge- og Draft-klasser |

Ingen endringer i: `itemsService.js`, `locationsService.js`, `api.ts`, `bcService.ts`, `LagerTab.tsx`, `Lager.tsx`.

## Risiko og regresjon

- **Lager-fanen:** urørt.
- **Paginering:** uendret (`@odata.nextLink`-løkken beholdes).
- **Location-berikelse:** uendret.
- **Krysslinking Lager↔Bestillinger:** uendret (varenr-basert søk).
- Eneste synlige brukerendring: statusbadges har nye farger/tekster, og ufullstendige ordrer skjules som default. Dette er spec'ens eksplisitte intensjon.

## Definisjon av ferdig (for denne spec'en)

- [ ] `computeDerivedStatus` implementert med JSDoc som viser alle fire utfall.
- [ ] `derivedStatus` finnes på hver ordre i API-respons.
- [ ] `status`-feltet forekommer ikke lenger i `BcPurchaseOrder`-typen eller i klientkode.
- [ ] Toggle "Vis ufullstendige ordrer" fungerer, default av.
- [ ] Statusfilter-dropdown bruker statiske `derivedStatus`-verdier.
- [ ] Gamle ordrer (>1 år) har visuell markering og tooltip.
- [ ] `expectedReceiptDate` viser "(ikke satt)" når tom eller lik `orderDate`.
- [ ] Kode-kommentarer på de tre nevnte stedene dokumenterer databegrensningene.
- [ ] `npm run build` passerer.
- [ ] Manuell verifisering i browser: lastet Bestillinger-fanen, testet toggle, testet statusfilter, bekreftet at minst én gammel ordre markeres hvis det finnes en i datasettet.
