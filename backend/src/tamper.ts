import { ulid } from "ulid";
import type { Evidence } from "cool-nwc";
import { store } from "./store.js";
import type { EvidenceRecordEntry } from "./types.js";

export class NotFoundError extends Error {}
export class NotEvidenceV1Error extends Error {}

const HEX_CHARS = "0123456789abcdef";

/** Flip a single hex nibble so the value changes but stays a well-formed multihash. */
function flipHexDigit(value: string): string {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const char = value[i]?.toLowerCase();
    if (char && HEX_CHARS.includes(char)) {
      const current = HEX_CHARS.indexOf(char);
      const next = HEX_CHARS[(current + 1) % HEX_CHARS.length];
      return value.slice(0, i) + next + value.slice(i + 1);
    }
  }
  throw new Error(`no hex digit found to flip in "${value}"`);
}

/**
 * Build a tampered clone of a stored evidence record by flipping one hex
 * digit of its `metadata_hash` — the same technique the CooL SDK's own
 * `npm run demo` uses. This mutates the signed core after the fact, so the
 * recomputed binding hash and both signatures stop matching: exactly the
 * failure mode a real attacker editing a mutable log would produce, except
 * here it's cryptographically detectable instead of silent.
 *
 * The claimed new amount is display-only, for the narrative ("someone
 * changed ₹2,500 to ₹25,000"); the actual bytes that get corrupted are the
 * evidence's own commitment, not a plaintext field, because CooL never
 * stored the plaintext amount in the first place.
 */
export function buildTamperedEvidence(
  original: EvidenceRecordEntry,
  claimedAmount: number,
): { entry: EvidenceRecordEntry; tamperedField: string; before: string; after: string } {
  const clone = structuredClone(original.evidence) as Evidence;
  if (clone.record.schema !== "cool.evidence.v1") {
    throw new NotEvidenceV1Error("tamper demo only supports cool.evidence.v1 records");
  }

  const before = clone.record.event.metadata_hash;
  const after = flipHexDigit(before);
  // Mutate through a structural cast — we're deliberately corrupting a signed
  // field to prove the verifier catches it, not modelling a legitimate write path.
  (clone.record.event as { metadata_hash: string }).metadata_hash = after;

  const entry: EvidenceRecordEntry = {
    recordId: `tampered-${ulid()}`,
    executionId: original.executionId,
    stepType: original.stepType,
    label: `${original.label} (tamper test)`,
    createdAt: new Date().toISOString(),
    origin: "tamper-test",
    tamperOfRecordId: original.recordId,
    summary: { ...original.summary, amount: claimedAmount, claimedTamper: true },
    evidence: clone,
    rawPayloads: original.rawPayloads,
  };

  return { entry, tamperedField: "record.event.metadata_hash", before, after };
}

export function getEvidenceOrThrow(recordId: string): EvidenceRecordEntry {
  const entry = store.getEvidence(recordId);
  if (!entry) throw new NotFoundError(`no evidence record with id "${recordId}"`);
  return entry;
}
