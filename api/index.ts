import type { IncomingMessage, ServerResponse } from "node:http";
// Imports the *compiled* backend (see the root "vercel-build" script, which
// builds backend/ before frontend/) rather than backend/src directly, so
// Vercel's bundler traces a plain JS import graph instead of needing to
// resolve TypeScript project references across package boundaries. This
// path only exists after `npm run build --workspace backend` has run, which
// is why this file is deliberately outside every tsconfig's `include` in
// this repo — Vercel transpiles it standalone, per-file, at deploy time.
import { app, init } from "../backend/dist/app.js";

/**
 * Vercel serverless entrypoint. An Express app is itself a valid
 * `(req, res) => void` request handler, so no adapter library is needed —
 * this just makes sure one-time setup (loading the store, connecting the
 * CooL evidence plane) has run before the app sees its first request on a
 * cold start.
 *
 * See docs/LIMITATIONS.md for what "serverless" means for this demo's
 * persistence: /tmp on Vercel is per-instance and not durable across cold
 * starts, so the evidence vault here is a live demo, not a permanent record.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await init();
  app(req, res);
}
