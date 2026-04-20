import { getApi } from './api';
import type { BcItemsResponse, BcLocationsResponse, BcPurchaseOrdersResponse } from '../types';

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
