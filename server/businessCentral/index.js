import { Router } from 'express';
import { getBcItems } from './itemsService.js';
import { getBcLocations, NEAS_LOCATION_CODES } from './locationsService.js';
import { getBcPurchaseOrders } from './purchaseOrdersService.js';
import { getItemConsumption, getItemLedgerEntries } from './itemLedgerEntriesService.js';

const router = Router();

function handleBcError(err, res, context) {
  console.error(`[BC router] ${context} feil:`, err.message);
  if (err.status === 401 || err.isAuthError) {
    return res.status(401).json({
      error: 'BC-autentisering feilet. Kontakt administrator – sjekk BC_CLIENT_SECRET i .env.',
    });
  }
  if (
    err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ||
    err.name === 'TimeoutError' || err.name === 'AbortError'
  ) {
    return res.status(503).json({ error: 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.' });
  }
  return res.status(500).json({
    error: `Business Central returnerte en feil (HTTP ${err.status ?? 500}).`,
    detail: err.message,
  });
}

router.get('/items', async (req, res) => {
  const start = Date.now();
  try {
    const items = await getBcItems();
    console.log(`[BC router] /items → ${items.length} varer, ${Date.now() - start}ms`);
    res.json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/items');
  }
});

router.get('/locations', async (req, res) => {
  const start = Date.now();
  try {
    const locations = await getBcLocations();
    console.log(`[BC router] /locations → ${locations.length} lokasjoner, ${Date.now() - start}ms`);
    res.json({ locations, neasLocationCodes: NEAS_LOCATION_CODES, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/locations');
  }
});

router.get('/purchase-orders', async (req, res) => {
  const start = Date.now();
  try {
    const orders = await getBcPurchaseOrders();
    console.log(`[BC router] /purchase-orders → ${orders.length} ordrer, ${Date.now() - start}ms`);
    res.json({ orders, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/purchase-orders');
  }
});

router.get('/item-consumption', async (req, res) => {
  const start = Date.now();
  try {
    const consumption = await getItemConsumption();
    console.log(`[BC router] /item-consumption → ${Object.keys(consumption).length} varer, ${Date.now() - start}ms`);
    res.json({ consumption, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, '/item-consumption');
  }
});

router.get('/item-ledger-entries', async (req, res) => {
  const start = Date.now();
  const { itemNumber, fromDate } = req.query;
  if (!itemNumber || typeof itemNumber !== 'string') {
    return res.status(400).json({ error: 'Mangler `itemNumber` query-parameter' });
  }
  try {
    const rawEntries = await getItemLedgerEntries(itemNumber, typeof fromDate === 'string' ? fromDate : undefined);
    const entries = rawEntries.map((r) => ({
      entryNo: r.Entry_No,
      itemNumber: r.Item_No,
      postingDate: r.Posting_Date,
      entryType: r.Entry_Type,
      documentNumber: r.Document_No,
      documentType: r.Document_Type,
      locationCode: r.Location_Code ?? 'UKJENT',
      quantity: r.Quantity ?? 0,
      remainingQuantity: r.Remaining_Quantity ?? 0,
      description: r.Item_Description ?? '',
      unitOfMeasureCode: r.Unit_of_Measure_Code ?? '',
    }));
    console.log(`[BC router] /item-ledger-entries(${itemNumber}) → ${entries.length} rader, ${Date.now() - start}ms`);
    res.json({ entries, fetchedAt: new Date().toISOString() });
  } catch (err) {
    handleBcError(err, res, `/item-ledger-entries(${itemNumber})`);
  }
});

export default router;
