/**
 * Adapter for jascdk/wavin_ahc9000_advanced_mqtt.
 *
 * The two repositories never share code — they only agree on an MQTT topic
 * layout and payload schema under the configured base topic (default
 * `wavin`, see `config.mqtt.baseTopic`). This module is the single place
 * that understands that schema; every other part of the backend only deals
 * with the internal `Zone` model (see `../zoneService.ts`).
 *
 * Real-world topic layout (as published by the ESP32 bridge firmware),
 * relative to `<baseTopic>`:
 *
 *   `<baseTopic>/<deviceId>/<zoneId>/<field>`
 *
 * where `<deviceId>` is the bridge's MAC address (e.g. `0C:8B:95:94:5B:7C`),
 * `<zoneId>` is a room number (or the literal `master` for the whole-house
 * virtual thermostat, which is not modeled as a zone here), and `<field>` is
 * one of several independently-published values per zone:
 *
 *   - `current_temp`  — plain number, e.g. `22.6`
 *   - `target_temp`   — plain number, e.g. `17`
 *   - `battery`       — plain number (percent)
 *   - `rssi`          — plain number (dBm)
 *   - `current_draw`  — plain number (mA)
 *   - `attributes`    — JSON object with (among others): `room`, `min_temp`,
 *     `max_temp`, `comfort_temp`, `eco_temp`, `mode`, `online`
 *   - `valve`, `lock` — `ON`/`OFF` text, not JSON — never reaches this
 *     module (see `mqttService.ts`'s JSON-parsing guard)
 *
 * Since each field arrives as its own retained message rather than one
 * combined state payload, `parseZoneStateMessage` returns a *partial* patch
 * for whichever single field the topic identifies; `zoneService.upsertZone`
 * merges those partial patches over time so a zone's known fields survive
 * across messages that only report one value.
 *
 * Setpoint writes are published to `<baseTopic>/<deviceId>/<zoneId>/set_temp`
 * as a plain-text number (not JSON) — the firmware parses it with
 * `String::toFloat()`.
 *
 * All fields are read explicitly by name below (no positional/array
 * decoding) specifically to avoid the class of bug where two numeric
 * fields silently get swapped because of assumed ordering.
 */

import type { Zone } from '../zoneService.js';

export interface ParsedZoneState {
  zoneId: number;
  deviceId: string;
  patch: Partial<Omit<Zone, 'id'>>;
}

const FIELD_TOPIC_RE = /^(.+)\/([^/]+)\/(\d+)\/([A-Za-z0-9_]+)$/;

const KNOWN_FIELDS = new Set([
  'current_temp',
  'target_temp',
  'battery',
  'rssi',
  'current_draw',
  'attributes',
]);

/**
 * Attempts to interpret an MQTT topic + decoded JSON payload as a zone
 * update for the given base topic. Returns `null` when the topic doesn't
 * match the expected `<baseTopic>/<deviceId>/<zoneId>/<field>` shape, the
 * zone id isn't numeric (e.g. the `master` topics), the field isn't one of
 * the known per-zone fields, or the payload has the wrong shape for that
 * field — callers should treat that as "not a zone update" rather than an
 * error.
 */
export function parseZoneStateMessage(
  topic: string,
  baseTopic: string,
  payload: unknown,
): ParsedZoneState | null {
  const match = FIELD_TOPIC_RE.exec(topic);
  if (!match) {
    return null;
  }

  const [, matchedBaseTopic, deviceId, zoneIdRaw, field] = match;
  if (matchedBaseTopic !== baseTopic) {
    return null;
  }

  if (!KNOWN_FIELDS.has(field)) {
    return null;
  }

  const zoneId = Number.parseInt(zoneIdRaw, 10);
  if (!Number.isInteger(zoneId)) {
    return null;
  }

  const patch: Partial<Omit<Zone, 'id'>> = {};

  switch (field) {
    case 'current_temp': {
      const value = asFiniteNumber(payload);
      if (value === undefined) return null;
      patch.currentTemp = value;
      break;
    }
    case 'target_temp': {
      const value = asFiniteNumber(payload);
      if (value === undefined) return null;
      patch.targetTemp = value;
      break;
    }
    case 'battery':
    case 'rssi':
    case 'current_draw': {
      // Recognized telemetry fields confirming the zone is alive. Not
      // (yet) part of the Zone model, but they must not be logged as
      // unrecognized/ignored — they still count as a valid zone update.
      if (asFiniteNumber(payload) === undefined) return null;
      break;
    }
    case 'attributes': {
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return null;
      }
      const data = payload as Record<string, unknown>;

      const room = asString(data.room);
      if (room !== undefined) patch.name = room;

      const minTemp = asFiniteNumber(data.min_temp);
      if (minTemp !== undefined) patch.minTemp = minTemp;

      const maxTemp = asFiniteNumber(data.max_temp);
      if (maxTemp !== undefined) patch.maxTemp = maxTemp;

      const comfortTemp = asFiniteNumber(data.comfort_temp);
      if (comfortTemp !== undefined) patch.comfortTemp = comfortTemp;

      const ecoTemp = asFiniteNumber(data.eco_temp);
      if (ecoTemp !== undefined) patch.ecoTemp = ecoTemp;

      const mode = asZoneMode(data.mode);
      if (mode !== undefined) patch.mode = mode;

      const online = asBoolean(data.online);
      if (online !== undefined) patch.online = online;
      break;
    }
    default:
      return null;
  }

  patch.lastUpdated = new Date().toISOString();

  return { zoneId, deviceId, patch };
}

/** Builds the command topic a setpoint change should be published to. */
export function buildSetpointTopic(baseTopic: string, deviceId: string, zoneId: number): string {
  return `${baseTopic}/${deviceId}/${zoneId}/set_temp`;
}

/**
 * Builds the payload for a setpoint change command. The firmware expects a
 * plain-text number (parsed with `String::toFloat()`), not JSON.
 */
export function buildSetpointPayload(targetTemp: number): string {
  return String(targetTemp);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

const ZONE_MODES = new Set(['auto', 'manual', 'away', 'off']);

function asZoneMode(value: unknown): Zone['mode'] | undefined {
  return typeof value === 'string' && ZONE_MODES.has(value) ? (value as Zone['mode']) : undefined;
}
