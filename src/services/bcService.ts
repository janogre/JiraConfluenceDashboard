import { getApi } from './api';
import type {
  BcItemsResponse, BcLocationsResponse, BcPurchaseOrdersResponse,
  BcItemLedgerEntriesResponse, BcItemConsumptionResponse,
} from '../types';

export async function fetchBcItems(): Promise<BcItemsResponse> {
  const resp = await getApi().get<BcItemsResponse>('/api/bc/items');
  return resp.data;
}

export async function fetchBcLocations(): Promise<BcLocationsResponse> {
  const resp = await getApi().get<BcLocationsResponse>('/api/bc/locations');
  return resp.data;
}

export async function fetchBcPurchaseOrders(): Promise<BcPurchaseOrdersResponse> {
  const resp = await getApi().get<BcPurchaseOrdersResponse>('/api/bc/purchase-orders');
  return resp.data;
}

export async function fetchBcItemConsumption(): Promise<BcItemConsumptionResponse> {
  const resp = await getApi().get<BcItemConsumptionResponse>('/api/bc/item-consumption');
  return resp.data;
}

export async function fetchBcItemLedgerEntries(
  itemNumber: string,
  fromDate?: string,
): Promise<BcItemLedgerEntriesResponse> {
  const params = new URLSearchParams({ itemNumber });
  if (fromDate) params.set('fromDate', fromDate);
  const resp = await getApi().get<BcItemLedgerEntriesResponse>(
    `/api/bc/item-ledger-entries?${params.toString()}`,
  );
  return resp.data;
}
