import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate this test run's data directory before any module that touches the
// store is imported.
const dataDir = await mkdtemp(join(tmpdir(), "agentproof-test-"));
process.env["AGENTPROOF_DATA_DIR"] = dataDir;

const { runPaymentAgent, parseCommand, UnparseableCommandError } = await import("../src/agent.js");
const { store } = await import("../src/store.js");
const { buildTamperedEvidence } = await import("../src/tamper.js");
const { verifyEvidence } = await import("cool-nwc");

before(async () => {
  await store.load();
});

after(async () => {
  // The store's writer is fire-and-forget; give its queued disk writes a
  // moment to settle before cleaning up the temp directory.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test("parseCommand extracts amount, currency and recipient", () => {
  const action = parseCommand("Pay ₹2,500 to ABC Traders");
  assert.equal(action.amount, 2500);
  assert.equal(action.currency, "INR");
  assert.equal(action.recipient, "ABC Traders");
});

test("parseCommand rejects an unparseable instruction", () => {
  assert.throws(() => parseCommand("transfer some money please"), UnparseableCommandError);
});

test("runPaymentAgent produces a completed execution with verifiable evidence for a normal amount", async () => {
  const execution = await runPaymentAgent("Pay ₹2,500 to ABC Traders");
  assert.equal(execution.status, "completed");
  assert.equal(execution.steps.length, 3);

  for (const step of execution.steps) {
    const entry = store.getEvidence(step.recordId);
    assert.ok(entry, `evidence for ${step.type} should be persisted`);
    const verdict = await verifyEvidence(entry.evidence);
    assert.equal(verdict.ok, true, `step ${step.type} should verify`);
    assert.equal(verdict.checks.binding.status, "pass");
    assert.equal(verdict.checks.signature.status, "pass");
  }
});

test("runPaymentAgent blocks payments above the auto-approval threshold", async () => {
  const execution = await runPaymentAgent("Pay ₹250,000 to Offshore Holdings");
  assert.equal(execution.status, "blocked");
  const types = execution.steps.map((s) => s.type);
  assert.deepEqual(types, ["upi.payment.requested", "upi.risk.check.completed", "upi.payment.blocked"]);
});

test("tampering with evidence is caught by the verifier: original passes, tampered fails", async () => {
  const execution = await runPaymentAgent("Pay ₹2,500 to ABC Traders");
  const paymentStep = execution.steps.find((s) => s.type === "upi.payment.executed");
  assert.ok(paymentStep);

  const original = store.getEvidence(paymentStep.recordId);
  assert.ok(original);

  const originalVerdict = await verifyEvidence(original.evidence);
  assert.equal(originalVerdict.ok, true);

  const { entry } = buildTamperedEvidence(original, 25_000);
  const tamperedVerdict = await verifyEvidence(entry.evidence);

  assert.equal(tamperedVerdict.ok, false);
  assert.equal(tamperedVerdict.checks.binding.status, "fail");
  assert.equal(tamperedVerdict.checks.signature.status, "fail");
});

test("no plaintext amount or recipient is ever present in a stored evidence receipt's JSON", async () => {
  const execution = await runPaymentAgent("Pay ₹9,999 to Zephyr Consulting");
  const entries = store.listEvidenceForExecution(execution.executionId);
  for (const entry of entries) {
    const serialised = JSON.stringify(entry.evidence);
    assert.ok(!serialised.includes("9999"), "raw amount must not appear in the receipt");
    assert.ok(!serialised.includes("Zephyr Consulting"), "raw recipient must not appear in the receipt");
  }
});
