import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './env';
import { errorHandler, notFoundRoute } from './lib/errors';
import { apiRouter } from './routes';
import { purgeExpiredSessions } from './auth';
import { runDeadlineMonitor } from './deadlines/monitor';

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function createApp({ loginLimit = env.LOGIN_RATE_LIMIT } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });
  // Scheduled jobs, for hosts without a long-running process (Vercel): an external scheduler
  // (Supabase Cron) calls these with the shared secret. Both are safe to run repeatedly.
  const jobs: Record<string, () => Promise<unknown>> = {
    deadlines: () => runDeadlineMonitor(),
    sessions: () => purgeExpiredSessions(),
  };
  app.post('/api/cron/:job', async (req, res) => {
    const job = jobs[req.params.job];
    if (!job || !env.CRON_SECRET || !sameSecret(req.get('authorization'), env.CRON_SECRET)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    await job();
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

function sameSecret(header: string | undefined, secret: string) {
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
