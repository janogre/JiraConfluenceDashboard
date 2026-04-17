import { getBcToken, invalidateBcTokenCache } from './auth.js';

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

export async function getBcItems() {
  let token = await getBcToken();
  try {
    return await fetchAllPages(token);
  } catch (err) {
    if (err.status === 401) {
      console.log('[BC items] 401 mottatt – invaliderer cache og prøver på nytt');
      invalidateBcTokenCache();
      token = await getBcToken();
      return await fetchAllPages(token);
    }
    throw err;
  }
}
