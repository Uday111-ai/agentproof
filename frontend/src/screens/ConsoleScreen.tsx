import { useEffect, useState } from "react";
import { api, formatCurrency, formatTime, type AgentConsoleSummary } from "../api";
import { HashText } from "../components/HashText";
import type { Screen } from "../components/Sidebar";

export function ConsoleScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [agent, setAgent] = useState<AgentConsoleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setAgent(await api.getAgent());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load agent console");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="page-head">
        <div className="page-eyebrow">agent operations</div>
        <h1 className="page-title">Agent console</h1>
        <p className="page-sub">
          Live status of the payment agent AgentProof watches — its software identity, the evidence
          plane it's connected to, and every consequential action it has taken.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!agent ? (
        <div className="panel">
          <div className="empty-state">Connecting to the agent console…</div>
        </div>
      ) : (
        <>
          <div className="grid-3">
            <div className="stat">
              <div className="stat-value">{agent.totals.executions}</div>
              <div className="stat-label">Agent executions</div>
            </div>
            <div className="stat">
              <div className="stat-value">{agent.totals.evidenceRecords}</div>
              <div className="stat-label">Evidence records sealed</div>
            </div>
            <div className="stat">
              <div className="stat-value">{agent.totals.blocked}</div>
              <div className="stat-label">Payments blocked by policy</div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-title">Agent identity</div>
            <dl className="kv-grid">
              <dt>Agent ID</dt>
              <dd>{agent.agentId}</dd>
              <dt>Software</dt>
              <dd>
                {agent.software.name}@{agent.software.version}
              </dd>
              <dt>Software digest</dt>
              <dd>{agent.software.digest ?? "not pinned (development image)"}</dd>
              <dt>Evidence plane</dt>
              <dd>
                {agent.environment.provider} · {agent.environment.mode} · {agent.environment.vendor}
              </dd>
              <dt>Application instance</dt>
              <dd>{agent.environment.instanceId}</dd>
              <dt>Hardware-backed</dt>
              <dd>{agent.environment.hardware ? "yes" : "no — simulator (see docs/LIMITATIONS.md)"}</dd>
              <dt>Data persistence</dt>
              <dd>
                {agent.persistence.backend === "redis"
                  ? "redis — durable across deployments"
                  : agent.persistence.durable
                    ? "local JSON files — durable on this host"
                    : "local JSON files — per-instance only on Vercel, not durable (attach a Redis integration)"}
              </dd>
            </dl>
          </div>

          <div className="panel">
            <div className="panel-title">
              Recent executions
              <button className="link-button" onClick={() => onNavigate("audit")}>
                View full audit timeline →
              </button>
            </div>
            {agent.recentExecutions.length === 0 ? (
              <div className="empty-state">
                No executions yet. Head to <strong>Run agent</strong> to give the agent an
                instruction.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Execution</th>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Steps</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.recentExecutions.map((ex) => (
                    <tr key={ex.executionId}>
                      <td className="mono">
                        <HashText value={ex.executionId} />
                      </td>
                      <td>{formatCurrency(ex.action.amount, ex.action.currency)} → {ex.action.recipient}</td>
                      <td>
                        <span className={`pill ${ex.status === "completed" ? "pass" : ex.status === "blocked" ? "fail" : "simulated"}`}>
                          <span className="pill-dot" />
                          {ex.status}
                        </span>
                      </td>
                      <td className="dim">{ex.steps.length}</td>
                      <td className="mono dim">{formatTime(ex.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
