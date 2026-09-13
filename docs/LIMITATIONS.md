# Known limitations

Written deliberately, per the brief's "technical honesty is mandatory" instruction. None of these
are hidden in the UI — the console labels every simulated or non-hardware-backed status as such.

## Attestation is simulated

No Phala dstack endpoint is configured, so the evidence plane runs CooL's built-in simulator: real
signatures over a real quote *structure*, under a CooL-held root, clearly labelled `simulated` in
every receipt and every verdict. The `attestation` and `enclave` verdict domains report
`simulated`, never `pass`. This means AgentProof today proves **evidence integrity and software
provenance**, not **hardware-backed execution** — see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for
the (small) config change needed to point it at real hardware.

## AgentProof does not prove the agent's decision was correct

This is CooL's own stated boundary, and AgentProof inherits it rather than blurring it: a verified
receipt proves the recorded event happened and hasn't been altered. It says nothing about whether
paying ABC Traders ₹2,500 was the right decision, whether the recipient was legitimate, or whether
the agent's underlying model behaved well. Evidence and correctness are different claims.

## The risk check is a deterministic stand-in

`assessRisk()` in `backend/src/agent.ts` is a single threshold rule (block above ₹100,000), not a
real fraud or compliance model. It exists to demonstrate that policy decisions are evidenced
independently of the payment itself, and to give the demo a genuine "blocked" path — not to be a
credible risk engine.

## Persistence is a JSON file store, not a production database

See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md#why-a-json-file-store-not-a-database). Fine for a
demo and a handful of concurrent requests; not designed for concurrent writers, large evidence
volumes, or transactional guarantees. The store sits behind a small interface so this is a
contained swap later, not a rewrite.

## Witnesses and anchors are absent, honestly

No independent transparency witnesses co-sign the log, and no tree head has been anchored to a
public chain (e.g. via OpenTimestamps). The verifier reports both as `absent` rather than `pass` —
absence is reported accurately rather than omitted or glossed over.

## Command parsing is narrow by design

`parseCommand()` recognizes one sentence shape ("Pay ₹X to Y" and close variants). This is a demo
of one strong end-to-end workflow, not a general-purpose NLU layer — expanding it is a
well-contained change in one function, not an architectural one.

## Selective disclosure covers `input`/`output`, not `metadata`

The SDK's `disclose()` requires the exact byte sequence that was hashed into a commitment.
AgentProof stores that exact string for `input` and `output` — they're the plaintext it builds
itself and hands to `cool.record()`. The `metadata` commitment, by contrast, is computed over
CooL's own internal CBOR canonicalization of the metadata object (`canonicalCbor()`), not a string
AgentProof constructs or retains. Reproducing that encoding without being certain it's byte-exact
risks a disclosure that fails verification — which, per the SDK's own `disclose.ts` doc comment,
looks like evidence of tampering when it's really a bug. Rather than guess, AgentProof's
`getDisclosableFields()` never offers `metadata`, and the API rejects a request for it with a
clean `400`, not a false pass or a crash.

## Single-process, single-node transparency log

The transparency log CooL appends to lives in the same process as the API server (via the SDK's
in-memory log). A production deployment would run the evidence plane as its own service with
durable, replicated log storage; that's explicitly out of scope for an 8-hour build, per the brief.

## No authentication

There is no login or access control on the API — appropriate for a local demo, not for a
deployment. Anyone who can reach the port can execute the agent and read the evidence vault.
