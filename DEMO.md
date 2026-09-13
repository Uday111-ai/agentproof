# AgentProof — demo script

Target: 3 minutes. Run `npm run dev` first and have http://localhost:5173 open on
**Agent console**.

## 0:00–0:20 — The problem

> AI agents now pay invoices, approve refunds, and make consequential decisions. When one is
> disputed, "check the logs" isn't good enough — logs can be edited, and a screenshot proves
> nothing. AgentProof gives every consequential agent action a cryptographic receipt that anyone
> can verify independently, without trusting our database and without seeing the underlying data.

## 0:20–0:50 — Execute the agent

Go to **Run agent**. Keep the default instruction:

> Pay ₹2,500 to ABC Traders

Click **Execute agent**. Narrate as the three steps appear:

1. **Payment requested** — the instruction is parsed and sealed.
2. **Risk check completed** — a policy decision, also sealed, independent of the payment itself.
3. **Payment evidence recorded** — the settlement, sealed as its own record.

> Each of these three steps is a separate, independently verifiable receipt — sealed the moment it
> happened, not written to a log afterward.

## 0:50–1:20 — Open the evidence receipt

Click **View receipt →** on the "Payment evidence recorded" step. Point out:

- the record ID, execution ID, and software identity (`agentproof-payment-agent@1.4.0`)
- the metadata hash and commitments — salted hashes, not the plaintext amount
- the signature block (`ml-dsa-65+ed25519`) and the inclusion proof
- the verdict panel at the top, already `verified`, with all seven domains shown — not a single
  boolean

## 1:20–1:50 — Run verification

Click **Re-verify →** to show it re-running the actual verifier live. Then open **Verification
center** and paste the raw JSON from this receipt (use **View raw receipt JSON**) to show it
verifies **offline, from bytes alone** — no lookup against AgentProof's own database required.

## 1:50–2:15 — Selective disclosure

Still on the evidence receipt, scroll to **Selective disclosure** and click **Reveal input**.

> The receipt commits to the payment amount and recipient as a salted hash — it never stores them
> in the clear. But an auditor sometimes needs to see the actual value, not just proof that
> *something* was committed. Selective disclosure opens one field, and only one field, while
> everything else in the receipt stays sealed.

Point out the revealed value (the exact `{amount, recipient, currency}` JSON), the salt, and the
**verified** pill — AgentProof re-ran `verifyDisclosure()` itself before showing this, rather than
trusting its own reveal.

## 2:15–2:45 — Tamper test

Scroll to **Tamper test** and click **Run tamper test**.

> This flips one hex digit of the record's real cryptographic commitment — the same technique
> the CooL SDK's own test suite uses — and reruns the actual verifier on both the original and the
> tampered copy.

Show the two verdict panels side by side:

- **Original**: `binding: pass`, `signature: pass` → **verified**
- **Tampered**: `binding: fail`, `signature: fail` → **invalid**, with the exact failure reasons

> The evidence no longer matches its own cryptographic binding and signature. This isn't a status
> flag we flipped in the UI — it's what happens when you actually run the verifier against
> corrupted bytes.

## 2:45–3:10 — Audit timeline and close

Open **Audit timeline**. Point out the tampered clone sitting in the timeline, clearly marked
"(tamper test)" and shown invalid — it never overwrote the original, which still shows verified.

> AgentProof doesn't ask auditors to trust our logs. It gives them evidence they can independently
> verify.

## Optional: the blocked-payment path

If there's time, go back to **Run agent** and try:

> Pay ₹250,000 to Offshore Holdings

This exceeds the agent's auto-approval limit. The risk check step blocks it — and that block
decision is itself sealed as evidence, showing the audit trail covers "what the agent decided not
to do," not just successful payments.
