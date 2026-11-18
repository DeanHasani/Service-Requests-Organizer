import { createApp } from './app';
import { purgeExpiredSessions } from './auth';
import { prisma } from './db';
import { env } from './env';
import { runDeadlineMonitor } from './deadlines/monitor';
import { DEADLINE_CONFIG } from './deadlines/config';

const server = createApp().listen(env.PORT, () => {
  console.log(`DESKFLOW API listening on http://localhost:${env.PORT}`);
});

await purgeExpiredSessions();
const sweep = setInterval(() => void purgeExpiredSessions().catch(() => {}), 3600_000);

// Deadline monitor: once at startup (catching up after a restart), then on a fixed interval.
// Its state lives in the database, so overlapping or repeated runs change nothing twice.
let monitoring = false;
const monitor = () => {
  if (monitoring) return;
  monitoring = true;
  void runDeadlineMonitor()
    .catch((e) => console.error(`[deadlines] ${e?.message ?? e}`))
    .finally(() => (monitoring = false));
};
monitor();
const escalation = setInterval(monitor, DEADLINE_CONFIG.intervalMs);

const shutdown = () => {
  clearInterval(sweep);
  clearInterval(escalation);
  server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
