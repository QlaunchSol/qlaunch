import "server-only";
import type { IdentityDetail, IdentityJson } from "@/lib/types";
import { launchesOfIdentity, usedLeaves, type IdentityRow } from "./db";

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
  const [leaves, launches] = await Promise.all([usedLeaves(row.id), launchesOfIdentity(row.id)]);
  return { identity: identityJson(row), usedLeaves: [...leaves], launches: [...launches] };
}
