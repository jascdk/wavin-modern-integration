import dotenv from 'dotenv';

dotenv.config();

function parseOrigins(value: string | undefined): string[] {
  if (!value) {
    return ['http://localhost:5173', 'http://localhost:8080'];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  mqtt: {
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: process.env.MQTT_CLIENT_ID ?? 'wavin-modern-backend',
    baseTopic: process.env.MQTT_BASE_TOPIC ?? 'wavin',
  },
} as const;

export type AppConfig = typeof config;
