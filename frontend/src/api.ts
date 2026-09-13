/* Mirrors the backend's response shapes closely enough for the UI's needs.
   Kept intentionally loose on the raw evidence payload (`unknown`-ish) since
   that's the SDK's own receipt structure, rendered largely as-is. */

export type StepType =
  | "upi.payment.requested"
  | "upi.risk.check.completed"
  | "upi.payment.executed"
  | "upi.payment.blocked"
  | "refund.requested";

export type StepOutcome = "ok" | "blocked" | "error";

export interface ExecutionStep {
  stepId: string;
  type: StepType;
  label: string;
  recordId: string;
  executionId: string;
  digest: string;
  createdAt: string;
  outcome: StepOutcome;
  summary: Record<string, unknown>;
}

export type ExecutionStatus = "completed" | "blocked" | "failed";

export interface PaymentAction {
  amount: number;
  currency: string;
  recipient: string;
  rawCommand: string;
}

export interface AgentExecution {
  executionId: string;
  agentId: string;
  requestText: string;
  action: PaymentAction;
  status: ExecutionStatus;
  createdAt: string;
  steps: ExecutionStep[];
}

export type DomainStatus = "pass" | "fail" | "absent" | "mock" | "simulated" | "pending";

export interface DomainCheck {
  status: DomainStatus;
  detail: string;
}

export interface VerdictChecks {
  binding: DomainCheck;
  signature: DomainCheck;
  inclusion: DomainCheck;
  witnesses: DomainCheck;
  attestation: DomainCheck;
  enclave: DomainCheck;
  anchor: DomainCheck;
}

export interface VerdictSubject {
  kind: "evidence" | "change";
  subject: string;
  issued_at: string;
  record_id: string;
  key_id: string;
  tee: string;
}

export interface Verdict {
  ok: boolean;
  schema: string;
  subject: VerdictSubject | null;
  checks: VerdictChecks;
  reasons: string[];
}

export type EvidenceOrigin = "live" | "tamper-test";

export interface EvidenceSummaryEntry {
  recordId: string;
  executionId: string;
  stepType: StepType;
  label: string;
  createdAt: string;
  origin: EvidenceOrigin;
  tamperOfRecordId: string | null;
  summary: Record<string, unknown>;
}

export interface EvidenceRecordEntry extends EvidenceSummaryEntry {
  // The raw cool.receipt.v2 envelope, straight from the SDK.
  evidence: Record<string, unknown>;
}

// Which committed field is being opened. Mirrors the SDK's own union, but
// AgentProof only ever offers "input" / "output" — see disclosure.ts.
export type DisclosableField = "input" | "output" | "state" | "metadata" | "change.before" | "change.after";

export interface Disclosure {
  schema: "cool.disclosure.v1";
  record_id: string;
  binding_hash: string;
  field: DisclosableField;
  value: string;
  salt: string;
  commitment: string;
}

export interface DisclosureVerdict {
  ok: boolean;
  field: DisclosableField;
  detail: string;
}

export interface AuditTimelineEntry extends EvidenceSummaryEntry {
  verdict: Verdict;
}

export interface AgentConsoleSummary {
  agentId: string;
  software: { name: string; version: string; digest: string | null };
  environment: {
    provider: "local" | "dstack";
    mode: string;
    vendor: string;
    appId: string;
    instanceId: string;
    hardware: boolean;
  };
  totals: {
    executions: number;
    evidenceRecords: number;
    completed: number;
    blocked: number;
  };
  recentExecutions: AgentExecution[];
}

// Same-origin "/api" works for local dev (via the Vite proxy) and for the
// combined Vercel deployment (frontend + serverless API on one domain). Set
// VITE_API_URL at build time only if the backend is deployed separately
// (e.g. frontend on Vercel, backend on Render/Railway) — see DEPLOYMENT.md.
const BASE = `${import.meta.env["VITE_API_URL"] ?? ""}/api`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? body.error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getAgent: () => request<AgentConsoleSummary>("/agent"),
  listExecutions: () => request<AgentExecution[]>("/executions"),
  getExecution: (id: string) =>
    request<{ execution: AgentExecution; evidence: EvidenceRecordEntry[] }>(`/executions/${id}`),
  executeAgent: (command: string) =>
    request<AgentExecution>("/agent/execute", { method: "POST", body: JSON.stringify({ command }) }),
  listEvidence: () => request<EvidenceSummaryEntry[]>("/evidence"),
  getEvidence: (recordId: string) => request<EvidenceRecordEntry>(`/evidence/${recordId}`),
  getDisclosableFields: (recordId: string) =>
    request<{ fields: DisclosableField[] }>(`/evidence/${recordId}/disclosable-fields`),
  discloseField: (recordId: string, field: DisclosableField) =>
    request<{ disclosure: Disclosure; verdict: DisclosureVerdict }>(`/evidence/${recordId}/disclose`, {
      method: "POST",
      body: JSON.stringify({ field }),
    }),
  verifyRecord: (recordId: string) => request<{ recordId: string; verdict: Verdict }>(`/verify/${recordId}`, { method: "POST" }),
  verifyRaw: (evidence: unknown) =>
    request<{ verdict: Verdict }>("/verify", { method: "POST", body: JSON.stringify({ evidence }) }),
  tamperEvidence: (recordId: string, claimedAmount: number) =>
    request<{
      tamperedRecordId: string;
      tamperedField: string;
      before: string;
      after: string;
      original: { recordId: string; verdict: Verdict };
      tampered: { recordId: string; verdict: Verdict };
    }>(`/evidence/${recordId}/tamper`, { method: "POST", body: JSON.stringify({ claimedAmount }) }),
  getAudit: () => request<AuditTimelineEntry[]>("/audit"),
};

export const DOMAIN_ORDER: (keyof VerdictChecks)[] = [
  "binding",
  "signature",
  "inclusion",
  "witnesses",
  "attestation",
  "enclave",
  "anchor",
];

export function formatCurrency(amount: number, currency: string): string {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${amount.toLocaleString()} ${currency}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shorten(id: string, head = 8, tail = 6): string {
  if (id.length <= head + tail + 3) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}
