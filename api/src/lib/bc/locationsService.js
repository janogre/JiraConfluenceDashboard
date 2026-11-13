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
