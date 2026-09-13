import type { Evidence, Verdict } from "cool-nwc";

/** The parsed payment instruction extracted from a natural-language command. */
export interface PaymentAction {
  readonly amount: number;
  readonly currency: "INR";
  readonly recipient: string;
  readonly rawCommand: string;
}

export type StepType =
  | "upi.payment.requested"
  | "upi.risk.check.completed"
  | "upi.payment.executed"
  | "upi.payment.blocked"
  | "refund.requested";

export type StepOutcome = "ok" | "blocked" | "error";

/** One evidence-producing step inside an agent execution. */
export interface ExecutionStep {
  readonly stepId: string;
  readonly type: StepType;
  readonly label: string;
  readonly recordId: string;
  readonly executionId: string;
  readonly digest: string;
  readonly createdAt: string;
  readonly outcome: StepOutcome;
  /** Non-sensitive summary shown in the console — never the evidence's committed plaintext. */
  readonly summary: Record<string, unknown>;
}

export type ExecutionStatus = "completed" | "blocked" | "failed";

/** A single agent run — one user instruction, one or more evidence steps. */
export interface AgentExecution {
  readonly executionId: string;
  readonly agentId: string;
  readonly requestText: string;
  readonly action: PaymentAction;
  readonly status: ExecutionStatus;
  readonly createdAt: string;
  readonly steps: ExecutionStep[];
}

export type EvidenceOrigin = "live" | "tamper-test";

/** An evidence record retained by AgentProof, wrapping the raw CooL receipt. */
export interface EvidenceRecordEntry {
  readonly recordId: string;
  readonly executionId: string;
  readonly stepType: StepType;
  readonly label: string;
  readonly createdAt: string;
  readonly origin: EvidenceOrigin;
  /** Set only on a tamper-test clone — points at the untouched original. */
  readonly tamperOfRecordId: string | null;
  /** What AgentProof's own operational data plane knows — not part of the CooL receipt. */
  readonly summary: Record<string, unknown>;
  readonly evidence: Evidence;
  /** The exact plaintext strings handed to cool.record()'s payloads, kept so a
   *  field can later be selectively disclosed. Never exposed by the list/summary
   *  endpoints — only via the explicit disclose endpoint. */
  readonly rawPayloads: { input?: string; output?: string };
}

export interface AuditTimelineEntry {
  readonly recordId: string;
  readonly executionId: string;
  readonly stepType: StepType;
  readonly label: string;
  readonly createdAt: string;
  readonly origin: EvidenceOrigin;
  readonly tamperOfRecordId: string | null;
  readonly summary: Record<string, unknown>;
  readonly verdict: Verdict;
}
