import mqtt, { type MqttClient } from 'mqtt';
import { config } from '../config/index.js';
import { buildSetpointPayload, buildSetpointTopic, parseZoneStateMessage } from './adapters/wavinAhc9000.js';
import { upsertZone } from './zoneService.js';

export interface MqttStatus {
  connected: boolean;
  brokerUrl: string;
  clientId: string;
  baseTopic: string;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastMessageTopic: string | null;
  lastError: string | null;
  reconnectCount: number;
}

const status: MqttStatus = {
  connected: false,
  brokerUrl: config.mqtt.url,
  clientId: config.mqtt.clientId,
  baseTopic: config.mqtt.baseTopic,
  lastConnectedAt: null,
  lastMessageAt: null,
  lastMessageTopic: null,
  lastError: 'not connected yet',
  reconnectCount: 0,
};

let client: MqttClient | null = null;

/**
 * Safely parses an MQTT payload as JSON. Returns null when the payload is not
 * valid JSON so a malformed broker message can never crash the service.
 */
export function safeParseJsonPayload(payload: Buffer): unknown | null {
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return null;
  }
}

function subscribeZoneTopics(mqttClient: MqttClient): void {
  // Subscribes to every topic under the base topic; `parseZoneStateMessage`
  // (adapters/wavinAhc9000.ts) filters down to the ones that match the
  // `<baseTopic>/<zoneId>/state` shape it understands.
  const topics = [`${config.mqtt.baseTopic}/#`];

  for (const topic of topics) {
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`[mqtt] failed to subscribe to ${topic}:`, err.message);
      } else {
        console.log(`[mqtt] subscribed to ${topic}`);
      }
    });
  }
}

export function startMqttClient(): MqttClient {
  if (client) {
    return client;
  }

  console.log(`[mqtt] connecting to ${config.mqtt.url} as ${config.mqtt.clientId}`);

  client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    clean: true,
  });

  client.on('connect', () => {
    status.connected = true;
    status.lastConnectedAt = new Date().toISOString();
    status.lastError = null;
    console.log('[mqtt] connected');
    subscribeZoneTopics(client as MqttClient);
  });

  client.on('reconnect', () => {
    status.connected = false;
    status.reconnectCount += 1;
    console.log(`[mqtt] reconnecting (attempt ${status.reconnectCount})`);
  });

  client.on('close', () => {
    status.connected = false;
    console.log('[mqtt] connection closed');
  });

  client.on('offline', () => {
    status.connected = false;
    console.log('[mqtt] client offline');
  });

  client.on('error', (err) => {
    status.connected = false;
    status.lastError = err.message || 'connection error';
    console.error('[mqtt] error:', status.lastError);
  });

  client.on('message', (topic, payload) => {
    status.lastMessageAt = new Date().toISOString();
    status.lastMessageTopic = topic;

    const parsed = safeParseJsonPayload(payload);
    if (parsed === null) {
      console.warn(`[mqtt] received non-JSON payload on ${topic}, ignoring`);
      return;
    }

    const zoneState = parseZoneStateMessage(topic, config.mqtt.baseTopic, parsed);
    if (zoneState === null) {
      console.log(`[mqtt] unrecognized message on ${topic}:`, JSON.stringify(parsed));
      return;
    }

    upsertZone(zoneState.zoneId, zoneState.patch);
  });

  return client;
}

/**
 * Publishes a setpoint change to the bridge's command topic for the given
 * zone. Returns a promise that resolves once the broker has acknowledged
 * the publish, and rejects if no MQTT client is connected or the publish
 * fails.
 */
export async function publishSetpoint(zoneId: number, targetTemp: number): Promise<void> {
  if (!client || !status.connected) {
    throw new Error('mqtt client is not connected');
  }
  const topic = buildSetpointTopic(config.mqtt.baseTopic, zoneId);
  const payload = buildSetpointPayload(targetTemp);
  await client.publishAsync(topic, payload, { qos: 1 });
}

export function getMqttStatus(): MqttStatus {
  return { ...status };
}

export async function stopMqttClient(): Promise<void> {
  if (!client) {
    return;
  }
  await client.endAsync();
  client = null;
  status.connected = false;
}
