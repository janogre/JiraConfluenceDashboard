import 'dotenv/config';
import { getBcToken } from '../server/businessCentral/auth.js';

const TENANT = process.env.BC_TENANT_ID;
const ENV = process.env.BC_ENVIRONMENT;
const COMPANY_ID = process.env.BC_COMPANY_ID;

if (!TENANT || !ENV || !COMPANY_ID) {
  console.error('Mangler BC_TENANT_ID, BC_ENVIRONMENT eller BC_COMPANY_ID i .env');
  process.exit(1);
}

const token = await getBcToken();
const authHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

async function resolveCompanyName() {
  const url =
    `https://api.businesscentral.dynamics.com/v2.0/${TENANT}/${ENV}` +
    `/api/v2.0/companies(${COMPANY_ID})?$select=name,displayName`;
  const resp = await fetch(url, { headers: authHeaders });
  if (!resp.ok) {
    console.error(`Companies-oppslag feilet: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  console.log(`Selskap: name='${data.name}'  displayName='${data.displayName}'`);
  return data.name;
}

async function probe(label, url) {
  console.log(`\n── PROBE: ${label} ──`);
  console.log(`URL: ${url.substring(0, 200)}${url.length > 200 ? '…' : ''}`);
  const start = Date.now();
  let resp;
  try {
    resp = await fetch(url, { headers: authHeaders });
  } catch (err) {
    console.log(`✗ Nettverksfeil: ${err.message}`);
    return { ok: false };
  }
  const ms = Date.now() - start;
  const bodyText = await resp.text();
  console.log(`HTTP ${resp.status} (${ms}ms)`);

  if (!resp.ok) {
    console.log(`✗ Feil-body (første 600 tegn):`);
    console.log(bodyText.substring(0, 600));
    return { ok: false, status: resp.status };
  }

  let data;
  try { data = JSON.parse(bodyText); } catch {
    console.log(`✗ Klarte ikke å parse JSON. Første 300 tegn:`);
    console.log(bodyText.substring(0, 300));
    return { ok: false };
  }

  const rows = data.value ?? [];
  console.log(`✓ OK – ${rows.length} rad(er) returnert`);
  if (rows.length > 0) {
    const first = rows[0];
    console.log(`  Felter på rad 0: ${Object.keys(first).join(', ')}`);
    console.log(`  Eksempel-rad (første 500 tegn):`);
    console.log('  ' + JSON.stringify(first, null, 2).split('\n').join('\n  ').substring(0, 800));
  }
  return { ok: true, rows };
}

const companyName = await resolveCompanyName();
const encodedCompany = encodeURIComponent(companyName);
const odataBase =
  `https://api.businesscentral.dynamics.com/v2.0/${TENANT}/${ENV}` +
  `/ODataV4/Company('${encodedCompany}')`;

const apiV2Base =
  `https://api.businesscentral.dynamics.com/v2.0/${TENANT}/${ENV}` +
  `/api/v2.0/companies(${COMPANY_ID})`;

// 1) Sjekk om transferOrders finnes i standard v2.0 API
await probe(
  'API v2.0: /transferOrders (forventer 404/400 – ikke i standard)',
  `${apiV2Base}/transferOrders?$top=1`,
);

// 2) Sjekk ODataV4 TransferOrders (Page 5740)
const r2 = await probe(
  'ODataV4: /TransferOrders (Page 5740)',
  `${odataBase}/TransferOrders?$top=1`,
);

// 3) Hvis #2 fungerte, prøv $expand til linjer
if (r2.ok) {
  await probe(
    'ODataV4: /TransferOrders med $expand=TransferOrderLine',
    `${odataBase}/TransferOrders?$top=1&$expand=TransferOrderLine`,
  );

  await probe(
    'ODataV4: /TransferOrders med $expand=Transfer_Line (alt. navn)',
    `${odataBase}/TransferOrders?$top=1&$expand=Transfer_Line`,
  );

  await probe(
    "ODataV4: /TransferOrders filtrert på Status ne 'Finished'",
    `${odataBase}/TransferOrders?$top=5&$filter=${encodeURIComponent("Status ne 'Finished'")}`,
  );
}

// 4) Sjekk TransferOrderLine som egen entitet (Page 5741)
await probe(
  'ODataV4: /TransferOrderLine (Page 5741)',
  `${odataBase}/TransferOrderLine?$top=1`,
);

// 5) Sjekk metadata for å se hvilke entiteter som faktisk er publisert
console.log('\n── PROBE: ODataV4 service-rot (lister publiserte entiteter) ──');
const rootResp = await fetch(odataBase, { headers: authHeaders });
console.log(`HTTP ${rootResp.status}`);
if (rootResp.ok) {
  const rootData = await rootResp.json();
  const names = (rootData.value ?? []).map((e) => e.name).sort();
  const matches = names.filter((n) => /transfer|ledger|item/i.test(n));
  console.log(`Totalt ${names.length} entiteter publisert.`);
  console.log(`Treff på transfer/ledger/item (${matches.length}):`);
  for (const n of matches) console.log(`  • ${n}`);
}

console.log('\nFerdig.');
