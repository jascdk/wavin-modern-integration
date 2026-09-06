import mqtt, { type MqttClient } from 'mqtt';
import { config } from '../config/index.js';

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

function subscribePlaceholders(mqttClient: MqttClient): void {
  // Placeholder subscriptions. Hardware-specific topics will be wired up by
  // the future adapter for jascdk/wavin_ahc9000_advanced_mqtt (see docs/architecture.md).
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
    subscribePlaceholders(client as MqttClient);
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
    // Placeholder: route decoded messages into zone state / activity log here.
    console.log(`[mqtt] message on ${topic}:`, JSON.stringify(parsed));
  });

  return client;
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
