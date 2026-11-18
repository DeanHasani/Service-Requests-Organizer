// Builds the whole app for Vercel using the Build Output API (.vercel/output):
//   static/             the React client (client/dist)
//   functions/api.func  the Express API as one Node function, bundled with esbuild
//   config.json         routes: files first, /api/* to the function, everything else to the SPA
// See docs/deployment.md.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.vercel/output');
const fn = join(out, 'functions/api.func');
// Same region as the Supabase database (eu-west-1, Ireland), so queries stay close.
const region = process.env.FUNCTION_REGION ?? 'dub1';

rmSync(out, { recursive: true, force: true });

// 1. Client.
execSync('npm run build -w client', { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'client/dist'), join(out, 'static'), { recursive: true });

// 2. API function. Prisma stays external: it loads its query engine from its own folder.
await build({
  entryPoints: [join(root, 'server/src/vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@prisma/client', '.prisma/client'],
  // Some bundled CommonJS packages call require(); give ESM output a real one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
const req = createRequire(join(root, 'server/package.json'));
const prismaClient = dirname(req.resolve('@prisma/client/package.json'));
const generated = join(prismaClient, '../../.prisma/client');
if (!existsSync(generated)) throw new Error(`Generated Prisma client not found at ${generated}`);
cpSync(prismaClient, join(fn, 'node_modules/@prisma/client'), { recursive: true });
cpSync(generated, join(fn, 'node_modules/.prisma/client'), {
  recursive: true,
  // Only the Linux engine runs on Vercel; skip any Windows/macOS ones.
  filter: (src) => !/(windows|darwin)/.test(src),
});
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      maxDuration: 30,
      regions: [region],
    },
    null,
    2,
  ),
);

// 3. Routes.
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/.*', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Vercel output ready (function region ${region}).`);
