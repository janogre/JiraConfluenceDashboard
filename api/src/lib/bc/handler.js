import { getBcItems } from './itemsService.js';
import { getBcLocations, NEAS_LOCATION_CODES } from './locationsService.js';
import { getBcPurchaseOrders } from './purchaseOrdersService.js';
import { getItemConsumption, getItemLedgerEntries } from './itemLedgerEntriesService.js';

// Oversetter en BC-feil til et HTTP-svar. Erstatter handleBcError fra Express-routeren.
export function bcError(err, context) {
  console.error(`[BC] ${context} feil:`, err.message);
  if (err.status === 401 || err.isAuthError) {
    return { status: 401, jsonBody: { error: 'BC-autentisering feilet. Kontakt administrator – sjekk BC_CLIENT_SECRET.' } };
  }
  if (
    err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ||
    err.name === 'TimeoutError' || err.name === 'AbortError'
  ) {
    return { status: 503, jsonBody: { error: 'Kunne ikke nå Business Central. Sjekk nettverkstilkobling og prøv igjen.' } };
  }
  return { status: 500, jsonBody: { error: `Business Central returnerte en feil (HTTP ${err.status ?? 500}).`, detail: err.message } };
}

// Ruter en BC-ressurs til riktig tjeneste. Kaster videre til bcError i funksjonsomslaget.
export async function handleBc(resource, query) {
  const fetchedAt = () => new Date().toISOString();

  switch (resource) {
    case 'items': {
      const items = await getBcItems();
      return { status: 200, jsonBody: { items, fetchedAt: fetchedAt() } };
    }
    case 'locations': {
      const locations = await getBcLocations();
      return { status: 200, jsonBody: { locations, neasLocationCodes: NEAS_LOCATION_CODES, fetchedAt: fetchedAt() } };
    }
    case 'purchase-orders': {
      const orders = await getBcPurchaseOrders();
      return { status: 200, jsonBody: { orders, fetchedAt: fetchedAt() } };
    }
    case 'item-consumption': {
      const consumption = await getItemConsumption();
      return { status: 200, jsonBody: { consumption, fetchedAt: fetchedAt() } };
    }
    case 'item-ledger-entries': {
      const itemNumber = query.get('itemNumber');
      const fromDate = query.get('fromDate') || undefined;
      if (!itemNumber) return { status: 400, jsonBody: { error: 'Mangler `itemNumber` query-parameter' } };
      const raw = await getItemLedgerEntries(itemNumber, fromDate);
      const entries = raw.map((r) => ({
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
      return { status: 200, jsonBody: { entries, fetchedAt: fetchedAt() } };
    }
    default:
      return { status: 404, jsonBody: { error: `Ukjent BC-ressurs: ${resource}` } };
  }
}
