import { getBcToken, invalidateBcTokenCache } from './auth.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, expiresAt: 0 };

async function fetchOpenLedgerPages(token) {
  const companyName = process.env.BC_COMPANY_NAME;
  if (!companyName) throw new Error('[BC invByLoc] BC_COMPANY_NAME mangler i .env');

  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/ODataV4`;
  const companyUrl = `${base}/Company('${encodeURIComponent(companyName)}')`;
  const select = 'Item_No,Location_Code,Remaining_Quantity';
  let url = `${companyUrl}/ItemLedgerEntries?$filter=${encodeURIComponent('Open eq true')}&$select=${select}&$top=10000`;

  // Map<itemNo, Record<locationCode, qty>>
  const result = new Map();
  let pages = 0;
  let totalRows = 0;

  while (url) {
    pages++;
    console.log(`[BC invByLoc] Henter side ${pages}…`);
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[BC invByLoc] API-feil ${resp.status}:`, body.substring(0, 300));
      const err = new Error(`BC API feilet (${resp.status})`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }

    const data = await resp.json();
    const rows = data.value ?? [];
    totalRows += rows.length;

    for (const r of rows) {
      if (!r.Item_No) continue;
      const loc = r.Location_Code || 'UKJENT';
      const qty = r.Remaining_Quantity ?? 0;
      let locMap = result.get(r.Item_No);
      if (!locMap) {
        locMap = {};
        result.set(r.Item_No, locMap);
      }
      locMap[loc] = (locMap[loc] ?? 0) + qty;
    }

    url = data['@odata.nextLink'] ?? null;
  }

  console.log(`[BC invByLoc] ${totalRows} åpne entries → ${result.size} varer over ${pages} side(r)`);
  return result;
}

export async function getInventoryByLocation() {
  if (cache.data && Date.now() < cache.expiresAt) {
    console.log('[BC invByLoc] Cache-treff');
    return cache.data;
  }

  let token = await getBcToken();
  try {
    const data = await fetchOpenLedgerPages(token);
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC invByLoc] 401 – invaliderer token-cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      const data = await fetchOpenLedgerPages(token);
      cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    }
    throw err;
  }
}

export function invalidateInventoryByLocationCache() {
  cache = { data: null, expiresAt: 0 };
  console.log('[BC invByLoc] Cache invalidert');
}
