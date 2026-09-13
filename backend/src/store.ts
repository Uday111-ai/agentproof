import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentExecution, EvidenceRecordEntry } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Vercel's filesystem is read-only except /tmp, and /tmp is wiped between
// cold starts — so on Vercel this store is a per-instance cache, not durable
// storage (see docs/LIMITATIONS.md). Everywhere else it's a normal on-disk
// JSON store that survives restarts.
const DATA_DIR =
  process.env["AGENTPROOF_DATA_DIR"] ?? (process.env["VERCEL"] ? "/tmp/agentproof-data" : join(__dirname, "..", "data"));
const EXECUTIONS_FILE = join(DATA_DIR, "executions.json");
const EVIDENCE_FILE = join(DATA_DIR, "evidence.json");

/**
 * A minimal, dependency-free persistence layer for AgentProof's own
 * operational data (executions, display summaries, and the raw CooL
 * receipts returned by `cool.record()`).
 *
 * This is deliberately NOT where cryptographic trust lives — that lives
 * inside each stored `Evidence` receipt, which is independently verifiable
 * on its own. This store just makes the console and audit views possible.
 */
class JsonStore {
  private executions = new Map<string, AgentExecution>();
  private evidence = new Map<string, EvidenceRecordEntry>();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    if (this.loaded) return;
    await mkdir(DATA_DIR, { recursive: true });
    this.executions = new Map(Object.entries(await this.readJson<Record<string, AgentExecution>>(EXECUTIONS_FILE, {})));
    this.evidence = new Map(Object.entries(await this.readJson<Record<string, EvidenceRecordEntry>>(EVIDENCE_FILE, {})));
    this.loaded = true;
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private persist(): void {
    this.writeQueue = this.writeQueue
      .then(() => writeFile(EXECUTIONS_FILE, JSON.stringify(Object.fromEntries(this.executions), null, 2)))
      .then(() => writeFile(EVIDENCE_FILE, JSON.stringify(Object.fromEntries(this.evidence), null, 2)))
      .catch((error) => {
        // Persistence failures never take the API down mid-response; the in-memory
        // state (and thus the running demo) stays authoritative for this process.
        console.error("[store] failed to persist to disk:", error);
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

export const store = new JsonStore();
