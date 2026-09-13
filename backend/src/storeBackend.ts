import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The storage primitive `JsonStore` (see store.ts) needs: read a named JSON
 * blob back with a fallback, or write one. Two implementations below, picked
 * automatically at startup by `selectStoreBackend()` — nothing else in the
 * codebase needs to know which one is active.
 */
export interface StoreBackend {
  readonly kind: "file" | "redis";
  readJson<T>(key: string, fallback: T): Promise<T>;
  writeJson<T>(key: string, value: T): Promise<void>;
}

/**
 * Plain on-disk JSON files. Durable on any host with a normal writable
 * filesystem (a VM, Render, Railway, Fly, local dev). On Vercel specifically,
 * the project root is read-only and only /tmp is writable — and /tmp is
 * wiped whenever a serverless instance recycles, so on Vercel this backend
 * is a per-instance cache, not durable storage (see docs/LIMITATIONS.md).
 * `selectStoreBackend()` only falls back to this on Vercel when no Redis
 * integration is configured.
 */
class FileBackend implements StoreBackend {
  readonly kind = "file";
  private readonly dataDir: string;

  constructor() {
    this.dataDir =
      process.env["AGENTPROOF_DATA_DIR"] ??
      (process.env["VERCEL"] ? "/tmp/agentproof-data" : join(__dirname, "..", "data"));
  }

  private pathFor(key: string): string {
    return join(this.dataDir, `${key}.json`);
  }

  async readJson<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.pathFor(key), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async writeJson<T>(key: string, value: T): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.pathFor(key), JSON.stringify(value, null, 2));
  }
}

/**
 * Upstash Redis, reached over its HTTP REST API (so it works from a
 * serverless function with no persistent connection). Unlike /tmp, this is
 * one shared store every instance reads and writes, so it's what actually
 * makes the evidence vault and audit timeline survive across requests and
 * cold starts on Vercel.
 *
 * Active automatically once a Redis integration is attached to the Vercel
 * project (dashboard → Storage → Marketplace Database Providers → a Redis
 * provider such as Upstash → Connect Project). That injects
 * KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN, depending on the integration) into the project's
 * environment variables — `Redis.fromEnv()` below reads whichever pair is
 * present. No code change needed beyond redeploying once it's attached.
 */
class RedisBackend implements StoreBackend {
  readonly kind = "redis";
  private client: import("@upstash/redis").Redis | null = null;

  private async getClient() {
    if (!this.client) {
      const { Redis } = await import("@upstash/redis");
      this.client = Redis.fromEnv();
    }
    return this.client;
  }

  async readJson<T>(key: string, fallback: T): Promise<T> {
    const client = await this.getClient();
    const value = await client.get<T>(key);
    return value ?? fallback;
  }

  async writeJson<T>(key: string, value: T): Promise<void> {
    const client = await this.getClient();
    await client.set(key, value);
  }
}

function hasRedisEnv(): boolean {
  const env = process.env;
  return Boolean(
    (env["KV_REST_API_URL"] && env["KV_REST_API_TOKEN"]) ||
      (env["UPSTASH_REDIS_REST_URL"] && env["UPSTASH_REDIS_REST_TOKEN"]),
  );
}

export function selectStoreBackend(): StoreBackend {
  return hasRedisEnv() ? new RedisBackend() : new FileBackend();
}
