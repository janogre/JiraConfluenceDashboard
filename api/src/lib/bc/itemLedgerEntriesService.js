import { getBcToken, invalidateBcTokenCache } from './auth.js';

const CONSUMPTION_CACHE_TTL_MS = 30 * 60 * 1000;
let consumptionCache = { data: null, expiresAt: 0 };

let companyNameCache = null;

async function resolveCompanyName(token) {
  if (companyNameCache) return companyNameCache;

  const companyId = process.env.BC_COMPANY_ID;
  if (!companyId) throw new Error('[BC ledger] BC_COMPANY_ID mangler i .env');

  const url =
    `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}` +
    `/${process.env.BC_ENVIRONMENT}/api/v2.0/companies(${companyId})?$select=name`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`BC API feilet ved companies-oppslag (${resp.status})`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }
  const data = await resp.json();
  if (!data.name) throw new Error('[BC ledger] companies-respons mangler name-felt');
  companyNameCache = data.name;
  console.log(`[BC ledger] Company-navn oppslått: ${companyNameCache}`);
  return companyNameCache;
}

/**
 * Klassifiserer en BC ItemLedgerEntry som "uttak" eller "innskudd" for
 * forbruksberegning. Brukes til å summere |Quantity| for uttak siste 30/90 dager.
 *
 * Verifisert mot NEAS-data (scripts/probe-bc-item-ledger.mjs):
 * dominerende Entry_Type er Sale, Negative Adjmt., Transfer.
 *
 * @param {string} entryType   BC `Entry_Type`
 * @param {number} _quantity   BC `Quantity` (signert) – reservert for fremtidig logikk
 * @returns {'uttak' | 'innskudd' | 'overforing' | 'annet'}
 *
 * @example
 *   classifyMovement('Sale', -3)              // 'uttak'
 *   classifyMovement('Purchase', 20)          // 'innskudd'
 *   classifyMovement('Negative Adjmt.', -1)   // 'uttak'
 *   classifyMovement('Positive Adjmt.', 5)    // 'innskudd'
 *   classifyMovement('Transfer', -2)          // 'overforing'
 *   classifyMovement('Transfer', 2)           // 'overforing'
 *   classifyMovement('Consumption', -4)       // 'uttak'
 *   classifyMovement('Output', 10)            // 'innskudd'
 */
export function classifyMovement(entryType, _quantity) {
  if (entryType === 'Transfer') return 'overforing';
  if (entryType === 'Sale' || entryType === 'Consumption' || entryType === 'Negative Adjmt.') {
    return 'uttak';
  }
  if (entryType === 'Purchase' || entryType === 'Output' || entryType === 'Positive Adjmt.') {
    return 'innskudd';
  }
  return 'annet';
}

async function fetchEntriesLast30Days(token) {
  const companyName = await resolveCompanyName(token);
  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/ODataV4`;
  const companyUrl = `${base}/Company('${encodeURIComponent(companyName)}')`;

  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().substring(0, 10);
  // Filtrer bort Transfer på serveren – ekskluderes fra forbruk uansett, og
  // det reduserer datamengden vesentlig (Transfer mellom NEAS-lokasjoner).
  const filter = encodeURIComponent(
    `Posting_Date ge ${fromDate} and Entry_Type ne 'Transfer'`
  );
  const select = 'Item_No,Posting_Date,Entry_Type,Quantity';
  // VIKTIG: dropp $top – BC OData Pages returnerer ikke @odata.nextLink når
  // $top er satt, så paginering bryter og data går tapt. Uten $top bruker
  // BC server-side page size og inkluderer nextLink med $skiptoken.
  let url = `${companyUrl}/ItemLedgerEntries?$filter=${filter}&$select=${select}`;

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

/**
 * Aggregerer ItemLedgerEntry-rader til per-vare-forbruk siste 30 og 90 dager,
 * samt dato for siste bevegelse.
 *
 * Kun rader klassifisert som 'uttak' (Sale, Consumption, Negative Adjmt.)
 * telles som forbruk. `Transfer` ekskluderes for å unngå dobbelttelling
 * mellom lokasjoner. Innskudd (Purchase/Output/Positive Adjmt.) bidrar
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
/**
 * Aggregerer ItemLedgerEntry-rader til per-vare-forbruk siste 30 dager,
 * samt dato for siste bevegelse.
 *
 * Kun rader klassifisert som 'uttak' (Sale, Consumption, Negative Adjmt.)
 * telles som forbruk. `Transfer` ekskluderes for å unngå dobbelttelling
 * mellom lokasjoner. Innskudd (Purchase/Output/Positive Adjmt.) bidrar
 * til `lastMovementDate` men ikke til forbruk.
 *
 * @param {Array<{Item_No: string, Posting_Date: string, Entry_Type: string, Quantity: number}>} rows
 * @param {Date} [now=new Date()]  Referansetidspunkt (eksponert for testbarhet)
 * @returns {Record<string, { last30d: number, lastMovementDate: string | null }>}
 */
export function aggregateConsumption(rows, now = new Date()) {
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const result = {};

  for (const r of rows) {
    if (!r.Item_No || !r.Posting_Date) continue;
    const cur = (result[r.Item_No] ??= { last30d: 0, lastMovementDate: null });

    if (!cur.lastMovementDate || r.Posting_Date > cur.lastMovementDate) {
      cur.lastMovementDate = r.Posting_Date;
    }

    const klass = classifyMovement(r.Entry_Type, r.Quantity ?? 0);
    if (klass !== 'uttak') continue;

    const qty = Math.abs(r.Quantity ?? 0);
    const ageMs = nowMs - new Date(r.Posting_Date).getTime();
    if (ageMs <= ms30) cur.last30d += qty;
  }

  return result;
}

let consumptionInFlight = null;

export async function getItemConsumption() {
  if (consumptionCache.data && Date.now() < consumptionCache.expiresAt) {
    console.log('[BC ledger] consumption cache-treff');
    return consumptionCache.data;
  }
  // Dedupliser samtidige kall: returner samme Promise hvis henting allerede pågår.
  if (consumptionInFlight) {
    console.log('[BC ledger] consumption henting allerede i gang – venter');
    return consumptionInFlight;
  }

  consumptionInFlight = (async () => {
    let token = await getBcToken();
    try {
      const rows = await fetchEntriesLast30Days(token);
      const data = aggregateConsumption(rows);
      consumptionCache = { data, expiresAt: Date.now() + CONSUMPTION_CACHE_TTL_MS };
      return data;
    } catch (err) {
      if (err.status === 401) {
        console.log('[BC ledger] 401 – invaliderer token og prøver igjen');
        invalidateBcTokenCache();
        token = await getBcToken();
        const rows = await fetchEntriesLast30Days(token);
        const data = aggregateConsumption(rows);
        consumptionCache = { data, expiresAt: Date.now() + CONSUMPTION_CACHE_TTL_MS };
        return data;
      }
      throw err;
    } finally {
      consumptionInFlight = null;
    }
  })();

  return consumptionInFlight;
}

export function invalidateConsumptionCache() {
  consumptionCache = { data: null, expiresAt: 0 };
  console.log('[BC ledger] consumption cache invalidert');
}

/**
 * Henter full bevegelseshistorikk for én vare, sortert nyeste først.
 * Ingen server-side cache – frontend bruker TanStack Query (5 min staleTime).
 *
 * @param {string} itemNumber     Eksakt match på BC `Item_No`
 * @param {string} [fromDate]     ISO-dato (YYYY-MM-DD). Default: 30 dager tilbake
 * @returns {Promise<Array<object>>}  Råe BC-rader (ikke transformerte feltnavn)
 */
export async function getItemLedgerEntries(itemNumber, fromDate) {
  if (!itemNumber || typeof itemNumber !== 'string') {
    const err = new Error('itemNumber er påkrevd');
    err.status = 400;
    throw err;
  }
  const safeItem = itemNumber.replace(/'/g, "''");
  const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().substring(0, 10);

  const fetchOnce = async (token) => {
    const companyName = await resolveCompanyName(token);
    const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/ODataV4`;
    const filter = encodeURIComponent(`Item_No eq '${safeItem}' and Posting_Date ge ${from}`);
    const select = 'Entry_No,Item_No,Posting_Date,Entry_Type,Document_No,Document_Type,' +
      'Location_Code,Quantity,Remaining_Quantity,Item_Description,Unit_of_Measure_Code';
    // BC OData Pages støtter ikke $orderby (HTTP 501) og returnerer ikke
    // @odata.nextLink når $top er satt. Vi dropper begge: BC sin server-side
    // page size + $skiptoken-paginering, og sorterer i JS etterpå.
    let url = `${base}/Company('${encodeURIComponent(companyName)}')/ItemLedgerEntries` +
      `?$filter=${filter}&$select=${select}`;

    console.log(`[BC ledger] entries for ${itemNumber} fra ${from}`);
    const rows = [];
    let pages = 0;
    while (url) {
      pages++;
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
      rows.push(...(data.value ?? []));
      url = data['@odata.nextLink'] ?? null;
    }
    console.log(`[BC ledger] entries for ${itemNumber}: ${rows.length} rader over ${pages} side(r)`);

    // Nyeste først; sekundær sort på Entry_No for stabil rekkefølge ved samme dato.
    rows.sort((a, b) => {
      if (a.Posting_Date !== b.Posting_Date) {
        return a.Posting_Date < b.Posting_Date ? 1 : -1;
      }
      return (b.Entry_No ?? 0) - (a.Entry_No ?? 0);
    });
    return rows;
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
