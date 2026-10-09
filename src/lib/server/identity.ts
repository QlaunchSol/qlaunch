import "server-only";
import type { IdentityDetail, IdentityJson, IdentityLaunch } from "@/lib/types";
import { check, db, usedLeaves, type IdentityRow } from "./db";

/** The public view of an identity: everything here is already public by design. */
export function identityJson(row: IdentityRow): IdentityJson {
  return {
    address: row.pq_address,
    wallet: row.wallet,
    root: row.root,
    pubSeed: row.pub_seed,
    height: row.height,
    epoch: row.epoch,
    statement: row.statement,
    walletSignature: row.wallet_signature,
    registrationSignature: row.registration_signature,
    anchor: row.anchor_tx ? { tx: row.anchor_tx, slot: row.anchor_slot, at: row.anchored_at } : null,
    createdAt: row.created_at,
  };
}

export async function identityDetail(row: IdentityRow): Promise<IdentityDetail> {
  const [leaves, launches] = await Promise.all([
    usedLeaves(row.id),
    db()
      .from("launches")
      .select("mint, name, symbol, image_url, leaf, status, created_at, launched_at")
      .eq("identity_id", row.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then((r) => check(r) as IdentityLaunch[]),
  ]);
  return { identity: identityJson(row), usedLeaves: leaves, launches };
}
