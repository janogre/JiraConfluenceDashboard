import { Router } from 'express';
import { getBcItems } from './itemsService.js';
import { getBcLocations, NEAS_LOCATION_CODES } from './locationsService.js';
import { getBcPurchaseOrders } from './purchaseOrdersService.js';

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
  res.status(500).json({
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

export default router;
