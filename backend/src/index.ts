import { config } from './config/index.js';
import { createApp } from './app.js';
import { startMqttClient, stopMqttClient } from './services/mqttService.js';

const app = createApp();

startMqttClient();

const server = app.listen(config.port, () => {
  console.log(`[server] backend listening on port ${config.port} (${config.env})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[server] received ${signal}, shutting down`);
  server.close();
  await stopMqttClient();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
