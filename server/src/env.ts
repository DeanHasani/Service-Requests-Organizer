import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see server/.env.example)'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(8),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Shared secret for the scheduled-job endpoints (/api/cron/*). Unset: those endpoints are off.
  CRON_SECRET: z.string().min(16).optional(),
  // Express "trust proxy": 'loopback' locally; a hop count (e.g. 1) behind Vercel's proxy.
  TRUST_PROXY: z
    .string()
    .default('loopback')
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v)),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
