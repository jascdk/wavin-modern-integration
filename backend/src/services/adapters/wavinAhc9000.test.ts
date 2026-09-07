import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSetpointPayload,
  buildSetpointTopic,
  parseZoneStateMessage,
} from './wavinAhc9000.js';

const BASE_TOPIC = 'wavin';

test('parses a full state payload into the Zone patch shape', () => {
  const result = parseZoneStateMessage(`${BASE_TOPIC}/3/state`, BASE_TOPIC, {
    name: 'Bedroom',
    current_temp: 18.6,
    target_temp: 19.5,
    min_temp: 5,
    max_temp: 30,
    comfort_temp: 21,
    eco_temp: 17,
    mode: 'manual',
    online: true,
  });

  assert.ok(result);
  assert.equal(result.zoneId, 3);
  assert.deepEqual(
    { ...result.patch, lastUpdated: undefined },
    {
      name: 'Bedroom',
      currentTemp: 18.6,
      targetTemp: 19.5,
      minTemp: 5,
      maxTemp: 30,
      comfortTemp: 21,
      ecoTemp: 17,
      mode: 'manual',
      online: true,
      lastUpdated: undefined,
    },
  );
});

test('does not swap current/target or comfort/eco fields when parsing', () => {
  const result = parseZoneStateMessage(`${BASE_TOPIC}/1/state`, BASE_TOPIC, {
    current_temp: 20,
    target_temp: 22,
    comfort_temp: 21,
    eco_temp: 17,
  });

  assert.ok(result);
  assert.equal(result.patch.currentTemp, 20);
  assert.equal(result.patch.targetTemp, 22);
  assert.equal(result.patch.comfortTemp, 21);
  assert.equal(result.patch.ecoTemp, 17);
});

test('ignores topics for a different base topic', () => {
  const result = parseZoneStateMessage('other/1/state', BASE_TOPIC, { current_temp: 20 });
  assert.equal(result, null);
});

test('ignores topics that are not zone state messages', () => {
  assert.equal(parseZoneStateMessage(`${BASE_TOPIC}/1/set`, BASE_TOPIC, {}), null);
  assert.equal(parseZoneStateMessage(`${BASE_TOPIC}/telemetry`, BASE_TOPIC, {}), null);
});

test('ignores non-object payloads', () => {
  assert.equal(parseZoneStateMessage(`${BASE_TOPIC}/1/state`, BASE_TOPIC, null), null);
  assert.equal(parseZoneStateMessage(`${BASE_TOPIC}/1/state`, BASE_TOPIC, [1, 2]), null);
  assert.equal(parseZoneStateMessage(`${BASE_TOPIC}/1/state`, BASE_TOPIC, 'nope'), null);
});

test('drops fields with the wrong type instead of coercing them', () => {
  const result = parseZoneStateMessage(`${BASE_TOPIC}/1/state`, BASE_TOPIC, {
    current_temp: '20', // wrong type, must be ignored, not coerced
    mode: 'not-a-real-mode',
    online: 'true',
  });

  assert.ok(result);
  assert.equal(result.patch.currentTemp, undefined);
  assert.equal(result.patch.mode, undefined);
  assert.equal(result.patch.online, undefined);
});

test('builds the expected setpoint command topic and payload', () => {
  assert.equal(buildSetpointTopic(BASE_TOPIC, 4), 'wavin/4/set');
  assert.equal(buildSetpointPayload(21.5), JSON.stringify({ target_temp: 21.5 }));
});
