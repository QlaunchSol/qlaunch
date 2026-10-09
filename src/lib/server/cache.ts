import "server-only";
import Redis from "ioredis";
import { env } from "./env";
import { bad } from "./http";

/**
 * Redis when REDIS_URL is set, otherwise a process-local map. One process
 * serves the site, so the fallback is correct, just not shared across restarts.
 */
let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = env.redisUrl();
  if (!url) return (client = null);
  client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  client.on("error", (e) => console.warn("redis:", e.message));
  return client;
}

const local = new Map<string, { value: string; expires: number }>();
const inflight = new Map<string, Promise<unknown>>();

async function getRaw(key: string): Promise<string | null> {
  const r = redis();
  if (r?.status === "ready") {
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
  const r = redis();
  if (r?.status === "ready") {
    try {
      await r.set(key, value, "PX", ttlMs);
      return;
    } catch {}
  }
  if (local.size > 5000) local.clear();
  local.set(key, { value, expires: Date.now() + ttlMs });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await getRaw(key);
  return raw == null ? null : (JSON.parse(raw) as T);
}

export const cacheSet = (key: string, value: unknown, ttlMs: number) => setRaw(key, JSON.stringify(value), ttlMs);

export async function cacheDel(key: string) {
  local.delete(key);
  const r = redis();
  if (r?.status === "ready") await r.del(key).catch(() => {});
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

/** Fixed-window rate limit. Throws a 429 when `key` has been seen more than `max` times in `windowSec`. */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const r = redis();
  let count: number;
  if (r?.status === "ready") {
    try {
      count = await r.incr(bucket);
      if (count === 1) await r.expire(bucket, windowSec + 1);
    } catch {
      return;
    }
  } else {
    const hit = local.get(bucket);
    count = (hit ? Number(hit.value) : 0) + 1;
    local.set(bucket, { value: String(count), expires: Date.now() + windowSec * 1000 });
  }
  if (count > max) bad("Too many requests. Slow down and try again in a minute.", 429);
}

/** One-shot values (challenges): returns the value and deletes it atomically. */
export async function take(key: string): Promise<string | null> {
  const r = redis();
  if (r?.status === "ready") {
    try {
      return await r.getdel(key);
    } catch {}
  }
  const hit = local.get(key);
  local.delete(key);
  return hit && hit.expires > Date.now() ? hit.value : null;
}

export const put = (key: string, value: string, ttlMs: number) => setRaw(key, value, ttlMs);
