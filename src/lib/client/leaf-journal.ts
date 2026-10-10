"use client";

import { LEAVES } from "@/lib/pq";

/**
 * Every one-time key this browser has signed with, and the digest it signed,
 * kept for good in localStorage. Written BEFORE a signature leaves the page,
 * so no failure, reload, second tab or stale server view can ever make the
 * browser sign a different digest with the same key: two WOTS signatures from
 * one key let anyone who sees both forge messages. Re-signing the identical
 * digest (a retried launch) is harmless and allowed.
 */
type Journal = Record<string, string>; // leaf → digest hex

const storageKey = (address: string) => `pq:signed-keys:${address}`;

function read(address: string): Journal {
  try {
    return JSON.parse(localStorage.getItem(storageKey(address)) ?? "{}") as Journal;
  } catch {
    return {};
  }
}

export function signedKeys(address: string): Map<number, string> {
  return new Map(Object.entries(read(address)).map(([leaf, digest]) => [Number(leaf), digest]));
}

/** Records that `leaf` signs `digest`. Throws if it already signed something else. */
export function recordSignature(address: string, leaf: number, digest: string) {
  const journal = read(address);
  const prior = journal[leaf];
  if (prior && prior !== digest) throw new Error(`One-time key #${leaf} already signed something else in this browser; refusing to reuse it.`);
  journal[leaf] = digest;
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(journal));
  } catch {
    throw new Error("This browser can't store which one-time keys it has used (storage is blocked or full), so signing is disabled.");
  }
}

/** Marks a key as spent elsewhere (seen on chain or in the registry) so it is never chosen again. */
export function markSpent(address: string, leaf: number) {
  const journal = read(address);
  if (journal[leaf]) return;
  journal[leaf] = "spent";
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(journal));
  } catch {}
}

/** Lowest key that neither the registry nor this browser has used. */
export function freshLeaf(address: string, serverUsed: Set<number>): number | null {
  const mine = signedKeys(address);
  for (let i = 1; i < LEAVES; i++) if (!serverUsed.has(i) && !mine.has(i)) return i;
  return null;
}

/**
 * Runs `fn` holding this identity's key lock, shared by every tab of this
 * origin (Web Locks), so two tabs can't pick the same key at the same time.
 */
export async function withKeyLock<T>(address: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return fn();
  return locks.request(`pq-keys:${address}`, fn);
}
