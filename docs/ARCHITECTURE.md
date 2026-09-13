# Architecture

The demo below is deliberately grounded in a concrete Indian payments scenario: an autonomous
agent making a UPI payment against a pre-authorized spend limit, echoing NPCI's agent-verification
registry initiative reported by Reuters (10 Sep 2026) — the kind of setting where "prove what the
agent actually did" stops being optional.

```text
USER / ADMIN
     |
     v
AGENTPROOF FRONTEND  (React + TypeScript, Vite)
  - Agent console            GET  /api/agent
  - Run agent                POST /api/agent/execute
  - Evidence vault           GET  /api/evidence[/:id]
  - Evidence receipt         + tamper test  POST /api/evidence/:id/tamper
  - Verification center      POST /api/verify[/:id]
  - Audit timeline           GET  /api/audit
     |
     v  REST / JSON
AGENTPROOF BACKEND  (Express + TypeScript)
  - src/agent.ts       command parsing, the 3-step payment workflow
  - src/coolClient.ts  the single CooL client instance
  - src/tamper.ts      tamper-test evidence generator
  - src/store.ts       JSON-file persistence (executions, evidence)
  - src/server.ts      route wiring, validation (zod), error handling
     |
     v
COOL SDK  (cool-nwc, vendored as vendor/cool-nwc-3.0.0.tgz)
  - cool.record()        seals evidence: commits metadata/payloads as salted
                          hashes, signs with ML-DSA-65 + Ed25519, appends to
                          an in-memory RFC 6962 transparency log
  - verifyEvidence()      the independent verifier: recomputes the binding
                          hash, checks both signatures, checks inclusion,
                          reports attestation/enclave/anchor status
     |
     v
VERIFIABLE EVIDENCE  (cool.receipt.v2 JSON — self-contained, offline-verifiable)
```

## Request flow: one agent execution

1. `POST /api/agent/execute { command: "Pay ₹2,500 to ABC Traders" }`
2. `parseCommand()` extracts `{ amount: 2500, currency: "INR", recipient: "ABC Traders" }`.
3. Three steps run in sequence, sharing one `executionId`:
   - `upi.payment.requested` — metadata carries only non-sensitive routing info (`agent_id`,
     `currency`, `channel`); the amount/recipient go into `payloads.input`, which CooL commits as
     a salted hash and discards.
   - `upi.risk.check.completed` — a deterministic policy check (see [Limitations](LIMITATIONS.md))
     decides `allow` or `block`.
   - `upi.payment.executed` (or `upi.payment.blocked`) — the outcome, similarly committed.
4. Each step calls `cool.record(...)`, which returns a full `cool.receipt.v2` evidence object.
   AgentProof stores that receipt as-is, plus a small non-sensitive "operational summary" (the
   amount, recipient, decision) in its own JSON store — **this summary is AgentProof's own business
   record, not part of the CooL evidence**. The distinction matters: delete AgentProof's database
   and the receipts still verify; the receipts alone don't reconstruct what a real payments
   platform needs to reconcile its own books.
5. The execution and its steps are returned to the frontend, which can immediately open any step's
   receipt.

## Verification

`POST /api/verify/:recordId` and `POST /api/verify` both call `verifyEvidence()` directly, with no
caching — every request re-runs the real seven-domain check:

`binding`, `signature`, `inclusion`, `witnesses`, `attestation`, `enclave`, `anchor`.

The audit timeline (`GET /api/audit`) does the same for every record on every request, by design —
"actual verifier runs" was a hard requirement, not "verifier ran once at write time."

## The tamper demo

`POST /api/evidence/:recordId/tamper` clones the stored `cool.receipt.v2`, flips one hex digit of
`record.event.metadata_hash` (the SDK's own `npm run demo` uses this exact technique), and re-runs
`verifyEvidence()` on both the untouched original and the corrupted clone. Because the binding hash
and both signatures are computed over the record's canonical CBOR — which includes
`metadata_hash` — this single-digit change is enough to fail `binding` and `signature` while
leaving `inclusion` (which is about the log, not the record's own bytes) unaffected. That mixed
result is intentional: it shows the verifier failing exactly the domains that should fail and nothing
else, which is more convincing than an all-red result would be.

The tampered clone is stored as its own evidence entry (`origin: "tamper-test"`, prefixed
`tampered-`), linked back to the original via `tamperOfRecordId`. It never overwrites the original.

## Running against real hardware

Everything above uses CooL's built-in simulator (`attestation.provider` unset). To run against a
real Phala dstack confidential VM instead, the only change needed is in `backend/src/coolClient.ts`:

```ts
export const cool = new CooL({
  applicationId: "agentproof-payment-agent",
  attestation: { provider: "dstack", endpoint: process.env.COOL_DSTACK_ENDPOINT },
  security: { requireAttestation: true },
});
```

With `requireAttestation: true`, a simulated receipt can never verify `ok`, and the app refuses to
start unless a real hardware quote backs the evidence plane — see the SDK's own
[`docs/dstack.md`](../vendor/../.) (bundled inside the original `cool-sdk-main.zip`) for standing up
the guest agent. AgentProof does not bundle or require dstack itself; this is a documented
config change, not a rewrite.

## Why a JSON file store, not a database

The brief allows "SQLite or a clean local persistence abstraction." AgentProof uses a small,
dependency-free JSON-file store (`src/store.ts`) instead of `better-sqlite3` specifically so
`npm install` never depends on a native-module prebuild succeeding on a judge's machine. The store
is behind a small interface (`saveExecution`, `getExecution`, `saveEvidence`, `getEvidence`, ...),
so swapping in SQLite later is a contained change, not a rewrite of the routes.
