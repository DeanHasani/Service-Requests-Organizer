// Vercel function entry: the same Express app, without the long-running timers in index.ts.
// Scheduled work (deadline monitor, session sweep) arrives through /api/cron/* instead.
import { createApp } from './app';

export default createApp();
