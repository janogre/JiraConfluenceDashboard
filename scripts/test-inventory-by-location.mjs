import 'dotenv/config';
import { getBcToken } from '../server/businessCentral/auth.js';

const token = await getBcToken();
const odataBase = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/ODataV4`;
const companyUrl = `${odataBase}/Company('${encodeURIComponent("NEAS AS (Marked)")}')`;

// Hent alle åpne ledger-entries og summer klient-side
const select = 'Item_No,Location_Code,Remaining_Quantity';
let url = `${companyUrl}/ItemLedgerEntries?$filter=${encodeURIComponent('Open eq true')}&$select=${select}&$top=10000`;

const started = Date.now();
const byItemLocation = new Map(); // Map<itemNo, Map<locationCode, qty>>
let pages = 0;
let totalRows = 0;

while (url) {
  pages++;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!resp.ok) {
    console.error(`Side ${pages} status ${resp.status}:`, (await resp.text()).substring(0, 300));
    process.exit(1);
  }
  const data = await resp.json();
  const rows = data.value ?? [];
  totalRows += rows.length;
  console.log(`Side ${pages}: ${rows.length} rader (kumul: ${totalRows}, ${Date.now() - started}ms)`);

  for (const r of rows) {
    if (!r.Item_No) continue;
    let locMap = byItemLocation.get(r.Item_No);
    if (!locMap) {
      locMap = new Map();
      byItemLocation.set(r.Item_No, locMap);
    }
    const loc = r.Location_Code || '(TOM)';
    locMap.set(loc, (locMap.get(loc) ?? 0) + (r.Remaining_Quantity ?? 0));
  }

  url = data['@odata.nextLink'] ?? null;
}

const elapsed = Date.now() - started;
console.log(`\nFerdig: ${totalRows} entries → ${byItemLocation.size} varer over ${pages} sider på ${elapsed}ms\n`);

// Lokasjonsstatistikk
const locStats = new Map();
for (const [, locMap] of byItemLocation) {
  for (const [loc, qty] of locMap) {
    if (qty <= 0) continue;
    locStats.set(loc, (locStats.get(loc) ?? 0) + 1);
  }
}
console.log('Antall varer med positiv beholdning per lokasjon:');
for (const [loc, count] of [...locStats.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${loc.padEnd(20)} ${count}`);
}

// Vis et par varer som står på flere lokasjoner
console.log('\nEksempler på varer på flere lokasjoner:');
let examples = 0;
for (const [itemNo, locMap] of byItemLocation) {
  const positive = [...locMap.entries()].filter(([, q]) => q > 0);
  if (positive.length >= 2) {
    console.log(`  ${itemNo}: ${positive.map(([l, q]) => `${l}=${q}`).join(', ')}`);
    if (++examples >= 8) break;
  }
}
