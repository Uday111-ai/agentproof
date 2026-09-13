import { useState } from "react";
import { api, formatCurrency, formatTime, type AgentExecution } from "../api";
import { HashText } from "../components/HashText";
import type { Screen } from "../components/Sidebar";

const EXAMPLES = [
  "Pay ₹2,500 to ABC Traders",
  "Pay ₹18,750 to Nimbus Logistics",
  "Pay ₹250,000 to Offshore Holdings",
];

const OUTCOME_LABEL: Record<string, string> = {
  "upi.payment.requested": "Payment requested",
  "upi.risk.check.completed": "Risk check completed",
  "upi.payment.executed": "Payment settled",
  "upi.payment.blocked": "Payment blocked by policy",
};

export function ExecuteScreen({
  onOpenEvidence,
  onNavigate,
}: {
  onOpenEvidence: (recordId: string) => void;
  onNavigate: (s: Screen) => void;
}) {
  const [command, setCommand] = useState("Pay ₹2,500 to ABC Traders");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execution, setExecution] = useState<AgentExecution | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setExecution(null);
    try {
      const result = await api.executeAgent(command);
      setExecution(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the agent could not complete this instruction");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-eyebrow">agent execution</div>
        <h1 className="page-title">Run the payment agent</h1>
        <p className="page-sub">
          Give the agent a plain-language instruction. Every consequential step it takes — the
          request, the risk decision, the settlement — is sealed as independent CooL evidence as it
          happens, not written to a log after the fact.
        </p>
      </div>

      <div className="panel">
        <label className="field-label" htmlFor="command">
          Instruction
        </label>
        <input
          id="command"
          className="text-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Pay ₹2,500 to ABC Traders"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !running) run();
          }}
        />
        <div className="example-row">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => setCommand(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={run} disabled={running || command.trim().length === 0}>
            {running && <span className="spinner" />}
            {running ? "Executing…" : "Execute agent"}
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}

      {execution && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title">
            Execution {execution.executionId.slice(-10)}
            <span
              className={`pill ${execution.status === "completed" ? "pass" : execution.status === "blocked" ? "fail" : "simulated"}`}
            >
              <span className="pill-dot" />
              {execution.status}
            </span>
          </div>
          <p className="dim" style={{ fontSize: 13.5, marginTop: -6, marginBottom: 18 }}>
            "{execution.requestText}" · {formatCurrency(execution.action.amount, execution.action.currency)} to{" "}
            {execution.action.recipient}
          </p>

          <div className="timeline">
            {execution.steps.map((step) => (
              <div className="timeline-row" key={step.stepId}>
                <div className="timeline-time">{formatTime(step.createdAt).split(",")[1]}</div>
                <div className="timeline-rail">
                  <div
                    className={`timeline-node ${step.outcome === "ok" ? "pass" : step.outcome === "blocked" ? "fail" : "warn"}`}
                  />
                </div>
                <div className="timeline-body">
                  <div className="label">{OUTCOME_LABEL[step.type] ?? step.type}</div>
                  <div className="meta">
                    {Object.entries(step.summary)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </div>
                </div>
                <div>
                  <button className="link-button" onClick={() => onOpenEvidence(step.recordId)}>
                    View receipt →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {execution.status === "blocked" && (
            <div className="callout warn" style={{ marginTop: 16 }}>
              This payment exceeded the agent's auto-approval limit, so the risk check blocked it —
              and that decision is itself sealed as evidence, not just this run's outcome.
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <button className="link-button" onClick={() => onNavigate("audit")}>
              See this run in the audit timeline →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
