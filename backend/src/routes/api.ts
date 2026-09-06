import { Router } from 'express';
import { getMqttStatus } from '../services/mqttService.js';
import { getZones } from '../services/zoneService.js';

export const apiRouter = Router();

apiRouter.get('/status', (_req, res) => {
  res.json({
    app: {
      ok: true,
      service: 'backend',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    mqtt: getMqttStatus(),
  });
});

apiRouter.get('/zones', (_req, res) => {
  res.json({ zones: getZones() });
});
