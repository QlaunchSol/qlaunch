import "server-only";
import { bondingCurvePda } from "@pump-fun/pump-sdk";
import { PublicKey } from "@solana/web3.js";
import { check, db, ok } from "./db";
import { configured } from "./env";
import { curveExists, markLive } from "./launch";
import { refreshAll, refreshCoins } from "./market";
import { connection } from "./solana";

/**
 * Launches whose browser tab closed between signing and confirmation stay
 * "pending". If the coin exists on chain, it's live: find its creation
 * signature and mark it. Pending for over a day with no coin: failed.
 */
async function reconcilePending() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const pending = check(
    await db().from("launches").select("mint, created_at").eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
  ) as { mint: string; created_at: string }[];
  for (const { mint } of pending) {
    if (!(await curveExists(mint))) continue;
    const sigs = await connection().getSignaturesForAddress(bondingCurvePda(new PublicKey(mint)), { limit: 1000 });
    await markLive(mint, sigs.at(-1)?.signature ?? null);
    await refreshCoins([mint]).catch(() => {});
    console.log("reconciled launch", mint);
  }
  ok(await db().from("launches").update({ status: "failed" }).eq("status", "pending").lt("created_at", since));
}

function every(ms: number, name: string, job: () => Promise<void>) {
  const run = () =>
    job().catch((err) => console.warn(`${name}:`, err instanceof Error ? err.message : err));
  setTimeout(run, 5_000);
  setInterval(run, ms).unref();
}

let started = false;
export function startJobs() {
  if (started || !configured.db()) return;
  started = true;
  every(60_000, "market", refreshAll);
  every(30_000, "reconcile", reconcilePending);
  console.log("background jobs started");
}
