import type { DomainStatus } from "../api";

const LABEL: Record<DomainStatus, string> = {
  pass: "pass",
  fail: "failed",
  absent: "absent",
  mock: "absent",
  simulated: "simulated",
  pending: "pending",
};

export function StatusPill({ status }: { status: DomainStatus }) {
  return (
    <span className={`pill ${status}`}>
      <span className="pill-dot" />
      {LABEL[status]}
    </span>
  );
}

export function VerdictPill({ ok }: { ok: boolean }) {
  return (
    <span className={`pill ${ok ? "pass" : "fail"}`}>
      <span className="pill-dot" />
      {ok ? "verified" : "invalid"}
    </span>
  );
}
