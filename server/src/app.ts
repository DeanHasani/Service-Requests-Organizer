import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './env';
import { errorHandler, notFoundRoute } from './lib/errors';
import { apiRouter } from './routes';

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function createApp({ loginLimit = env.LOGIN_RATE_LIMIT } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.use('/api', apiRouter({ loginLimit }));
  app.use('/api', notFoundRoute);

  // Production: serve the built client from the same origin (no CORS needed).
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile('index.html', { root: clientDist }));
  }

  app.use(errorHandler);
  return app;
}
