# AgentProof

**Cryptographic accountability for autonomous AI.**

> Prove what the agent did — without trusting its logs or exposing the underlying data.

🔗 **Live demo:** _add your Vercel URL here after deploying — see [DEPLOYMENT.md](DEPLOYMENT.md)_

🔗 **Repository:** https://github.com/Uday111-ai/agentproof

AgentProof is a working demo of an evidence layer for autonomous agents, built on the
[CooL SDK](https://github.com/Northwind-Cipher/cool-sdk) (`cool-nwc`). It watches a payment agent,
seals every consequential action it takes as independently verifiable cryptographic evidence, and
gives an auditor a way to check that evidence themselves — offline, without trusting AgentProof's
own database.

This is not a mockup. `POST /api/agent/execute` calls the real `cool.record()`; the Verification
Center calls the real `verifyEvidence()`; the tamper demo corrupts a real signed record and shows
the real verifier reject it.

---

## Why this exists

When an autonomous agent pays an invoice, approves a refund, or makes a decision with real
consequences, "check the logs" isn't good enough — logs are mutable, incomplete, and often the
very thing in dispute. The concrete case this demo builds around is a UPI payment made against a
pre-authorized spend limit, echoing NPCI's agent-verification registry initiative (Reuters, 10 Sep
2026): once agents can move money on their own, "trust the agent's own account of itself" stops
being an acceptable answer, and something has to be independently checkable. AgentProof's answer is
a receipt for every consequential step, sealed with hybrid post-quantum + classical signatures and
an append-only transparency log, that anyone can verify without an account and without seeing the
underlying data.

CooL is the cryptographic evidence layer underneath. AgentProof is the product built on top of it:
an operations console, an evidence vault, a verification center, and an audit timeline, wired
around one real workflow — an AI agent paying a vendor.

## What's real vs. what's simulated

Read this before the demo, and say it out loud during the demo — it's the difference between an
honest hackathon project and an overclaiming one.

- **Real**: the signatures (ML-DSA-65 + Ed25519), the salted commitments, the RFC 6962 transparency
  log and inclusion proofs, the binding hash, the verifier, and the tamper-detection you'll see
  fail. None of this is mocked in the UI layer — every verdict shown comes from calling CooL's
  actual verifier at request time.
- **Real**: selective disclosure. Committing a field as a salted hash is only half the story — an
  auditor also needs a way to see one field without seeing the rest. AgentProof calls the SDK's own
  `disclose()`/`verifyDisclosure()` to open the `input` and `output` fields of a live record and
  independently confirm the revealed plaintext matches the sealed commitment, in the Evidence
  receipt screen's **Selective disclosure** panel. `metadata` disclosure is deliberately not
  offered — see [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for why.
- **Simulated, and honestly labelled as such**: the TEE hardware attestation. Without a Phala
  dstack endpoint, CooL runs its built-in simulator — same code path, real signature *structure*,
  but the verifier reports `attestation: simulated` and `enclave: simulated`, never `pass`, on
  those two domains. AgentProof's UI shows that status as-is; it never upgrades `simulated` to
  `pass`. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how to point this at real
  hardware.
- **AgentProof does not prove the agent's decision was correct, fair, or safe** — only that the
  record of what it did hasn't been altered and was produced by the software it claims. That
  distinction is CooL's own, and AgentProof repeats it deliberately rather than blurring it.

## Quickstart

Requires Node.js ≥ 20.

```bash
git clone https://github.com/Uday111-ai/agentproof.git AgentProof && cd AgentProof
npm install               # npm workspaces install backend + frontend + the vendored CooL SDK
npm run dev                # starts the backend on :4000 and the frontend on :5173
```

Open **http://localhost:5173**. Go to **Run agent**, keep the default instruction
("Pay ₹2,500 to ABC Traders"), and click **Execute agent**.

Run the backend test suite separately:

```bash
npm test
```

### Manual / two-terminal start

```bash
npm run dev:backend    # terminal 1 — http://localhost:4000
npm run dev:frontend   # terminal 2 — http://localhost:5173 (proxies /api to :4000 in dev)
```

### Production-style build

```bash
npm run build
npm run start:backend                      # serves the API on :4000
npx --prefix frontend vite preview         # serves the built frontend
```

## The CooL SDK, vendored

The organizer-supplied `cool-sdk-main.zip` is built from source and packaged as
[`vendor/cool-nwc-3.0.0.tgz`](vendor/cool-nwc-3.0.0.tgz), which `backend/package.json` depends on
via `file:../vendor/cool-nwc-3.0.0.tgz`. This keeps the submission self-contained and reproducible
without needing a private registry. No SDK cryptography was reimplemented, patched, or mocked —
AgentProof only calls the public API documented in the SDK's own README (`CooL`, `cool.record()`,
`verifyEvidence()`).

## Project structure

```text
AgentProof/
├── backend/            Express + TypeScript API, calls the CooL SDK directly
│   ├── src/
│   │   ├── agent.ts         command parsing + the 3-step payment workflow
│   │   ├── coolClient.ts    the single CooL client instance
│   │   ├── tamper.ts        the tamper-test evidence generator
│   │   ├── store.ts         dependency-free JSON persistence
│   │   ├── types.ts         domain types
│   │   └── server.ts        REST routes
│   └── tests/          integration tests against the real SDK (no mocks)
├── frontend/           React + TypeScript console (Vite)
│   └── src/screens/    the five required product screens
├── vendor/             the built CooL SDK tarball, vendored for reproducibility
├── docs/               architecture, limitations, testing report
├── .env.example
└── DEMO.md             the 2–3 minute demo script
```

## The five screens

| Screen | Route in the app | What it shows |
|---|---|---|
| Agent Operations Console | `Agent console` | Agent identity, software version, evidence-plane environment, recent executions |
| Agent Execution | `Run agent` | Enter an instruction, watch the agent's steps seal evidence live |
| Evidence Receipt | opened from any record | Full receipt detail: commitments, signature, inclusion, verdict, and the tamper-test control |
| Verification Center | `Verification center` | Verify any record by ID, or paste raw evidence JSON from anywhere and verify it offline |
| Evidence Vault / Audit Timeline | `Evidence vault`, `Audit timeline` | Every record, in order, with a live (not cached) verdict per entry |

## API reference

All routes are under `/api`. Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/agent` | Console summary: identity, environment, totals, recent executions |
| `POST` | `/api/agent/execute` | Run the payment agent on a `{ command }` instruction |
| `GET` | `/api/executions` / `/api/executions/:id` | List / inspect executions |
| `GET` | `/api/evidence` / `/api/evidence/:recordId` | List / inspect evidence receipts |
| `POST` | `/api/evidence/:recordId/tamper` | Run the tamper demo against a record |
| `POST` | `/api/verify/:recordId` | Verify a stored record |
| `POST` | `/api/verify` | Verify an arbitrary pasted `{ evidence }` payload |
| `GET` | `/api/audit` | Full audit timeline with live verdicts |

## Testing

See [`docs/TESTING.md`](docs/TESTING.md) for the full report. Summary:

```bash
cd backend && npm run build && npm test
```

- 6/6 automated tests pass, including: a normal payment fully verifies; a high-value payment is
  genuinely blocked by the risk check; a tampered receipt is genuinely rejected by the real
  verifier (`binding: fail`, `signature: fail`); and raw amounts/recipients never appear in a
  serialized evidence receipt.
- Manual end-to-end pass documented with actual request/response transcripts.

## Limitations

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). Headline items: attestation runs in CooL's
simulator (no TEE hardware in this environment); persistence is a JSON file store sized for a
demo, not a production database; the risk engine is a deterministic stand-in, not a real model.

## Deploying

This repo is pre-configured to deploy as a single Vercel project (static frontend + the API as a
serverless function under `api/`). See [`DEPLOYMENT.md`](DEPLOYMENT.md) for exact steps, the
storage caveat that comes with serverless (`/tmp`), and the split-deployment option if you want a
persistent evidence vault.

## License

Apache-2.0, matching the underlying CooL SDK.
