import { getBcToken, invalidateBcTokenCache } from './auth.js';
import { getInventoryByLocation } from './inventoryByLocationService.js';
import { getOpenOrdersByItem } from './purchaseOrdersService.js';

function buildOdataFilter() {
  const groups = (process.env.BC_ITEM_GROUPS || 'KOM,DRIFT')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  return groups.map((g) => `inventoryPostingGroupCode eq '${g.replace(/'/g, "''")}'`).join(' or ');
}

async function fetchAllPages(token) {
  const filter = buildOdataFilter();
  const select = 'number,displayName,displayName2,inventory,inventoryPostingGroupCode,lastModifiedDateTime';
  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/api/v2.0`;
  let url =
    `${base}/companies(${process.env.BC_COMPANY_ID})/items` +
    `?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=1000`;

  const items = [];
  let pageCount = 0;

  while (url) {
    pageCount++;
    console.log(`[BC items] Henter side ${pageCount}: ${url.substring(0, 120)}…`);

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[BC items] API-feil ${resp.status}:`, body.substring(0, 300));
      const err = new Error(`BC API feilet (${resp.status})`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }

    const data = await resp.json();
    items.push(...(data.value ?? []));
    url = data['@odata.nextLink'] ?? null;
  }

  console.log(`[BC items] Totalt ${items.length} varer hentet over ${pageCount} side(r)`);
  return items;
}

async function enrichWithInventoryByLocation(items) {
  try {
    const byLoc = await getInventoryByLocation();
    return items.map((item) => ({
      ...item,
      inventoryByLocation: byLoc.get(item.number) ?? {},
    }));
  } catch (err) {
    console.warn('[BC items] Kunne ikke hente inventoryByLocation – returnerer uten:', err.message);
    return items.map((item) => ({ ...item, inventoryByLocation: {} }));
  }
}

async function enrichWithOpenOrders(items) {
  try {
    const byItem = await getOpenOrdersByItem();
    return items.map((item) => ({
      ...item,
      openOrders: byItem.get(item.number) ?? [],
    }));
  } catch (err) {
    console.warn('[BC items] Kunne ikke hente openOrders – returnerer uten:', err.message);
    return items.map((item) => ({ ...item, openOrders: [] }));
  }
}

export async function getBcItems() {
  let token = await getBcToken();
  try {
    const items = await fetchAllPages(token);
    // Consumption hentes ikke her – frontend laster /item-consumption separat
    // og merger på item.number for å unngå at /items blokkerer på 53 sider
    // med ItemLedgerEntries.
    return await enrichWithOpenOrders(await enrichWithInventoryByLocation(items));
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC items] 401 mottatt – invaliderer cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      const items = await fetchAllPages(token);
      return await enrichWithOpenOrders(await enrichWithInventoryByLocation(items));
    }
    throw err;
  }
}
