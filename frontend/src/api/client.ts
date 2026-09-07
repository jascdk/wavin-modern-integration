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

export interface SetZoneTargetResult {
  zone?: Zone;
  error?: string;
  minTemp?: number;
  maxTemp?: number;
  message?: string;
}

/**
 * Requests a target temperature change for a zone. Issues
 * `PATCH /api/zones/:id`, which the backend validates against the zone's
 * min/max limits before publishing the setpoint command over MQTT (see
 * `backend/src/routes/api.ts` and `backend/src/services/mqttService.ts`).
 */
export async function setZoneTarget(id: number, targetTemp: number): Promise<SetZoneTargetResult> {
  const response = await fetch(`${API_BASE_URL}/api/zones/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetTemp }),
  });
  const body = (await response.json().catch(() => ({}))) as SetZoneTargetResult;
  if (!response.ok) {
    throw Object.assign(new Error(body.error ?? `API request failed: ${response.status}`), body);
  }
  return body;
}
