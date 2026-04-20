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
