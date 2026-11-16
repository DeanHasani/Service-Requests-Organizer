import { createApp } from './app';
import { purgeExpiredSessions } from './auth';
import { prisma } from './db';
import { env } from './env';

const server = createApp().listen(env.PORT, () => {
  console.log(`DESKFLOW API listening on http://localhost:${env.PORT}`);
});

await purgeExpiredSessions();
const sweep = setInterval(() => void purgeExpiredSessions().catch(() => {}), 3600_000);

const shutdown = () => {
  clearInterval(sweep);
  server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
