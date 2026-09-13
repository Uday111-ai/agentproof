import { ulid } from "ulid";
import { cool, SOFTWARE_IDENTITY } from "./coolClient.js";
import { store } from "./store.js";
import type {
  AgentExecution,
  EvidenceRecordEntry,
  ExecutionStep,
  PaymentAction,
  StepType,
} from "./types.js";

export const AGENT_ID = "payment-agent-01";

export class UnparseableCommandError extends Error {
  constructor(command: string) {
    super(
      `Could not parse a payment instruction out of "${command}". ` +
        `Try something like "Pay ₹2,500 to ABC Traders".`,
    );
    this.name = "UnparseableCommandError";
  }
}

/**
 * Extract a payment instruction from a natural-language command.
 * Deliberately narrow — this is a demo agent for one workflow, not an NLU stack.
 */
export function parseCommand(command: string): PaymentAction {
  const trimmed = command.trim();
  const match = /pay\s+(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+)/i.exec(trimmed);
  if (!match) throw new UnparseableCommandError(command);

  const amountText = match[1]?.replace(/,/g, "") ?? "";
  const amount = Number.parseFloat(amountText);
  const recipient = match[2]?.trim().replace(/[.!]+$/, "") ?? "";

  if (!Number.isFinite(amount) || amount <= 0 || recipient.length === 0) {
    throw new UnparseableCommandError(command);
  }

  return { amount, currency: "INR", recipient, rawCommand: trimmed };
}

const HIGH_RISK_THRESHOLD = 100_000;

interface RiskDecision {
  readonly decision: "allow" | "block";
  readonly riskScore: number;
  readonly reason: string;
}

function assessRisk(action: PaymentAction): RiskDecision {
  // A small, deterministic stand-in for a real risk engine: large payments
  // get a higher score and are blocked past the threshold. Deterministic on
  // purpose, so the demo is reproducible run to run.
  const riskScore = Math.min(0.99, Math.round((action.amount / HIGH_RISK_THRESHOLD) * 100) / 100);
  if (action.amount > HIGH_RISK_THRESHOLD) {
    return {
      decision: "block",
      riskScore,
      reason: `amount exceeds the ₹${HIGH_RISK_THRESHOLD.toLocaleString("en-IN")} auto-approval limit`,
    };
  }
  return { decision: "allow", riskScore, reason: "within auto-approval limit and recipient checks passed" };
}

async function recordStep(params: {
  executionId: string;
  type: StepType;
  label: string;
  metadata: Record<string, unknown>;
  payloads?: { input?: string; output?: string };
  summary: Record<string, unknown>;
  outcome: ExecutionStep["outcome"];
}): Promise<ExecutionStep> {
  const { evidence, recordId, digest } = await cool.record({
    type: params.type,
    executionId: params.executionId,
    metadata: params.metadata,
    ...(params.payloads ? { payloads: params.payloads } : {}),
    software: SOFTWARE_IDENTITY,
  });

  const entry: EvidenceRecordEntry = {
    recordId,
    executionId: params.executionId,
    stepType: params.type,
    label: params.label,
    createdAt: new Date().toISOString(),
    origin: "live",
    tamperOfRecordId: null,
    summary: params.summary,
    evidence,
    rawPayloads: params.payloads ?? {},
  };
  store.saveEvidence(entry);

  return {
    stepId: ulid(),
    type: params.type,
    label: params.label,
    recordId,
    executionId: params.executionId,
    digest: String(digest),
    createdAt: entry.createdAt,
    outcome: params.outcome,
    summary: params.summary,
  };
}

/**
 * Run the payment agent end-to-end for one instruction: request -> risk check
 * -> execute (or block), sealing CooL evidence for every consequential step.
 */
export async function runPaymentAgent(command: string): Promise<AgentExecution> {
  const action = parseCommand(command);
  const executionId = ulid();
  const steps: ExecutionStep[] = [];

  steps.push(
    await recordStep({
      executionId,
      type: "upi.payment.requested",
      label: "Payment requested",
      metadata: {
        agent_id: AGENT_ID,
        currency: action.currency,
        channel: "chat-instruction",
      },
      payloads: {
        input: JSON.stringify({ amount: action.amount, recipient: action.recipient, currency: action.currency }),
      },
      summary: { amount: action.amount, currency: action.currency, recipient: action.recipient },
      outcome: "ok",
    }),
  );

  const risk = assessRisk(action);

  steps.push(
    await recordStep({
      executionId,
      type: "upi.risk.check.completed",
      label: "Risk check completed",
      metadata: {
        agent_id: AGENT_ID,
        policy: "payment-auto-approval-v1",
        decision: risk.decision,
        risk_score: risk.riskScore,
      },
      payloads: { output: JSON.stringify({ reason: risk.reason }) },
      summary: { decision: risk.decision, riskScore: risk.riskScore, reason: risk.reason },
      outcome: risk.decision === "allow" ? "ok" : "blocked",
    }),
  );

  if (risk.decision === "block") {
    steps.push(
      await recordStep({
        executionId,
        type: "upi.payment.blocked",
        label: "Payment blocked by policy",
        metadata: { agent_id: AGENT_ID, reason: risk.reason },
        payloads: {
          input: JSON.stringify({ amount: action.amount, recipient: action.recipient }),
        },
        summary: { amount: action.amount, recipient: action.recipient, reason: risk.reason },
        outcome: "blocked",
      }),
    );

    const execution: AgentExecution = {
      executionId,
      agentId: AGENT_ID,
      requestText: command,
      action,
      status: "blocked",
      createdAt: steps[0]?.createdAt ?? new Date().toISOString(),
      steps,
    };
    store.saveExecution(execution);
    return execution;
  }

  const settlementRef = `TXN-${executionId.slice(-8)}`;
  steps.push(
    await recordStep({
      executionId,
      type: "upi.payment.executed",
      label: "Payment evidence recorded",
      metadata: {
        agent_id: AGENT_ID,
        currency: action.currency,
        status: "settled",
      },
      payloads: {
        input: JSON.stringify({ amount: action.amount, recipient: action.recipient }),
        output: JSON.stringify({ status: "settled", settlementRef }),
      },
      summary: {
        amount: action.amount,
        currency: action.currency,
        recipient: action.recipient,
        status: "settled",
        settlementRef,
      },
      outcome: "ok",
    }),
  );

  const execution: AgentExecution = {
    executionId,
    agentId: AGENT_ID,
    requestText: command,
    action,
    status: "completed",
    createdAt: steps[0]?.createdAt ?? new Date().toISOString(),
    steps,
  };
  store.saveExecution(execution);
  return execution;
}
