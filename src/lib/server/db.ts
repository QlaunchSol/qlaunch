import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { identityFromHex, type PublicIdentity } from "@/lib/pq";
import { env } from "./env";
import { bad } from "./http";

let client: SupabaseClient | null = null;

/** Service-role client: bypasses RLS, server only. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 2 } },
    });
  }
  return client;
}

export type IdentityRow = {
  id: number;
  wallet: string;
  pq_address: string;
  root: string;
  pub_seed: string;
  height: number;
  epoch: number;
  statement: string;
  wallet_signature: string;
  registration_signature: string;
  anchor_tx: string | null;
  anchor_slot: number | null;
  anchored_at: string | null;
  created_at: string;
};

export type LaunchRow = {
  mint: string;
  identity_id: number;
  creator: string;
  pq_address: string;
  leaf: number;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  metadata_uri: string;
  twitter: string;
  telegram: string;
  website: string | null;
  digest: string;
  signature: string;
  dev_buy_sol: number;
  status: "pending" | "live" | "failed";
  tx_signature: string | null;
  created_at: string;
  launched_at: string | null;
};

export type CoinRow = Pick<
  LaunchRow,
  "mint" | "name" | "symbol" | "description" | "image_url" | "metadata_uri" | "twitter" | "telegram" | "creator" | "pq_address" | "leaf" | "dev_buy_sol" | "tx_signature" | "created_at" | "launched_at"
> & {
  price_usd: number | null;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  holders: number | null;
  curve_progress: number | null;
  complete: boolean;
  market_updated_at: string | null;
};

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Unwraps a query that must return data (lists, single rows, rpc). */
export function check<T>(result: Result<T>): T {
  if (result.error) throw new Error(`db: ${result.error.message}`);
  if (result.data === null) throw new Error("db: no data");
  return result.data;
}

/** Unwraps a maybeSingle() query: null when there is no such row. */
export function maybe<T>(result: Result<T>): T | null {
  if (result.error) throw new Error(`db: ${result.error.message}`);
  return result.data;
}

/** For writes that return nothing. */
export function ok(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(`db: ${result.error.message}`);
}

export async function identityByWallet(wallet: string): Promise<IdentityRow | null> {
  return maybe(await db().from("identities").select("*").eq("wallet", wallet).maybeSingle<IdentityRow>());
}

export async function identityByAddress(address: string): Promise<IdentityRow | null> {
  return maybe(await db().from("identities").select("*").eq("pq_address", address).maybeSingle<IdentityRow>());
}

export function publicIdentity(row: IdentityRow): PublicIdentity {
  const id = identityFromHex({ root: row.root, pubSeed: row.pub_seed, height: row.height, epoch: row.epoch });
  if (!id) throw new Error(`corrupt identity row ${row.id}`);
  return id;
}

export async function usedLeaves(identityId: number): Promise<{ leaf: number; purpose: string; ref: string | null; created_at: string }[]> {
  return check(await db().from("leaf_uses").select("leaf, purpose, ref, created_at").eq("identity_id", identityId).order("leaf"));
}

/**
 * Spends a one-time key. 'ok' = first use; 'same' = this exact digest already
 * spent it (a retried request); anything else refuses the request.
 */
export async function burnLeaf(p: { identityId: number; leaf: number; purpose: "register" | "launch" | "prove"; digest: string; ref: string | null }): Promise<"ok" | "same"> {
  const result = check(
    await db().rpc("burn_leaf", { p_identity: p.identityId, p_leaf: p.leaf, p_purpose: p.purpose, p_digest: p.digest, p_ref: p.ref }),
  ) as string;
  if (result === "ok" || result === "same") return result;
  return bad(`One-time key #${p.leaf} was already used. Refresh and try again with the next key.`, 409);
}
