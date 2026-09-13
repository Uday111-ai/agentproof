import { DOMAIN_ORDER, type Verdict } from "../api";
import { StatusPill } from "./StatusPill";

export function VerdictChecksGrid({ verdict }: { verdict: Verdict }) {
  return (
    <div className="check-grid">
      {DOMAIN_ORDER.map((domain) => {
        const check = verdict.checks[domain];
        return (
          <div className="check-item" key={domain}>
            <div className="check-head">
              <span className="check-name">{domain}</span>
              <StatusPill status={check.status} />
            </div>
            <div className="check-detail">{check.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

export function VerdictReasons({ verdict }: { verdict: Verdict }) {
  if (verdict.ok || verdict.reasons.length === 0) return null;
  return (
    <div className="callout fail" style={{ marginTop: 14 }}>
      <strong style={{ color: "var(--accent-fail)" }}>Verification failed</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {verdict.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
