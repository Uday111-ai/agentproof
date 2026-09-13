import type { AgentExecution, EvidenceRecordEntry } from "./types.js";
import { selectStoreBackend, type StoreBackend } from "./storeBackend.js";

/**
 * A minimal, dependency-free persistence layer for AgentProof's own
 * operational data (executions, display summaries, and the raw CooL
 * receipts returned by `cool.record()`).
 *
 * This is deliberately NOT where cryptographic trust lives — that lives
 * inside each stored `Evidence` receipt, which is independently verifiable
 * on its own. This store just makes the console and audit views possible.
 *
 * The actual read/write happens through a `StoreBackend` (see
 * storeBackend.ts) chosen once at startup: on-disk JSON files normally, or
 * Redis when a Redis integration is attached to the Vercel project — that's
 * what makes this survive across serverless instances instead of just
 * caching in one instance's /tmp.
 */
class JsonStore {
  private readonly backend: StoreBackend;
  private executions = new Map<string, AgentExecution>();
  private evidence = new Map<string, EvidenceRecordEntry>();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(backend: StoreBackend) {
    this.backend = backend;
  }

  /** "file" (default, per-instance on Vercel unless AGENTPROOF_DATA_DIR points
   *  somewhere durable) or "redis" (shared, durable — see storeBackend.ts). */
  get backendKind(): StoreBackend["kind"] {
    return this.backend.kind;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.executions = new Map(
      Object.entries(await this.backend.readJson<Record<string, AgentExecution>>("executions", {})),
    );
    this.evidence = new Map(
      Object.entries(await this.backend.readJson<Record<string, EvidenceRecordEntry>>("evidence", {})),
    );
    this.loaded = true;
  }

  private persist(): void {
    this.writeQueue = this.writeQueue
      .then(() => this.backend.writeJson("executions", Object.fromEntries(this.executions)))
      .then(() => this.backend.writeJson("evidence", Object.fromEntries(this.evidence)))
      .catch((error) => {
        // Persistence failures never take the API down mid-response; the in-memory
        // state (and thus the running demo) stays authoritative for this process.
        console.error("[store] failed to persist:", error);
      });
  }

  saveExecution(execution: AgentExecution): void {
    this.executions.set(execution.executionId, execution);
    this.persist();
  }

  getExecution(executionId: string): AgentExecution | undefined {
    return this.executions.get(executionId);
  }

  listExecutions(): AgentExecution[] {
    return [...this.executions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  saveEvidence(entry: EvidenceRecordEntry): void {
    this.evidence.set(entry.recordId, entry);
    this.persist();
  }

  getEvidence(recordId: string): EvidenceRecordEntry | undefined {
    return this.evidence.get(recordId);
  }

  listEvidence(): EvidenceRecordEntry[] {
    return [...this.evidence.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listEvidenceForExecution(executionId: string): EvidenceRecordEntry[] {
    return this.listEvidence().filter((e) => e.executionId === executionId);
  }
}

export const store = new JsonStore(selectStoreBackend());
