import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The suite owns this throwaway file: start from an empty DB and apply migrations.
const dbFile = fileURLToPath(new URL('../prisma/test.db', import.meta.url));

export default function setup() {
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
