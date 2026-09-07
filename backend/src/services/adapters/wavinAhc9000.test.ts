import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSetpointPayload,
  buildSetpointTopic,
  parseZoneStateMessage,
} from './wavinAhc9000.js';

const BASE_TOPIC = 'wavin';
const DEVICE_ID = '0C:8B:95:94:5B:7C';

function topic(zoneId: number | string, field: string): string {
  return `${BASE_TOPIC}/${DEVICE_ID}/${zoneId}/${field}`;
}

test('parses a current_temp field message', () => {
  const result = parseZoneStateMessage(topic(1, 'current_temp'), BASE_TOPIC, 22.6);
  assert.ok(result);
  assert.equal(result.zoneId, 1);
  assert.equal(result.deviceId, DEVICE_ID);
  assert.equal(result.patch.currentTemp, 22.6);
  assert.equal(result.patch.targetTemp, undefined);
});

test('parses a target_temp field message', () => {
  const result = parseZoneStateMessage(topic(1, 'target_temp'), BASE_TOPIC, 17);
  assert.ok(result);
  assert.equal(result.patch.targetTemp, 17);
  assert.equal(result.patch.currentTemp, undefined);
});

test('does not swap current_temp and target_temp across separate messages', () => {
  const current = parseZoneStateMessage(topic(9, 'current_temp'), BASE_TOPIC, 24.7);
  const target = parseZoneStateMessage(topic(9, 'target_temp'), BASE_TOPIC, 20);

  assert.ok(current);
  assert.ok(target);
  assert.equal(current.patch.currentTemp, 24.7);
  assert.equal(current.patch.targetTemp, undefined);
  assert.equal(target.patch.targetTemp, 20);
  assert.equal(target.patch.currentTemp, undefined);
});

test('recognizes telemetry-only fields (battery, rssi, current_draw) without mapping them to a Zone field', () => {
  const battery = parseZoneStateMessage(topic(1, 'battery'), BASE_TOPIC, 100);
  const rssi = parseZoneStateMessage(topic(1, 'rssi'), BASE_TOPIC, -31);
  const currentDraw = parseZoneStateMessage(topic(1, 'current_draw'), BASE_TOPIC, 0);

  for (const result of [battery, rssi, currentDraw]) {
    assert.ok(result);
    assert.equal(result.zoneId, 1);
    assert.equal(result.deviceId, DEVICE_ID);
    assert.ok(result.patch.lastUpdated);
  }
});

test('parses an attributes payload into name/limits/comfort/eco/mode/online, without touching current/target temp', () => {
  const result = parseZoneStateMessage(topic(11, 'attributes'), BASE_TOPIC, {
    firmware_version: '2.4.1',
    room: 'Emil',
    mode: 'heat',
    min_temp: 14,
    max_temp: 13,
    comfort_temp: 23.5,
    eco_temp: 20,
    current_temp: 23.89999962,
    target_temp: 20,
    online: true,
  });

  assert.ok(result);
  assert.equal(result.zoneId, 11);
  assert.equal(result.patch.name, 'Emil');
  assert.equal(result.patch.minTemp, 14);
  assert.equal(result.patch.maxTemp, 13);
  assert.equal(result.patch.comfortTemp, 23.5);
  assert.equal(result.patch.ecoTemp, 20);
  assert.equal(result.patch.online, true);
  // `mode: "heat"` isn't one of the internal Zone modes, so it must be dropped
  // rather than coerced.
  assert.equal(result.patch.mode, undefined);
  // attributes also happens to carry current_temp/target_temp, but those are
  // owned by the dedicated topics, not the attributes payload.
  assert.equal(result.patch.currentTemp, undefined);
  assert.equal(result.patch.targetTemp, undefined);
});

test('does not swap comfort_temp and eco_temp when parsing attributes', () => {
  const result = parseZoneStateMessage(topic(1, 'attributes'), BASE_TOPIC, {
    comfort_temp: 21,
    eco_temp: 17,
  });

  assert.ok(result);
  assert.equal(result.patch.comfortTemp, 21);
  assert.equal(result.patch.ecoTemp, 17);
});

test('parses a real-world zone mode value', () => {
  const result = parseZoneStateMessage(topic(1, 'attributes'), BASE_TOPIC, {
    mode: 'manual',
  });
  assert.ok(result);
  assert.equal(result.patch.mode, 'manual');
});

test('ignores topics for a different base topic', () => {
  const result = parseZoneStateMessage(`other/${DEVICE_ID}/1/current_temp`, BASE_TOPIC, 20);
  assert.equal(result, null);
});

test('ignores master topics (not a per-zone id)', () => {
  assert.equal(parseZoneStateMessage(topic('master', 'current_temp'), BASE_TOPIC, 24.5), null);
  assert.equal(parseZoneStateMessage(topic('master', 'attributes'), BASE_TOPIC, {}), null);
});

test('ignores unknown/unmodeled fields safely', () => {
  assert.equal(parseZoneStateMessage(topic(1, 'heat_demand'), BASE_TOPIC, 0), null);
  assert.equal(parseZoneStateMessage(topic(1, 'total_current'), BASE_TOPIC, 0), null);
  assert.equal(parseZoneStateMessage(`${BASE_TOPIC}/${DEVICE_ID}/telemetry`, BASE_TOPIC, {}), null);
});

test('ignores non-object payloads for attributes', () => {
  assert.equal(parseZoneStateMessage(topic(1, 'attributes'), BASE_TOPIC, null), null);
  assert.equal(parseZoneStateMessage(topic(1, 'attributes'), BASE_TOPIC, [1, 2]), null);
  assert.equal(parseZoneStateMessage(topic(1, 'attributes'), BASE_TOPIC, 'nope'), null);
});

test('ignores non-numeric payloads for numeric fields instead of coercing them', () => {
  assert.equal(parseZoneStateMessage(topic(1, 'current_temp'), BASE_TOPIC, '20'), null);
  assert.equal(parseZoneStateMessage(topic(1, 'current_temp'), BASE_TOPIC, null), null);
  assert.equal(parseZoneStateMessage(topic(1, 'battery'), BASE_TOPIC, 'full'), null);
});

test('drops fields with the wrong type in attributes instead of coercing them', () => {
  const result = parseZoneStateMessage(topic(1, 'attributes'), BASE_TOPIC, {
    current_temp: '20', // wrong type, must be ignored, not coerced
    mode: 'not-a-real-mode',
    online: 'true',
  });

  assert.ok(result);
  assert.equal(result.patch.mode, undefined);
  assert.equal(result.patch.online, undefined);
});

test('builds the expected setpoint command topic and plain-text payload', () => {
  assert.equal(
    buildSetpointTopic(BASE_TOPIC, DEVICE_ID, 4),
    `wavin/${DEVICE_ID}/4/set_temp`,
  );
  assert.equal(buildSetpointPayload(21.5), '21.5');
});
