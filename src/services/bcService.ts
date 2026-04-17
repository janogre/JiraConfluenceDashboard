import axios from 'axios';
import type { BcItemsResponse } from '../types';

export async function fetchBcItems(): Promise<BcItemsResponse> {
  const resp = await axios.get<BcItemsResponse>('/api/bc/items', {
    withCredentials: true,
  });
  return resp.data;
}
