import type { IncomingMessage, ServerResponse } from "node:http";
// Imports the *compiled* backend (see the root "vercel-build" script, which
// builds backend/ before frontend/) rather than backend/src directly, so
// Vercel's bundler traces a plain JS import graph instead of needing to
// resolve TypeScript project references across package boundaries. This
// path only exists after `npm run build --workspace backend` has run, which
// is why this file is deliberately outside every tsconfig's `include` in
// this repo — Vercel transpiles it standalone, per-file, at deploy time.
//
// This is a *dynamic* import rather than a static one deliberately: Vercel
// transpiles this file standalone to CommonJS, and a static `import` of an
// ES Module (which backend/dist/app.js is, per backend/package.json's
// "type": "module") gets compiled down into a `require()` call that Node
// cannot use to load ESM — it fails every invocation with ERR_REQUIRE_ESM.
// A dynamic `import()` works from CommonJS regardless of how this file gets
// transpiled, so it's the version that's safe to keep here long-term.
let modulePromise: ReturnType<typeof loadBackend> | null = null;

async function loadBackend() {
  return import("../backend/dist/app.js");
}

/**
 * Vercel serverless entrypoint. An Express app is itself a valid
 * `(req, res) => void` request handler, so no adapter library is needed —
 * this just makes sure one-time setup (loading the store, connecting the
 * CooL evidence plane) has run before the app sees its first request on a
 * cold start.
 *
 * See docs/LIMITATIONS.md for what "serverless" means for this demo's
 * persistence: by default /tmp on Vercel is per-instance and not durable
 * across cold starts. Attach a Redis integration (Vercel Marketplace →
 * Upstash for Redis) and the store automatically switches to it instead —
 * see backend/src/storeBackend.ts and .env.example.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!modulePromise) modulePromise = loadBackend();
  const { app, init } = await modulePromise;
  await init();
  app(req, res);
}
