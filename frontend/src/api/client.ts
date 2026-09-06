import type { ApiStatus, Zone } from '../types';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchStatus(): Promise<ApiStatus> {
  return getJson<ApiStatus>('/api/status');
}

export async function fetchZones(): Promise<Zone[]> {
  const data = await getJson<{ zones: Zone[] }>('/api/zones');
  return data.zones;
}
