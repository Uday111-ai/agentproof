import { useEffect, useState } from "react";
import { api, formatTime, type EvidenceSummaryEntry } from "../api";
import { HashText } from "../components/HashText";

const LABEL: Record<string, string> = {
  live: "live evidence",
  "tamper-test": "tamper test",
};

export function EvidenceVaultScreen({ onOpen }: { onOpen: (recordId: string) => void }) {
  const [entries, setEntries] = useState<EvidenceSummaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setEntries(await api.listEvidence());
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load the evidence vault");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="page-head">
        <div className="page-eyebrow">evidence vault</div>
        <h1 className="page-title">Evidence vault</h1>
        <p className="page-sub">
          Every evidence record AgentProof has sealed through CooL. Each one is self-contained and
          independently verifiable — open a receipt to inspect its commitments, signature, and
          inclusion proof, or to run the tamper test.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        {!entries ? (
          <div className="empty-state">Loading evidence records…</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            No evidence yet. Run the agent to generate your first receipt.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Event</th>
                <th>Execution</th>
                <th>Origin</th>
                <th>Sealed at</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries
                .slice()
                .reverse()
                .map((e) => (
                  <tr key={e.recordId}>
                    <td className="mono">
                      <HashText value={e.recordId} />
                    </td>
                    <td>{e.label}</td>
                    <td className="mono dim">
                      <HashText value={e.executionId} />
                    </td>
                    <td>
                      <span className={`pill ${e.origin === "live" ? "pass" : "fail"}`}>
                        <span className="pill-dot" />
                        {LABEL[e.origin]}
                      </span>
                    </td>
                    <td className="mono dim">{formatTime(e.createdAt)}</td>
                    <td>
                      <button className="link-button" onClick={() => onOpen(e.recordId)}>
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
