import "server-only";
import Redis from "ioredis";
import { env } from "./env";
import { bad } from "./http";

/**
 * Redis when REDIS_URL is set, otherwise a process-local map. One process
 * serves the site, so the fallback is correct, just not shared across restarts.
 */
// Process-wide state on globalThis: Next.js compiles routes separately, and a
// challenge stored by one route must be visible to the route that checks it.
const g = globalThis as typeof globalThis & {
  __redis?: Redis | null;
  __redisWasReady?: boolean;
  __cache?: Map<string, { value: string; expires: number }>;
  __inflight?: Map<string, Promise<unknown>>;
};

function redis(): Redis | null {
  if (g.__redis !== undefined) return g.__redis;
  const url = env.redisUrl();
  if (!url) return (g.__redis = null);
  const client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  client.on("error", (e) => console.warn("redis:", e.message));
  client.once("ready", () => (g.__redisWasReady = true));
  return (g.__redis = client);
}

/**
 * The Redis client if it is connected, else null. Right after a start the
 * first connection is still being made: wait for it (briefly) rather than
 * refuse fail-closed requests or split state between Redis and memory. Once
 * Redis has been up, an outage falls back immediately instead of stalling.
 */
async function connected(): Promise<Redis | null> {
  const r = redis();
  if (!r || r.status === "ready") return r;
  if (!g.__redisWasReady && r.status !== "end") {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        r.off("ready", done);
        resolve();
      };
      const timer = setTimeout(done, 2000);
      r.once("ready", done);
    });
  }
  // (status changed while waiting; TypeScript still holds the earlier narrowing)
  return (r.status as Redis["status"]) === "ready" ? r : null;
}

const local = (g.__cache ??= new Map());
const inflight = (g.__inflight ??= new Map());

/** Bounded in-process store: evicts the oldest entries, never wipes (counters and challenges must survive). */
function remember(key: string, value: string, ttlMs: number) {
  local.delete(key);
  local.set(key, { value, expires: Date.now() + ttlMs });
  if (local.size > 5000) {
    const now = Date.now();
    for (const [k, v] of local) if (v.expires <= now) local.delete(k);
    for (const k of local.keys()) {
      if (local.size <= 4500) break;
      local.delete(k);
    }
  }
}

async function getRaw(key: string): Promise<string | null> {
  const r = await connected();
  if (r) {
    try {
      return await r.get(key);
    } catch {}
  }
  const hit = local.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  local.delete(key);
  return null;
}

async function setRaw(key: string, value: string, ttlMs: number) {
  const r = await connected();
  if (r) {
    try {
      await r.set(key, value, "PX", ttlMs);
      return;
    } catch {}
  }
  remember(key, value, ttlMs);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await getRaw(key);
  return raw == null ? null : (JSON.parse(raw) as T);
}

export const cacheSet = (key: string, value: unknown, ttlMs: number) => setRaw(key, JSON.stringify(value), ttlMs);

export async function cacheDel(key: string) {
  local.delete(key);
  const r = await connected();
  if (r) await r.del(key).catch(() => {});
}

/** Read-through cache; concurrent misses for one key share a single fetch. */
export async function cached<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fetch()
    .then(async (value) => {
      if (value !== null && value !== undefined) await setRaw(key, JSON.stringify(value), ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Fixed-window rate limit. Throws a 429 when `key` has been seen more than
 * `max` times in `windowSec`. With `failClosed`, a Redis error refuses the
 * request instead of letting it through (for endpoints that cost money).
 */
export async function rateLimit(key: string, max: number, windowSec: number, { failClosed = false } = {}) {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const r = redis();
  let count: number;
  if (r) {
    try {
      const ready = await connected();
      if (!ready) throw new Error("redis not ready");
      count = await ready.incr(bucket);
      if (count === 1) await ready.expire(bucket, windowSec + 1);
    } catch {
      if (failClosed) bad("This is temporarily unavailable. Try again in a minute.", 503);
      return;
    }
  } else {
    const hit = local.get(bucket);
    count = (hit && hit.expires > Date.now() ? Number(hit.value) : 0) + 1;
    remember(bucket, String(count), windowSec * 1000);
  }
  if (count > max) bad(`Too many requests. Try again in ${windowSec >= 3600 ? "a while" : "a minute"}.`, 429);
}

/** One-shot values (challenges): returns the value and deletes it atomically. */
export async function take(key: string): Promise<string | null> {
  const r = await connected();
  let value: string | null = null;
  if (r) {
    try {
      value = await r.getdel(key);
    } catch {}
  }
  // Also memory: the value may have been stored while Redis was unreachable.
  const hit = local.get(key);
  local.delete(key);
  return value ?? (hit && hit.expires > Date.now() ? hit.value : null);
}

export const put = (key: string, value: string, ttlMs: number) => setRaw(key, value, ttlMs);
