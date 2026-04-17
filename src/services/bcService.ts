import { getApi } from './api';
import type { BcItemsResponse } from '../types';

export async function fetchBcItems(): Promise<BcItemsResponse> {
  const resp = await getApi().get<BcItemsResponse>('/api/bc/items');
  return resp.data;
}
