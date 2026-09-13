import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate this test run's data directory before any module that touches the
// store is imported.
const dataDir = await mkdtemp(join(tmpdir(), "agentproof-disclosure-test-"));
process.env["AGENTPROOF_DATA_DIR"] = dataDir;

const { runPaymentAgent } = await import("../src/agent.js");
const { store } = await import("../src/store.js");
const { getDisclosableFields, discloseField, UndisclosableFieldError } = await import("../src/disclosure.js");

before(async () => {
  await store.load();
});

after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test("disclosing input on a live upi.payment.requested step verifies and reveals the committed plaintext", async () => {
  const execution = await runPaymentAgent("Pay ₹2,500 to ABC Traders");
  const requestedStep = execution.steps.find((s) => s.type === "upi.payment.requested");
  assert.ok(requestedStep);

  const entry = store.getEvidence(requestedStep.recordId);
  assert.ok(entry);
  assert.equal(entry.origin, "live");

  const fields = getDisclosableFields(entry);
  assert.ok(fields.includes("input"), "input should be disclosable on a live record with a payload");

  const { disclosure, verdict } = discloseField(entry, "input");
  assert.equal(verdict.ok, true);
  assert.equal(disclosure.field, "input");
  assert.equal(disclosure.record_id, entry.evidence.record.record_id);

  const revealed = JSON.parse(disclosure.value) as { amount: number; recipient: string; currency: string };
  assert.equal(revealed.amount, execution.action.amount);
  assert.equal(revealed.recipient, execution.action.recipient);
  assert.equal(revealed.currency, execution.action.currency);
});

test("disclosing output on a live upi.payment.executed step verifies and reveals the settlement result", async () => {
  const execution = await runPaymentAgent("Pay ₹3,100 to Northbridge Traders");
  const executedStep = execution.steps.find((s) => s.type === "upi.payment.executed");
  assert.ok(executedStep);

  const entry = store.getEvidence(executedStep.recordId);
  assert.ok(entry);

  const fields = getDisclosableFields(entry);
  assert.ok(fields.includes("output"), "output should be disclosable on the executed step");

  const { verdict, disclosure } = discloseField(entry, "output");
  assert.equal(verdict.ok, true);
  const revealed = JSON.parse(disclosure.value) as { status: string; settlementRef: string };
  assert.equal(revealed.status, "settled");
  assert.ok(revealed.settlementRef.length > 0);
});

test("requesting an unlisted field (metadata) fails cleanly, never with a false-positive verdict", async () => {
  const execution = await runPaymentAgent("Pay ₹1,200 to Kestrel Supplies");
  const requestedStep = execution.steps.find((s) => s.type === "upi.payment.requested");
  assert.ok(requestedStep);
  const entry = store.getEvidence(requestedStep.recordId);
  assert.ok(entry);

  const fields = getDisclosableFields(entry);
  assert.ok(!fields.includes("metadata"), "metadata must not be offered — AgentProof cannot reproduce its exact bytes");

  assert.throws(() => discloseField(entry, "metadata"), UndisclosableFieldError);
});

test("requesting a field with no stored plaintext (a step with no output payload) fails cleanly", async () => {
  const execution = await runPaymentAgent("Pay ₹1,200 to Kestrel Supplies");
  const requestedStep = execution.steps.find((s) => s.type === "upi.payment.requested");
  assert.ok(requestedStep);
  const entry = store.getEvidence(requestedStep.recordId);
  assert.ok(entry);

  // The upi.payment.requested step only records an `input` payload, not `output`.
  const fields = getDisclosableFields(entry);
  assert.ok(!fields.includes("output"));
  assert.throws(() => discloseField(entry, "output"), UndisclosableFieldError);
});
