import { Router } from 'express';
import { getMqttStatus, publishSetpoint } from '../services/mqttService.js';
import { getZone, getZones, setZoneTargetTemp } from '../services/zoneService.js';

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

apiRouter.patch('/zones/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid_zone_id' });
    return;
  }

  const zone = getZone(id);
  if (!zone) {
    res.status(404).json({ error: 'zone_not_found' });
    return;
  }

  const { targetTemp } = req.body as { targetTemp?: unknown };
  if (typeof targetTemp !== 'number' || !Number.isFinite(targetTemp)) {
    res.status(400).json({ error: 'invalid_target_temp' });
    return;
  }
  if (zone.minTemp !== null && targetTemp < zone.minTemp) {
    res.status(422).json({ error: 'target_below_min', minTemp: zone.minTemp });
    return;
  }
  if (zone.maxTemp !== null && targetTemp > zone.maxTemp) {
    res.status(422).json({ error: 'target_above_max', maxTemp: zone.maxTemp });
    return;
  }
  if (!zone.online) {
    res.status(409).json({ error: 'zone_offline' });
    return;
  }

  try {
    await publishSetpoint(id, targetTemp);
  } catch (err) {
    res.status(503).json({ error: 'mqtt_unavailable', message: (err as Error).message });
    return;
  }

  // Optimistically reflect the requested value until the bridge echoes back
  // a confirmed `.../state` message that overwrites it.
  const updated = setZoneTargetTemp(id, targetTemp);
  res.status(202).json({ zone: updated });
});
