import { useEffect, useState } from "react";
import { api, formatTime, type AuditTimelineEntry } from "../api";
import { VerdictPill } from "../components/StatusPill";

export function AuditScreen({ onOpen }: { onOpen: (recordId: string) => void }) {
  const [entries, setEntries] = useState<AuditTimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await api.getAudit();
      setEntries(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load the audit timeline");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="page-head">
        <div className="page-eyebrow">audit timeline</div>
        <h1 className="page-title">Audit timeline</h1>
        <p className="page-sub">
          Every evidence record, in order, with a live verdict from the real CooL verifier — not a
          cached status. A tampered record shows up here as invalid the moment it exists.
        </p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => load(true)} disabled={refreshing}>
          {refreshing && <span className="spinner" />}
          {refreshing ? "Re-running verifier…" : "Re-run verification on all records"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        {!entries ? (
          <div className="empty-state">Loading the audit timeline…</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">Nothing to audit yet. Run the agent to create evidence.</div>
        ) : (
          <div className="timeline">
            {entries.map((e) => (
              <div className="timeline-row" key={e.recordId}>
                <div className="timeline-time">{formatTime(e.createdAt).split(",")[1]}</div>
                <div className="timeline-rail">
                  <div className={`timeline-node ${e.verdict.ok ? "pass" : "fail"}`} />
                </div>
                <div className="timeline-body">
                  <div className="label">
                    {e.label}
                    {e.origin === "tamper-test" && (
                      <span className="dim" style={{ fontSize: 12, marginLeft: 8 }}>
                        (tamper test)
                      </span>
                    )}
                  </div>
                  <div className="meta">
                    {Object.entries(e.summary)
                      .filter(([k]) => k !== "claimedTamper")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <VerdictPill ok={e.verdict.ok} />
                  <button className="link-button" onClick={() => onOpen(e.recordId)}>
                    Open →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
