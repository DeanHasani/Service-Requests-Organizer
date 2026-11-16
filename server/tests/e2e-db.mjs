// Fresh, seeded database for the Playwright run. Owns only prisma/e2e.db.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const db = fileURLToPath(new URL('../prisma/e2e.db', import.meta.url));
for (const f of [db, `${db}-journal`]) rmSync(f, { force: true });
const env = { ...process.env, DATABASE_URL: 'file:./e2e.db', PRISMA_HIDE_UPDATE_MESSAGE: '1' };
execSync('npx prisma migrate deploy', { cwd: serverDir, env, stdio: 'inherit' });
execSync('npx tsx prisma/seed.ts', { cwd: serverDir, env, stdio: 'inherit' });
