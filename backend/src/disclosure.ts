import {
  disclosableFields as sdkDisclosableFields,
  disclose as sdkDisclose,
  verifyDisclosure as sdkVerifyDisclosure,
  type DisclosableField,
  type Disclosure,
  type DisclosureVerdict,
} from "cool-nwc/phala";
import type { EvidenceRecordEntry } from "./types.js";

export class UndisclosableFieldError extends Error {}

/**
 * Which fields of this record AgentProof can actually disclose.
 *
 * The SDK's own `disclosableFields()` will happily list `"metadata"` for any
 * `cool.evidence.v1` record, since the receipt always carries a metadata
 * commitment. But disclosing a field requires handing back the *exact* bytes
 * that were hashed into that commitment, and AgentProof only keeps that exact
 * string for `input` and `output` (see `rawPayloads` in agent.ts) — the
 * `metadata` commitment is over CooL's own internal CBOR canonicalisation of
 * the metadata object, not a string AgentProof built or stored. Guessing at
 * that encoding risks producing a disclosure that fails verification, which
 * per the SDK's own disclose.ts is worse than not offering the field at all.
 * So this list is intersected with the keys AgentProof actually has plaintext
 * for, never the SDK's raw answer.
 */
export function getDisclosableFields(entry: EvidenceRecordEntry): DisclosableField[] {
  const sdkFields = new Set(sdkDisclosableFields(entry.evidence));
  const available: DisclosableField[] = [];
  if (sdkFields.has("input") && entry.rawPayloads.input !== undefined) {
    available.push("input");
  }
  if (sdkFields.has("output") && entry.rawPayloads.output !== undefined) {
    available.push("output");
  }
  return available;
}

/**
 * Build and immediately verify a disclosure for one field of this record.
 *
 * Never returns a disclosure that fails its own verification — a disclosure
 * that doesn't check out looks exactly like evidence of tampering when it's
 * really a bug in AgentProof, so we throw instead of handing that back.
 */
export function discloseField(
  entry: EvidenceRecordEntry,
  field: DisclosableField,
): { disclosure: Disclosure; verdict: DisclosureVerdict } {
  const fields = getDisclosableFields(entry);
  if (!fields.includes(field)) {
    throw new UndisclosableFieldError(
      `field "${field}" is not disclosable for record "${entry.recordId}" — only ${
        fields.length > 0 ? fields.join(", ") : "no fields"
      } can be disclosed here`,
    );
  }

  const value = entry.rawPayloads[field as "input" | "output"];
  if (value === undefined) {
    // getDisclosableFields already guarantees this, but keep the narrowing explicit.
    throw new UndisclosableFieldError(`no stored plaintext for field "${field}" on record "${entry.recordId}"`);
  }

  const disclosure = sdkDisclose(entry.evidence, field, value);
  const verdict = sdkVerifyDisclosure(entry.evidence, disclosure);
  if (!verdict.ok) {
    // Should be unreachable given the byte-exact plaintext AgentProof stores,
    // but if it ever happens, surfacing it as a 5xx is far safer than handing
    // back a disclosure that looks like proof of tampering.
    throw new Error(`disclosure for field "${field}" on record "${entry.recordId}" failed verification: ${verdict.detail}`);
  }

  return { disclosure, verdict };
}
