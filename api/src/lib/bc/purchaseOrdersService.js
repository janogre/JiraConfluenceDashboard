import { getBcToken, invalidateBcTokenCache } from './auth.js';
import { getBcLocations } from './locationsService.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
let ordersCache = { data: null, expiresAt: 0 };

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

async function fetchAllPages(token) {
  // status droppet – erstattet av derivedStatus, se computeDerivedStatus
  const select =
    'id,number,orderDate,vendorNumber,vendorName,shipToName,purchaser,fullyReceived,lastModifiedDateTime';
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

async function fetchAllItemModels(token) {
  // Henter number + displayName2 for alle varer, slik at vi kan berike
  // ordrelinjer med "Beskrivelse 2" (modellnummer) som ikke eksponeres
  // direkte på purchaseOrderLines i BC v2.0 API.
  const select = 'number,displayName2';
  const base = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/api/v2.0`;
  let url =
    `${base}/companies(${process.env.BC_COMPANY_ID})/items` +
    `?$select=${select}&$top=1000`;

  const models = new Map();
  let pageCount = 0;

  while (url) {
    pageCount++;
    console.log(`[BC items/models] Henter side ${pageCount}: ${url.substring(0, 120)}…`);

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[BC items/models] API-feil ${resp.status}:`, body.substring(0, 300));
      const err = new Error(`BC API feilet (${resp.status})`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }

    const data = await resp.json();
    for (const it of data.value ?? []) {
      if (it.number) models.set(it.number, it.displayName2 ?? '');
    }
    url = data['@odata.nextLink'] ?? null;
  }

  console.log(`[BC items/models] Totalt ${models.size} varer hentet over ${pageCount} side(r)`);
  return models;
}

async function enrichWithDescription2(orders, token) {
  let models;
  try {
    models = await fetchAllItemModels(token);
  } catch (err) {
    console.warn('[BC orders] Kunne ikke hente item-modeller – fortsetter uten description2:', err.message);
    return orders.map((order) => ({
      ...order,
      purchaseOrderLines: (order.purchaseOrderLines ?? []).map((line) => ({ ...line, description2: '' })),
    }));
  }

  return orders.map((order) => ({
    ...order,
    purchaseOrderLines: (order.purchaseOrderLines ?? []).map((line) => ({
      ...line,
      description2: models.get(line.lineObjectNumber) ?? '',
    })),
  }));
}

async function enrichWithLocationCodes(orders) {
  const locations = await getBcLocations();
  const locationMap = new Map(locations.map((l) => [l.id, l.code]));

  return orders.map((order) => {
    if (!order.purchaseOrderLines) {
      console.warn(`[BC orders] Ordre ${order.number} mangler purchaseOrderLines – returnerer tom liste`);
    }
    return {
      ...order,
      purchaseOrderLines: (order.purchaseOrderLines ?? []).map((line) => {
        const locationCode = locationMap.get(line.locationId);
        if (!locationCode && line.locationId) {
          console.warn(`[BC orders] Ukjent locationId: ${line.locationId} – setter UKJENT`);
        }
        return { ...line, locationCode: locationCode ?? 'UKJENT' };
      }),
    };
  });
}

function enrichWithDerivedStatus(orders) {
  return orders.map((order) => ({
    ...order,
    derivedStatus: computeDerivedStatus(order.purchaseOrderLines),
  }));
}

export async function getBcPurchaseOrders() {
  if (ordersCache.data && Date.now() < ordersCache.expiresAt) {
    console.log('[BC orders] Cache-treff');
    return ordersCache.data;
  }

  let token = await getBcToken();
  try {
    const orders = await fetchAllPages(token);
    const enriched = enrichWithDerivedStatus(
      await enrichWithDescription2(await enrichWithLocationCodes(orders), token)
    );
    ordersCache = { data: enriched, expiresAt: Date.now() + CACHE_TTL_MS };
    return enriched;
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC orders] 401 – invaliderer token-cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      const orders = await fetchAllPages(token);
      const enriched = enrichWithDerivedStatus(
        await enrichWithDescription2(await enrichWithLocationCodes(orders), token)
      );
      ordersCache = { data: enriched, expiresAt: Date.now() + CACHE_TTL_MS };
      return enriched;
    }
    throw err;
  }
}

export function invalidatePurchaseOrdersCache() {
  ordersCache = { data: null, expiresAt: 0 };
  console.log('[BC orders] Cache invalidert');
}

/**
 * Bygger en oppslagstabell fra varenummer → liste over åpne ordrer
 * (status 'Bestilt' eller 'Delvis mottatt') som inneholder den varen.
 * Brukes til å berike items med "i bestilling"-info.
 *
 * @returns {Map<string, Array<{
 *   orderNumber: string,
 *   outstandingQuantity: number,
 *   vendorName: string,
 *   locationCode: string,
 *   expectedReceiptDate: string,
 *   orderDate: string,
 * }>>}
 */
export async function getOpenOrdersByItem() {
  const orders = await getBcPurchaseOrders();
  const byItem = new Map();

  for (const order of orders) {
    if (order.derivedStatus !== 'Bestilt' && order.derivedStatus !== 'Delvis mottatt') continue;

    for (const line of order.purchaseOrderLines ?? []) {
      const outstanding = (line.quantity ?? 0) - (line.receivedQuantity ?? 0);
      if (outstanding <= 0) continue;
      if (!line.lineObjectNumber) continue;

      const entry = {
        orderNumber: order.number,
        outstandingQuantity: outstanding,
        vendorName: order.vendorName,
        locationCode: line.locationCode ?? 'UKJENT',
        expectedReceiptDate: line.expectedReceiptDate,
        orderDate: order.orderDate,
      };

      const existing = byItem.get(line.lineObjectNumber);
      if (existing) existing.push(entry);
      else byItem.set(line.lineObjectNumber, [entry]);
    }
  }

  return byItem;
}
