/**
 * Adapter for jascdk/wavin_ahc9000_advanced_mqtt.
 *
 * The two repositories never share code — they only agree on an MQTT topic
 * layout and JSON payload schema under the configured base topic (default
 * `wavin`, see `config.mqtt.baseTopic`). This module is the single place
 * that understands that schema; every other part of the backend only deals
 * with the internal `Zone` model (see `../zoneService.ts`).
 *
 * Topic layout (relative to `<baseTopic>`):
 *   - State (subscribed):  `<baseTopic>/<zoneId>/state`
 *       JSON payload: {
 *         name?: string,
 *         current_temp?: number,
 *         target_temp?: number,
 *         min_temp?: number,
 *         max_temp?: number,
 *         comfort_temp?: number,
 *         eco_temp?: number,
 *         mode?: 'auto' | 'manual' | 'away' | 'off',
 *         online?: boolean,
 *       }
 *   - Setpoint command (published): `<baseTopic>/<zoneId>/set`
 *       JSON payload: { target_temp: number }
 *
 * All fields are read explicitly by name below (no positional/array
 * decoding) specifically to avoid the class of bug where two numeric
 * fields silently get swapped because of assumed ordering.
 */

import type { Zone } from '../zoneService.js';

export interface ParsedZoneState {
  zoneId: number;
  patch: Partial<Omit<Zone, 'id'>>;
}

const STATE_TOPIC_RE = /^(.+)\/(\d+)\/state$/;

/**
 * Attempts to interpret an MQTT topic + decoded JSON payload as a zone state
 * update for the given base topic. Returns `null` when the topic doesn't
 * match the expected `<baseTopic>/<zoneId>/state` shape, or when the
 * payload isn't a JSON object — callers should treat that as "not a zone
 * state message" rather than an error.
 */
export function parseZoneStateMessage(
  topic: string,
  baseTopic: string,
  payload: unknown,
): ParsedZoneState | null {
  const match = STATE_TOPIC_RE.exec(topic);
  if (!match) {
    return null;
  }

  const [, matchedBaseTopic, zoneIdRaw] = match;
  if (matchedBaseTopic !== baseTopic) {
    return null;
  }

  const zoneId = Number.parseInt(zoneIdRaw, 10);
  if (!Number.isInteger(zoneId)) {
    return null;
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const patch: Partial<Omit<Zone, 'id'>> = {};

  const name = asString(data.name);
  if (name !== undefined) patch.name = name;

  const currentTemp = asFiniteNumber(data.current_temp);
  if (currentTemp !== undefined) patch.currentTemp = currentTemp;

  const targetTemp = asFiniteNumber(data.target_temp);
  if (targetTemp !== undefined) patch.targetTemp = targetTemp;

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

  patch.lastUpdated = new Date().toISOString();

  return { zoneId, patch };
}

/** Builds the command topic a setpoint change should be published to. */
export function buildSetpointTopic(baseTopic: string, zoneId: number): string {
  return `${baseTopic}/${zoneId}/set`;
}

/** Builds the JSON payload for a setpoint change command. */
export function buildSetpointPayload(targetTemp: number): string {
  return JSON.stringify({ target_temp: targetTemp });
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
