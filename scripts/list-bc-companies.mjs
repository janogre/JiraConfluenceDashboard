import 'dotenv/config';
import { getBcToken } from '../server/businessCentral/auth.js';

const token = await getBcToken();
const url = `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}/api/v2.0/companies?$select=id,name,displayName`;

const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!resp.ok) {
  console.error('Feil:', resp.status, await resp.text());
  process.exit(1);
}

const data = await resp.json();
console.log('\nTilgjengelige selskaper:\n');
for (const c of data.value) {
  console.log(`  id:          ${c.id}`);
  console.log(`  name:        ${c.name}`);
  console.log(`  displayName: ${c.displayName}`);
  console.log('');
}
console.log('Kopier id-en for riktig selskap inn i BC_COMPANY_ID i .env');
