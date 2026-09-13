import type { IncomingMessage, ServerResponse } from "node:http";
// Imports the *compiled* backend (see the root "vercel-build" script, which
// builds backend/ before frontend/) rather than backend/src directly, so
// Vercel's bundler traces a plain JS import graph instead of needing to
// resolve TypeScript project references across package boundaries. This
// path only exists after `npm run build --workspace backend` has run, which
// is why this file is deliberately outside every tsconfig's `include` in
// this repo — Vercel transpiles it standalone, per-file, at deploy time.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { app, init } = await import("../backend/dist/app.js");
  await init();
  app(req, res);
}
