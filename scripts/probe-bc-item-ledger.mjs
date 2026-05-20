import 'dotenv/config';
import { getBcToken } from '../server/businessCentral/auth.js';

const t = await getBcToken();
const headers = { Authorization: `Bearer ${t}`, Accept: 'application/json' };
const base =
  `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}` +
  `/${process.env.BC_ENVIRONMENT}/ODataV4/Company('NEAS%20AS%20(Marked)')`;

// 1) Hent én rad for å se hvilke felter som er tilgjengelige
console.log('── Felter på en ItemLedgerEntry ──');
const r1 = await fetch(`${base}/ItemLedgerEntries?$top=1`, { headers });
const d1 = await r1.json();
if (d1.value?.[0]) {
  console.log(Object.keys(d1.value[0]).sort().join('\n'));
}

// 2) Hent siste 12 mnd og tell per Entry_Type
console.log('\n── Entry_Type-fordeling siste 12 mnd (alle varer) ──');
const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
const filter = encodeURIComponent(`Posting_Date ge ${fromDate}`);
const select = 'Entry_Type,Quantity';
let url = `${base}/ItemLedgerEntries?$filter=${filter}&$select=${select}&$top=10000`;
const counts = new Map();
let totalRows = 0;
let pages = 0;
while (url) {
  pages++;
  const r = await fetch(url, { headers });
  if (!r.ok) {
    console.error(`Feil side ${pages}: ${r.status}`);
    break;
  }
  const d = await r.json();
  for (const row of d.value ?? []) {
    totalRows++;
    const t = row.Entry_Type ?? '(tom)';
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  url = d['@odata.nextLink'] ?? null;
  if (pages > 20) {
    console.log('(stopper etter 20 sider for raskhet)');
    break;
  }
}
console.log(`Totalt ${totalRows} entries over ${pages} side(r)`);
for (const [type, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(20)} ${n}`);
}

// 3) Vis et utdrag for én vare (første som finnes) for å demonstrere bevegelseslogg
console.log('\n── Eksempel: full historikk for én vare ──');
const sample = await fetch(`${base}/ItemLedgerEntries?$top=1&$select=Item_No`, { headers });
const sampleData = await sample.json();
const itemNo = sampleData.value?.[0]?.Item_No;
if (itemNo) {
  console.log(`Varenr: ${itemNo}`);
  const histUrl =
    `${base}/ItemLedgerEntries?$filter=${encodeURIComponent(`Item_No eq '${itemNo}'`)}` +
    `&$select=Posting_Date,Entry_Type,Document_No,Location_Code,Quantity,Remaining_Quantity,Description` +
    `&$orderby=Posting_Date desc&$top=10`;
  const r = await fetch(histUrl, { headers });
  const d = await r.json();
  console.log(`Siste ${d.value?.length ?? 0} bevegelser:`);
  for (const row of d.value ?? []) {
    const date = row.Posting_Date?.substring(0, 10);
    const qty = String(row.Quantity).padStart(8);
    console.log(
      `  ${date}  ${(row.Entry_Type ?? '').padEnd(16)} ${qty}  ` +
      `${(row.Location_Code ?? '').padEnd(10)} ${row.Document_No ?? ''}`,
    );
  }
}
