import "server-only";
import { deleteUpload, failLaunchesBefore, pendingLaunchesSince, sql, unusedUploadsBefore } from "./db";
import { configured } from "./env";
import { confirmLaunch } from "./launch";
import { refreshAll, refreshCoins } from "./market";
import { unpin } from "./pinata";

/**
 * Launches whose browser tab closed between signing and confirmation stay
 * "pending": list them once chain matches their attestation (confirmLaunch
 * checks creator, metadata and signer). Pending for over a day: failed, and
 * their metadata unpinned.
 */
async function reconcilePending() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  for (const launch of await pendingLaunchesSince(since)) {
    const status = await confirmLaunch(launch).catch(() => "pending");
    if (status === "live") {
      await refreshCoins([launch.mint]).catch(() => {});
      console.log("reconciled launch", launch.mint);
    }
  }
  for (const failed of await failLaunchesBefore(since)) {
    if (failed.metadata_pin_id) await unpin(failed.metadata_pin_id);
    // Its image becomes an ordinary unused upload again, unless another launch uses it.
    await sql()`update uploads set used_at = null where url = (select image_url from launches where mint = ${failed.mint})
      and not exists (select 1 from launches l where l.image_url = uploads.url and l.status in ('live', 'pending'))`;
  }
}

/** Images uploaded but never launched with: unpinned after 6 hours. No free image hosting. */
async function collectUploads() {
  const before = new Date(Date.now() - 6 * 3600_000).toISOString();
  for (const u of await unusedUploadsBefore(before)) {
    if (await unpin(u.pin_id)) await deleteUpload(u.cid);
  }
}

function every(ms: number, name: string, job: () => Promise<void>) {
  const run = () => job().catch((err) => console.warn(`${name}:`, err instanceof Error ? err.message : err));
  setTimeout(run, 5_000);
  setInterval(run, ms).unref();
}

let started = false;
export function startJobs() {
  if (started || !configured.db()) return;
  started = true;
  every(60_000, "market", refreshAll);
  every(30_000, "reconcile", reconcilePending);
  if (configured.pinata()) every(15 * 60_000, "uploads", collectUploads);
  console.log("background jobs started");
}
