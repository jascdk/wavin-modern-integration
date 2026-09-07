export interface Zone {
  id: number;
  /** MQTT device id (bridge MAC address) this zone was last seen under. */
  deviceId: string | null;
  name: string;
  currentTemp: number | null;
  targetTemp: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  comfortTemp: number | null;
  ecoTemp: number | null;
  mode: 'auto' | 'manual' | 'away' | 'off';
  online: boolean;
  lastUpdated: string | null;
}

// Live zone state, keyed by zone id. Populated exclusively by
// `adapters/wavinAhc9000.ts` as MQTT state messages arrive — there is no
// hardcoded seed data, so an empty store simply means no messages have been
// received yet (see ZonesTable's "No zones loaded yet" empty state).
const zones = new Map<number, Zone>();

export function getZones(): Zone[] {
  return Array.from(zones.values()).sort((a, b) => a.id - b.id);
}

export function getZone(id: number): Zone | undefined {
  return zones.get(id);
}

/**
 * Inserts or merges a partial zone update (as decoded from an MQTT state
 * payload) into the store. Existing fields are preserved when the incoming
 * payload omits them, so a message that only reports e.g. `current_temp`
 * doesn't wipe out previously known `min_temp`/`max_temp` values.
 */
export function upsertZone(
  id: number,
  patch: Partial<Omit<Zone, 'id'>>,
  deviceId?: string,
): Zone {
  const existing = zones.get(id);
  const merged: Zone = {
    id,
    deviceId: deviceId ?? existing?.deviceId ?? null,
    name: existing?.name ?? `Zone ${id}`,
    currentTemp: existing?.currentTemp ?? null,
    targetTemp: existing?.targetTemp ?? null,
    minTemp: existing?.minTemp ?? null,
    maxTemp: existing?.maxTemp ?? null,
    comfortTemp: existing?.comfortTemp ?? null,
    ecoTemp: existing?.ecoTemp ?? null,
    mode: existing?.mode ?? 'auto',
    online: existing?.online ?? true,
    lastUpdated: existing?.lastUpdated ?? null,
    ...patch,
  };
  zones.set(id, merged);
  return merged;
}

/**
 * Optimistically applies a locally-initiated target temperature change ahead
 * of the broker echoing back a confirmed state message. Used by the
 * `PATCH /api/zones/:id` write path.
 */
export function setZoneTargetTemp(id: number, targetTemp: number): Zone | undefined {
  const existing = zones.get(id);
  if (!existing) {
    return undefined;
  }
  return upsertZone(id, { targetTemp });
}

/** Clears all zone state. Exported for tests only. */
export function resetZonesForTest(): void {
  zones.clear();
}
