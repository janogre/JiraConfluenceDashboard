import { Router } from 'express';
import { getBcItems } from './itemsService.js';

const router = Router();

router.get('/items', async (req, res) => {
  const start = Date.now();
  try {
    const items = await getBcItems();
    const elapsed = Date.now() - start;
    console.log(`[BC router] /items → ${items.length} varer, ${elapsed}ms`);
    res.json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[BC router] Feil:', err.message);

    if (err.status === 401) {
      return res.status(401).json({ error: 'BC-autentisering feilet. Kontakt administrator – sjekk BC_CLIENT_SECRET i .env.' });
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
});

export default router;
