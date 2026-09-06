import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/api.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(cors({ origin: config.corsOrigins }));

  app.use('/health', healthRouter);
  app.use('/api', apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
