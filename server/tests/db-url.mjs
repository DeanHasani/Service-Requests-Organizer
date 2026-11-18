// Test databases live in their own Postgres schemas ("test", "e2e") next to dev and live data,
// so a run never touches either. The base connection comes from TEST_DATABASE_BASE
// (environment, or server/.env).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));

/** Connection string for one schema, e.g. testDatabaseUrl('test'). */
export function testDatabaseUrl(schema) {
  const base =
    process.env.TEST_DATABASE_BASE ??
    (existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).TEST_DATABASE_BASE : undefined);
  if (!base) throw new Error('TEST_DATABASE_BASE is not set (see server/.env.example)');
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', '5');
  return url.toString();
}
