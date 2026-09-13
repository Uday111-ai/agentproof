import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { verifyEvidence } from "cool-nwc";
import type { DisclosableField } from "cool-nwc/phala";
import { AGENT_ID, runPaymentAgent, UnparseableCommandError } from "./agent.js";
import { cool, ensureCoolReady, SOFTWARE_IDENTITY } from "./coolClient.js";
import { store } from "./store.js";
import { buildTamperedEvidence, getEvidenceOrThrow, NotEvidenceV1Error, NotFoundError } from "./tamper.js";
import { discloseField, getDisclosableFields, UndisclosableFieldError } from "./disclosure.js";
import type { AuditTimelineEntry, EvidenceRecordEntry } from "./types.js";

/** The full evidence entry, minus the plaintext AgentProof keeps for disclosure —
 *  that plaintext is never returned by list/summary/detail endpoints, only by
 *  the explicit disclose endpoint below. */
function toPublicEvidence(entry: EvidenceRecordEntry): Omit<EvidenceRecordEntry, "rawPayloads"> {
  const { rawPayloads: _rawPayloads, ...rest } = entry;
  return rest;
}

/**
 * The AgentProof API as a standalone Express app, with no `listen()` call.
 *
 * This is the one thing both entrypoints share:
 *  - `server.ts` calls `.listen()` on it for local development / a normal
 *    Node host (Render, Railway, Fly, a VM, ...).
 *  - `api/index.ts` hands it to Vercel's Node.js runtime, which invokes an
 *    Express app directly as a request handler — no adapter needed.
 *
 * `init()` does the one-time async setup (loading the store, connecting the
 * CooL evidence plane) and is idempotent, so either entrypoint can call it
 * as often as it needs to without double-initialising anything.
 */
export const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

let initPromise: Promise<void> | null = null;

export function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await store.load();
      try {
        await ensureCoolReady();
      } catch (error) {
        console.error(
          "[agentproof] CooL evidence plane failed to initialise — the app will still start, " +
            "but every /api/agent/execute call will fail until this is resolved:",
          error,
        );
      }
    })();
  }
  return initPromise;
}

// Every request waits for the one-time init to finish. On a warm serverless
// instance or a long-running Node process alike, this resolves immediately
// after the first call.
app.use((_req, _res, next) => {
  init()
    .then(() => next())
    .catch(next);
});

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/* ── Agent console ────────────────────────────────────────────────────── */

app.get(
  "/api/agent",
  asyncRoute(async (_req, res) => {
    const executions = store.listExecutions();
    const evidence = store.listEvidence();
    res.json({
      agentId: AGENT_ID,
      software: SOFTWARE_IDENTITY,
      environment: cool.environment,
      totals: {
        executions: executions.length,
        evidenceRecords: evidence.filter((e) => e.origin === "live").length,
        completed: executions.filter((e) => e.status === "completed").length,
        blocked: executions.filter((e) => e.status === "blocked").length,
      },
      recentExecutions: executions.slice(0, 8),
    });
  }),
);

/* ── Agent execution ──────────────────────────────────────────────────── */

const executeSchema = z.object({
  command: z.string().min(1, "command must not be empty").max(500),
});

app.post(
  "/api/agent/execute",
  asyncRoute(async (req, res) => {
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "malformed_request", details: parsed.error.flatten() });
      return;
    }
    try {
      const execution = await runPaymentAgent(parsed.data.command);
      res.status(201).json(execution);
    } catch (error) {
      if (error instanceof UnparseableCommandError) {
        res.status(400).json({ error: "unparseable_command", message: error.message });
        return;
      }
      throw error;
    }
  }),
);

app.get(
  "/api/executions",
  asyncRoute(async (_req, res) => {
    res.json(store.listExecutions());
  }),
);

app.get(
  "/api/executions/:id",
  asyncRoute(async (req, res) => {
    const execution = store.getExecution(String(req.params["id"]));
    if (!execution) {
      res.status(404).json({ error: "not_found", message: "no execution with that id" });
      return;
    }
    const evidence = store.listEvidenceForExecution(execution.executionId).map(toPublicEvidence);
    res.json({ execution, evidence });
  }),
);

/* ── Evidence vault ───────────────────────────────────────────────────── */

app.get(
  "/api/evidence",
  asyncRoute(async (_req, res) => {
    res.json(
      store.listEvidence().map((e) => ({
        recordId: e.recordId,
        executionId: e.executionId,
        stepType: e.stepType,
        label: e.label,
        createdAt: e.createdAt,
        origin: e.origin,
        tamperOfRecordId: e.tamperOfRecordId,
        summary: e.summary,
      })),
    );
  }),
);

app.get(
  "/api/evidence/:recordId",
  asyncRoute(async (req, res) => {
    try {
      const entry = getEvidenceOrThrow(String(req.params["recordId"]));
      res.json(toPublicEvidence(entry));
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: "evidence_not_found", message: error.message });
        return;
      }
      throw error;
    }
  }),
);

/* ── Selective disclosure ─────────────────────────────────────────────── */

app.get(
  "/api/evidence/:recordId/disclosable-fields",
  asyncRoute(async (req, res) => {
    try {
      const entry = getEvidenceOrThrow(String(req.params["recordId"]));
      res.json({ fields: getDisclosableFields(entry) });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: "evidence_not_found", message: error.message });
        return;
      }
      throw error;
    }
  }),
);

const DISCLOSABLE_FIELD_VALUES: readonly DisclosableField[] = [
  "input",
  "output",
  "state",
  "metadata",
  "change.before",
  "change.after",
];

const discloseSchema = z.object({
  field: z.enum(DISCLOSABLE_FIELD_VALUES as [DisclosableField, ...DisclosableField[]]),
});

app.post(
  "/api/evidence/:recordId/disclose",
  asyncRoute(async (req, res) => {
    const parsed = discloseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "malformed_request", details: parsed.error.flatten() });
      return;
    }
    try {
      const entry = getEvidenceOrThrow(String(req.params["recordId"]));
      const { disclosure, verdict } = discloseField(entry, parsed.data.field);
      res.json({ disclosure, verdict });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: "evidence_not_found", message: error.message });
        return;
      }
      if (error instanceof UndisclosableFieldError) {
        res.status(400).json({ error: "field_not_disclosable", message: error.message });
        return;
      }
      throw error;
    }
  }),
);

/* ── Tamper demo ──────────────────────────────────────────────────────── */

const tamperSchema = z.object({
  claimedAmount: z.number().positive(),
});

app.post(
  "/api/evidence/:recordId/tamper",
  asyncRoute(async (req, res) => {
    const parsed = tamperSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "malformed_request", details: parsed.error.flatten() });
      return;
    }
    try {
      const original = getEvidenceOrThrow(String(req.params["recordId"]));
      const { entry, tamperedField, before, after } = buildTamperedEvidence(original, parsed.data.claimedAmount);
      store.saveEvidence(entry);

      const [originalVerdict, tamperedVerdict] = await Promise.all([
        verifyEvidence(original.evidence),
        verifyEvidence(entry.evidence),
      ]);

      res.status(201).json({
        tamperedRecordId: entry.recordId,
        tamperedField,
        before,
        after,
        original: { recordId: original.recordId, verdict: originalVerdict },
        tampered: { recordId: entry.recordId, verdict: tamperedVerdict },
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: "evidence_not_found", message: error.message });
        return;
      }
      if (error instanceof NotEvidenceV1Error) {
        res.status(422).json({ error: "unsupported_evidence_schema", message: error.message });
        return;
      }
      throw error;
    }
  }),
);

/* ── Verification Center ──────────────────────────────────────────────── */

app.post(
  "/api/verify/:recordId",
  asyncRoute(async (req, res) => {
    try {
      const entry = getEvidenceOrThrow(String(req.params["recordId"]));
      const verdict = await verifyEvidence(entry.evidence);
      res.json({ recordId: entry.recordId, verdict });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: "evidence_not_found", message: error.message });
        return;
      }
      throw error;
    }
  }),
);

/** Verify arbitrary evidence JSON pasted by the caller — independent verification, no lookup needed. */
app.post(
  "/api/verify",
  asyncRoute(async (req, res) => {
    const body = req.body as unknown;
    if (!body || typeof body !== "object" || !("evidence" in (body as Record<string, unknown>))) {
      res.status(400).json({ error: "malformed_request", message: "expected { evidence: <cool.receipt.v2> }" });
      return;
    }
    const verdict = await verifyEvidence((body as { evidence: unknown }).evidence);
    res.json({ verdict });
  }),
);

/* ── Audit timeline ───────────────────────────────────────────────────── */

app.get(
  "/api/audit",
  asyncRoute(async (_req, res) => {
    const entries = store.listEvidence();
    const timeline: AuditTimelineEntry[] = await Promise.all(
      entries.map(async (e) => ({
        recordId: e.recordId,
        executionId: e.executionId,
        stepType: e.stepType,
        label: e.label,
        createdAt: e.createdAt,
        origin: e.origin,
        tamperOfRecordId: e.tamperOfRecordId,
        summary: e.summary,
        verdict: await verifyEvidence(e.evidence),
      })),
    );
    timeline.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    res.json(timeline);
  }),
);

/* ── Health ───────────────────────────────────────────────────────────── */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "agentproof-backend" });
});

/* ── Fallback + error handling ────────────────────────────────────────── */

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[agentproof] unhandled error:", error);
  res.status(500).json({
    error: "internal_error",
    message: error instanceof Error ? error.message : "unexpected error",
  });
});


