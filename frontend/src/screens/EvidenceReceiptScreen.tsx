import { Fragment, useEffect, useState } from "react";
import {
  api,
  formatCurrency,
  formatTime,
  type DisclosableField,
  type Disclosure,
  type DisclosureVerdict,
  type EvidenceRecordEntry,
  type Verdict,
} from "../api";
import { HashText } from "../components/HashText";
import { VerdictChecksGrid, VerdictReasons } from "../components/VerdictChecksGrid";
import { VerdictPill } from "../components/StatusPill";

interface TamperResult {
  tamperedRecordId: string;
  tamperedField: string;
  before: string;
  after: string;
  original: { recordId: string; verdict: Verdict };
  tampered: { recordId: string; verdict: Verdict };
}

const DISCLOSE_FIELD_LABEL: Record<DisclosableField, string> = {
  input: "Reveal input",
  output: "Reveal output",
  state: "Reveal state",
  metadata: "Reveal metadata",
  "change.before": "Reveal change (before)",
  "change.after": "Reveal change (after)",
};

// Narrow, defensive readers over the raw cool.receipt.v2 JSON — this is the
// SDK's own shape, rendered close to as-is rather than re-modelled here.
function read(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function EvidenceReceiptScreen({ recordId }: { recordId: string }) {
  const [entry, setEntry] = useState<EvidenceRecordEntry | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [tamperResult, setTamperResult] = useState<TamperResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [disclosableFields, setDisclosableFields] = useState<DisclosableField[]>([]);
  const [disclosing, setDisclosing] = useState<DisclosableField | null>(null);
  const [disclosures, setDisclosures] = useState<
    Partial<Record<DisclosableField, { disclosure: Disclosure; verdict: DisclosureVerdict }>>
  >({});
  const [discloseError, setDiscloseError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setTamperResult(null);
    setDisclosableFields([]);
    setDisclosures({});
    setDiscloseError(null);
    try {
      const e = await api.getEvidence(recordId);
      setEntry(e);
      const v = await api.verifyRecord(recordId);
      setVerdict(v.verdict);
      if (e.origin === "live") {
        const { fields } = await api.getDisclosableFields(recordId);
        setDisclosableFields(fields);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load this evidence record");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  async function reverify() {
    setVerifying(true);
    try {
      const v = await api.verifyRecord(recordId);
      setVerdict(v.verdict);
    } catch (e) {
      setError(e instanceof Error ? e.message : "verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function runTamperTest() {
    if (!entry) return;
    setTampering(true);
    setError(null);
    try {
      const claimed = (Number(entry.summary["amount"]) || 2500) * 10;
      const result = await api.tamperEvidence(recordId, claimed);
      setTamperResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the tamper test failed to run");
    } finally {
      setTampering(false);
    }
  }

  async function revealField(field: DisclosableField) {
    setDiscloseError(null);
    setDisclosing(field);
    try {
      const result = await api.discloseField(recordId, field);
      setDisclosures((prev) => ({ ...prev, [field]: result }));
    } catch (e) {
      setDiscloseError(e instanceof Error ? e.message : `revealing "${field}" failed`);
    } finally {
      setDisclosing(null);
    }
  }

  if (error && !entry) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Evidence receipt</h1>
        </div>
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="panel">
        <div className="empty-state">Loading evidence receipt…</div>
      </div>
    );
  }

  const record = entry.evidence["record"];
  const event = read(record, ["event"]);
  const runtime = read(record, ["runtime"]);
  const software = read(event, ["software"]);
  const commitments = read(event, ["commitments"]);
  const signature = read(record, ["signature"]);
  const attestation = entry.evidence["attestation"];
  const inclusion = entry.evidence["inclusion"];
  const bindingHash = String(entry.evidence["binding_hash"] ?? "");

  return (
    <div>
      <div className="page-head">
        <div className="page-eyebrow">evidence receipt</div>
        <h1 className="page-title">{entry.label}</h1>
        <p className="page-sub">
          A self-contained, offline-verifiable receipt. Nothing shown here — the record ID, the
          commitments, the signature — requires trusting AgentProof's own database; anyone holding
          this JSON can verify it independently.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid-2">
        <div>
          <div className="panel">
            <div className="panel-title">
              Verification verdict
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {verdict && <VerdictPill ok={verdict.ok} />}
                <button className="link-button" onClick={reverify} disabled={verifying}>
                  {verifying ? "Re-verifying…" : "Re-verify →"}
                </button>
              </div>
            </div>
            {verdict ? (
              <>
                <VerdictChecksGrid verdict={verdict} />
                <VerdictReasons verdict={verdict} />
              </>
            ) : (
              <div className="empty-state">Running the verifier…</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">Record</div>
            <dl className="kv-grid">
              <dt>Record ID</dt>
              <dd>
                <HashText value={entry.recordId} full />
              </dd>
              <dt>Execution ID</dt>
              <dd>
                <HashText value={entry.executionId} full />
              </dd>
              <dt>Application</dt>
              <dd>{String(read(event, ["application_id"]) ?? "—")}</dd>
              <dt>Event type</dt>
              <dd>{String(read(event, ["type"]) ?? "—")}</dd>
              <dt>Issued at</dt>
              <dd>{formatTime(String(read(record, ["time", "issued_at"]) ?? entry.createdAt))}</dd>
              <dt>Software</dt>
              <dd>
                {String(read(software, ["name"]) ?? "—")}@{String(read(software, ["version"]) ?? "—")}
              </dd>
              <dt>Runtime</dt>
              <dd>
                {String(read(runtime, ["tee_vendor"]) ?? "—")} · {String(read(runtime, ["mode"]) ?? "—")}
              </dd>
            </dl>
          </div>

          <div className="panel">
            <div className="panel-title">Commitments &amp; signature</div>
            <dl className="kv-grid">
              <dt>Metadata hash</dt>
              <dd>
                <HashText value={String(read(event, ["metadata_hash"]) ?? "—")} full />
              </dd>
              <dt>Input commitment</dt>
              <dd>{String(read(commitments, ["input"]) ?? "none")}</dd>
              <dt>Output commitment</dt>
              <dd>{String(read(commitments, ["output"]) ?? "none")}</dd>
              <dt>Binding hash</dt>
              <dd>
                <HashText value={bindingHash} full />
              </dd>
              <dt>Signature algorithm</dt>
              <dd>{String(read(signature, ["alg"]) ?? "—")}</dd>
              <dt>Key ID</dt>
              <dd>{String(read(signature, ["key_id"]) ?? "—")}</dd>
              <dt>Inclusion</dt>
              <dd>
                {inclusion
                  ? `leaf ${String(read(inclusion, ["leaf_index"]))} of tree size ${String(read(inclusion, ["tree_size"]))}`
                  : "absent"}
              </dd>
              <dt>Attestation mode</dt>
              <dd>{String(read(attestation, ["mode"]) ?? "—")}</dd>
            </dl>
            <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>
              No plaintext prompt, amount, or recipient is stored in this receipt — only salted
              commitments. AgentProof's own operational record (shown below) is what makes the
              console readable; the cryptographic proof stands on its own.
            </p>
          </div>

          <button className="link-button" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "Hide raw receipt JSON" : "View raw receipt JSON →"}
          </button>
          {showRaw && (
            <pre
              className="mono"
              style={{
                marginTop: 12,
                padding: 16,
                background: "var(--panel-raised)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                overflowX: "auto",
                fontSize: 11.5,
                maxHeight: 420,
              }}
            >
              {JSON.stringify(entry.evidence, null, 2)}
            </pre>
          )}
        </div>

        <div>
          <div className="panel">
            <div className="panel-title">AgentProof's operational record</div>
            <dl className="kv-grid">
              {Object.entries(entry.summary).map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>

          {entry.origin === "live" && disclosableFields.length > 0 && (
            <div className="panel">
              <div className="panel-title">Selective disclosure</div>
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Revealing a field proves it was committed to this receipt, without touching any
                other field — the rest stays hidden.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                {disclosableFields.map((field) => (
                  <button
                    key={field}
                    className="btn"
                    onClick={() => revealField(field)}
                    disabled={disclosing === field}
                  >
                    {disclosing === field && <span className="spinner" />}
                    {disclosing === field ? "Revealing…" : DISCLOSE_FIELD_LABEL[field]}
                  </button>
                ))}
              </div>

              {discloseError && (
                <div className="error-banner" style={{ marginTop: 14 }}>
                  {discloseError}
                </div>
              )}

              {disclosableFields
                .filter((field) => disclosures[field])
                .map((field) => {
                  const result = disclosures[field];
                  if (!result) return null;
                  return (
                    <div key={field} className="callout" style={{ marginTop: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <strong>{field}</strong>
                        <VerdictPill ok={result.verdict.ok} />
                      </div>
                      <dl className="kv-grid">
                        <dt>Value</dt>
                        <dd className="mono" style={{ wordBreak: "break-all" }}>
                          {result.disclosure.value}
                        </dd>
                        <dt>Salt</dt>
                        <dd>
                          <HashText value={result.disclosure.salt} full />
                        </dd>
                        <dt>Commitment</dt>
                        <dd>
                          <HashText value={result.disclosure.commitment} full />
                        </dd>
                      </dl>
                      <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>
                        {result.verdict.detail}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}

          {entry.origin === "live" && (
            <div className="panel">
              <div className="panel-title">Tamper test</div>
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Simulate someone editing this evidence after the fact —
                {typeof entry.summary["amount"] === "number"
                  ? ` claiming the payment was ${formatCurrency(Number(entry.summary["amount"]), "INR")} → ${formatCurrency(Number(entry.summary["amount"]) * 10, "INR")}`
                  : " altering its committed contents"}
                . AgentProof will corrupt one hex digit of the record's real commitment and re-run the
                actual CooL verifier on both copies — no simulated result.
              </p>
              <button className="btn danger" onClick={runTamperTest} disabled={tampering}>
                {tampering && <span className="spinner" />}
                {tampering ? "Running tamper test…" : "Run tamper test"}
              </button>

              {tamperResult && (
                <div style={{ marginTop: 18 }}>
                  <div className="callout fail" style={{ marginBottom: 14 }}>
                    Flipped one hex digit of <code>{tamperResult.tamperedField}</code>:
                    <div className="mono" style={{ marginTop: 8, fontSize: 11.5, wordBreak: "break-all" }}>
                      <div style={{ color: "var(--text-dim)" }}>{tamperResult.before}</div>
                      <div style={{ color: "var(--accent-fail)" }}>{tamperResult.after}</div>
                    </div>
                  </div>

                  <div className="two-col">
                    <div>
                      <div className="section-label" style={{ marginTop: 0 }}>
                        Original evidence
                      </div>
                      <VerdictPill ok={tamperResult.original.verdict.ok} />
                      <div style={{ marginTop: 10 }}>
                        <VerdictChecksGrid verdict={tamperResult.original.verdict} />
                      </div>
                    </div>
                    <div>
                      <div className="section-label" style={{ marginTop: 0 }}>
                        Tampered clone
                      </div>
                      <VerdictPill ok={tamperResult.tampered.verdict.ok} />
                      <div style={{ marginTop: 10 }}>
                        <VerdictChecksGrid verdict={tamperResult.tampered.verdict} />
                      </div>
                    </div>
                  </div>
                  <VerdictReasons verdict={tamperResult.tampered.verdict} />
                  <p className="dim" style={{ fontSize: 12.5, marginTop: 14 }}>
                    The tampered copy is saved to the evidence vault, labelled{" "}
                    <strong>tamper test</strong>, so it shows up in the audit timeline as invalid —
                    it never overwrites the original.
                  </p>
                </div>
              )}
            </div>
          )}

          {entry.origin === "tamper-test" && (
            <div className="callout warn">
              This is a deliberately corrupted clone created for the tamper demo. It is linked to{" "}
              <HashText value={entry.tamperOfRecordId ?? "—"} /> and will always fail verification —
              that's the point.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
