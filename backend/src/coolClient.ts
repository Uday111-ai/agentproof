import { CooL } from "cool-nwc";

/**
 * The single CooL client AgentProof's backend uses to seal evidence for every
 * consequential agent action. `applicationId` identifies AgentProof itself as
 * the software producing evidence — it is recorded in every receipt's
 * software-identity block.
 *
 * No `attestation.provider` is set, so this runs CooL's built-in simulator:
 * real signatures, a real quote *structure*, honestly labelled `simulated` in
 * every receipt and every verdict. Pointing this at a real Phala dstack
 * endpoint (`attestation: { provider: "dstack", endpoint: "..." }`) is the
 * only change needed to run against real TDX hardware — see docs/ARCHITECTURE.md.
 */
export const cool = new CooL({
  applicationId: "agentproof-payment-agent",
});

let readyPromise: Promise<void> | null = null;

/** Connect the evidence plane once, at server startup, so the first request isn't slow. */
export function ensureCoolReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = cool.ready().catch((error: unknown) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

export const SOFTWARE_IDENTITY = {
  name: "agentproof-payment-agent",
  version: "1.4.0",
  digest: null,
} as const;
