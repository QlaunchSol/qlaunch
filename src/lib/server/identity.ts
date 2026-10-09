import "server-only";
import { check, db, usedLeaves, type IdentityRow } from "./db";

/** The public view of an identity: everything here is already public by design. */
export function identityJson(row: IdentityRow) {
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

export type IdentityJson = ReturnType<typeof identityJson>;

export async function identityDetail(row: IdentityRow) {
  const [leaves, launches] = await Promise.all([
    usedLeaves(row.id),
    db()
      .from("launches")
      .select("mint, name, symbol, image_url, leaf, status, created_at, launched_at")
      .eq("identity_id", row.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(check),
  ]);
  return { identity: identityJson(row), usedLeaves: leaves, launches };
}
