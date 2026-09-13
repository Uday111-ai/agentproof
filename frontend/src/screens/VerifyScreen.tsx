import { useState } from "react";
import { api, type Verdict } from "../api";
import { VerdictPill } from "../components/StatusPill";
import { VerdictChecksGrid, VerdictReasons } from "../components/VerdictChecksGrid";

export function VerifyScreen() {
  const [recordId, setRecordId] = useState("");
  const [raw, setRaw] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verifyById() {
    if (!recordId.trim()) return;
    setBusy(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await api.verifyRecord(recordId.trim());
      setVerdict(res.verdict);
    } catch (e) {
      setError(e instanceof Error ? e.message : "verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPasted() {
    setBusy(true);
    setError(null);
    setVerdict(null);
    try {
      const parsed = JSON.parse(raw);
      const evidence = parsed.evidence ?? parsed;
      const res = await api.verifyRaw(evidence);
      setVerdict(res.verdict);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "That isn't valid JSON — paste a full cool.receipt.v2 evidence object."
          : e instanceof Error
            ? e.message
            : "verification failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-eyebrow">verification center</div>
        <h1 className="page-title">Verification center</h1>
        <p className="page-sub">
          Runs the real CooL verifier — the same one <code>cool verify</code> runs from the command
          line. Every result comes from the actual seven-domain check; nothing here is a hardcoded
          status.
        </p>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-title">Verify a record AgentProof holds</div>
          <label className="field-label" htmlFor="rid">
            Record ID
          </label>
          <input
            id="rid"
            className="text-input"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            placeholder="01M2CW6FGE8E4E90R5GPCNHRRJ"
            onKeyDown={(e) => e.key === "Enter" && verifyById()}
          />
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={verifyById} disabled={busy || !recordId.trim()}>
              {busy && <span className="spinner" />}
              Verify
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Verify evidence from elsewhere</div>
          <label className="field-label" htmlFor="raw">
            Paste a cool.receipt.v2 JSON object
          </label>
          <textarea
            id="raw"
            className="text-input"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='{ "schema": "cool.receipt.v2", "record": { ... }, ... }'
          />
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={verifyPasted} disabled={busy || !raw.trim()}>
              {busy && <span className="spinner" />}
              Verify pasted evidence
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>
            This runs fully offline against the keys embedded in the receipt itself — no account,
            no trust in AgentProof required. Copy the raw JSON from any evidence receipt's vault
            view to try it.
          </p>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}

      {verdict && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title">
            Verdict
            <VerdictPill ok={verdict.ok} />
          </div>
          {verdict.subject && (
            <dl className="kv-grid" style={{ marginBottom: 18 }}>
              <dt>Subject</dt>
              <dd>{verdict.subject.subject}</dd>
              <dt>Record ID</dt>
              <dd>{verdict.subject.record_id}</dd>
              <dt>Signer</dt>
              <dd>{verdict.subject.key_id}</dd>
              <dt>Runtime</dt>
              <dd>{verdict.subject.tee}</dd>
            </dl>
          )}
          <VerdictChecksGrid verdict={verdict} />
          <VerdictReasons verdict={verdict} />
        </div>
      )}
    </div>
  );
}
