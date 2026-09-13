# Testing report

This report only lists checks that were actually run against the real code in this submission —
per the brief, "only report a test as passed if it actually passed."

## Build

```bash
$ cd backend && npm install && npm run build
# tsc -p tsconfig.json — exits 0, no errors

$ cd frontend && npm install && npm run build
# tsc -b && vite build — exits 0
# dist/index.html, dist/assets/*.css, dist/assets/*.js produced
```

Both `tsc --noEmit` (backend) and `tsc -b` (frontend) pass with zero errors under `strict: true`.

## CooL SDK — built from the supplied source, not assumed

```bash
$ cd cool-sdk-main && npm install && npm run build
# cool-nwc: compiled and patched 82 files into dist/, copied 1 asset(s)

$ npm run demo
# demo OK — a clean record verifies, a tampered one does not, and no plaintext was stored.
```

The SDK's own demo was run before any AgentProof code was written, to confirm the exact API shape
(`CooL`, `cool.record()`, `verifyEvidence()`, the `ReceiptV2`/`Verdict` types) and the tamper
technique AgentProof's own tamper endpoint reuses (flipping one hex digit of `metadata_hash`).

## Backend automated tests

```bash
$ cd backend && npm test
```

```
ok 1 - parseCommand extracts amount, currency and recipient
ok 2 - parseCommand rejects an unparseable instruction
ok 3 - runPaymentAgent produces a completed execution with verifiable evidence for a normal amount
ok 4 - runPaymentAgent blocks payments above the auto-approval threshold
ok 5 - tampering with evidence is caught by the verifier: original passes, tampered fails
ok 6 - no plaintext amount or recipient is ever present in a stored evidence receipt's JSON
ok 7 - disclosing input on a live upi.payment.requested step verifies and reveals the committed plaintext
ok 8 - disclosing output on a live upi.payment.executed step verifies and reveals the settlement result
ok 9 - requesting an unlisted field (metadata) fails cleanly, never with a false-positive verdict
ok 10 - requesting a field with no stored plaintext (a step with no output payload) fails cleanly
# tests 10
# pass 10
# fail 0
```

Each test calls the real `cool.record()` / `verifyEvidence()` from the vendored SDK — nothing here
is mocked. Test 3 checks `binding: pass` and `signature: pass` on every step of a real execution.
Test 5 checks `binding: fail` and `signature: fail` on a tampered clone. Test 6 does a raw string
search over the serialized receipt JSON for the literal amount and recipient, to check the privacy
claim programmatically rather than just asserting it in prose. Tests 7–10 call the real
`disclose()`/`verifyDisclosure()` from the vendored SDK against a live record, checking both that
disclosure works (7, 8) and that it fails cleanly rather than producing a false-positive verdict
when the field isn't one AgentProof can honestly disclose (9, 10).

## Selective disclosure — live transcript

Run against `node dist/server.js` on port 4000, right after executing "Pay ₹2,500 to ABC Traders":

```
$ curl http://localhost:4000/api/evidence/01M2DV5P2DF355A4M7N36T87ZX/disclosable-fields
{"fields":["input"]}

$ curl -X POST http://localhost:4000/api/evidence/01M2DV5P2DF355A4M7N36T87ZX/disclose \
    -H 'content-type: application/json' -d '{"field":"input"}'
{
  "disclosure": {
    "schema": "cool.disclosure.v1",
    "record_id": "01M2DV5P2DF355A4M7N36T87ZX",
    "binding_hash": "mh:sha256:256bd3a0aed60dd1eda2d3ae46619399b802008ace2b6e4d0a6ada0ad1705ce8",
    "field": "input",
    "value": "{\"amount\":2500,\"recipient\":\"ABC Traders\",\"currency\":\"INR\"}",
    "salt": "hex:4146b534df47e70a4d47fbb0bdb82c72",
    "commitment": "mh:sha256:2d397d48ec6c29a17abe11efb9facb61f4e7aebc2a0e8fa297b8759012810640"
  },
  "verdict": {
    "ok": true,
    "field": "input",
    "detail": "the disclosed text is exactly what was committed as input"
  }
}

$ curl -X POST http://localhost:4000/api/evidence/01M2DV5P2DF355A4M7N36T87ZX/disclose \
    -H 'content-type: application/json' -d '{"field":"metadata"}'
# HTTP 400
{"error":"field_not_disclosable","message":"field \"metadata\" is not disclosable for record \"01M2DV5P2DF355A4M7N36T87ZX\" — only input can be disclosed here"}

$ curl http://localhost:4000/api/evidence/01M2DV5P2DF355A4M7N36T87ZX | python3 -c "import json,sys; print('rawPayloads' in json.load(sys.stdin))"
False
```

The last call confirms the fix made alongside this feature: the evidence-detail endpoint returns
the full stored entry except `rawPayloads` — the plaintext AgentProof keeps for disclosure is never
exposed by any route except the explicit `/disclose` endpoint, and only for a field that's actually
disclosable.

## Manual end-to-end verification (live transcript)

Run against `node dist/server.js` on port 4000:

**1. Execute a normal payment** — `POST /api/agent/execute {"command":"Pay ₹2,500 to ABC Traders"}`
→ `HTTP 201`, execution `status: "completed"`, 3 steps, each with a real `recordId` and `digest`.

**2. Verify the settlement step** — `POST /api/verify/:recordId` →

```json
"checks": {
  "binding":     { "status": "pass" },
  "signature":   { "status": "pass" },
  "inclusion":   { "status": "pass" },
  "witnesses":   { "status": "absent" },
  "attestation": { "status": "simulated" },
  "enclave":     { "status": "simulated" },
  "anchor":      { "status": "absent" }
},
"ok": true
```

**3. Tamper test** — `POST /api/evidence/:recordId/tamper {"claimedAmount":25000}` →

```json
"before": "mh:sha256:f2a2dcd9…5135d",
"after":  "mh:sha256:f2a2dcd9…5135e",
"original": { "verdict": { "ok": true } },
"tampered": {
  "verdict": {
    "ok": false,
    "checks": {
      "binding":   { "status": "fail" },
      "signature": { "status": "fail" }
    },
    "reasons": [
      "binding: recomputed binding_hash does not match the receipt",
      "signature: ML-DSA-65 and Ed25519 did not verify (record altered or wrong key)"
    ]
  }
}
```

This matches the SDK's own documented failure mode exactly.

**4. Audit timeline** — `GET /api/audit` → returns every record (including the tamper-test clone),
each with a freshly computed verdict (not a cached one), sorted by time.

**5. Frontend ↔ backend wiring** — `vite` dev server on `:5174` with `AGENTPROOF_API_URL` proxying
to the backend on `:4000`; `curl localhost:5174/api/agent` returns `HTTP 200` with the console
summary, confirming the proxy path the frontend actually uses in development works end to end.

## Functional checklist (brief §15)

- [x] clean install works (`npm run install:all`)
- [x] application starts (`npm run dev`)
- [x] agent execution works
- [x] CooL evidence is generated
- [x] evidence is persisted/retrievable (JSON store + `GET /api/evidence/:id`)
- [x] verification works
- [x] audit history works
- [x] tamper flow works
- [x] selective disclosure works (`input`/`output` reveal and verify; `metadata` is cleanly
      rejected, not silently mis-disclosed)

## Cryptographic checklist

- [x] original receipt verifies (`ok: true`, `binding`/`signature`/`inclusion` all `pass`)
- [x] modified protected evidence fails verification (`ok: false`)
- [x] binding failure is detected (`binding: fail`)
- [x] signature failure is detected (`signature: fail`)
- [x] UI reflects actual verifier results (no hardcoded verdict anywhere in the frontend — every
      verdict rendered comes from an API response)

## Privacy checklist

- [x] sensitive payloads (amount, recipient) are committed as salted hashes, not stored in the
      CooL evidence receipt (checked programmatically — see test 6 above)
- [x] AgentProof's own operational summary (used to render the console) is clearly labelled in the
      UI as separate from the cryptographic receipt, and documented as such in
      `docs/ARCHITECTURE.md`

## Error handling checklist

- [x] malformed request → `POST /api/agent/execute` with an empty/invalid `command` returns
      `400 { error: "malformed_request" }` (zod validation)
- [x] unparseable instruction → `400 { error: "unparseable_command" }`
- [x] missing evidence → `GET /api/evidence/:id` for an unknown id returns
      `404 { error: "evidence_not_found" }`
- [x] invalid evidence → `POST /api/verify` on malformed JSON returns a structured `ok: false`
      verdict from the real verifier (CooL's verifier never throws on malformed input — it reports
      failed domains instead)
- [x] verifier failure → surfaced as a normal failed verdict, not a 500
- [x] CooL initialization failure → caught at startup in `server.ts`; the process logs the failure
      and keeps serving read-only routes rather than crashing
- [x] unsupported/missing attestation → reported as `simulated`/`absent` by the verifier, not
      silently upgraded to `pass`

## What was not tested

- Real Phala dstack hardware attestation (no TDX hardware available in this environment — see
  `docs/LIMITATIONS.md`).
- Load/concurrency testing of the JSON file store.
- Cross-browser UI testing (verified in one Chromium-based environment only).
