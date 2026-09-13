import { app, init } from "./app.js";

/**
 * Local / traditional-host entrypoint (Render, Railway, Fly, a VM, `npm run
 * dev`, ...). Not used by the Vercel deployment — see api/index.ts for that.
 */
const PORT = Number(process.env["PORT"] ?? 4000);

async function main(): Promise<void> {
  await init();
  app.listen(PORT, () => {
    console.log(`AgentProof backend listening on http://localhost:${PORT}`);
  });
}

main().catch((error: unknown) => {
  console.error("[agentproof] fatal startup error:", error);
  process.exit(1);
});
