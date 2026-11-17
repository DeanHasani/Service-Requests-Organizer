import { createApp } from './app';
import { purgeExpiredSessions } from './auth';
import { prisma } from './db';
import { env } from './env';
import { runEscalations } from './services/requests';

const server = createApp().listen(env.PORT, () => {
  console.log(`DESKFLOW API listening on http://localhost:${env.PORT}`);
});

await purgeExpiredSessions();
const sweep = setInterval(() => void purgeExpiredSessions().catch(() => {}), 3600_000);

// Automatic priority rules: check every minute, and once right away.
const escalate = () =>
  void runEscalations().catch((e) => console.error(`[escalation] ${e?.message ?? e}`));
escalate();
const escalation = setInterval(escalate, 60_000);

const shutdown = () => {
  clearInterval(sweep);
  clearInterval(escalation);
  server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
